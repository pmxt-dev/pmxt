'use strict';

/**
 * Generates openapi.yaml from BaseExchange.ts using the TypeScript compiler AST.
 * Run: node core/scripts/generate-openapi.js
 * Adding a public method to BaseExchange.ts is sufficient to include it in the spec.
 */

const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const BASE_EXCHANGE_PATH = path.join(__dirname, '../src/BaseExchange.ts');
const APP_TS_PATH = path.join(__dirname, '../src/server/exchange-factory.ts');
const OPENAPI_OUT_PATH = path.join(__dirname, '../src/server/openapi.yaml');
// Sidecar metadata consumed by the runtime server (app.ts) so the GET
// handler knows which methods are safe to expose as GET and how to
// translate query parameters into the positional `args` array that
// exchange methods expect.
const METHOD_VERBS_OUT_PATH = path.join(
    __dirname,
    '../src/server/method-verbs.json'
);
// Hosted docs output — Mintlify reads this JSON file for the API
// reference pages. Written alongside the sidecar YAML so a single
// `generate:openapi` invocation keeps both artefacts in sync.
const DOCS_OPENAPI_OUT_PATH = path.join(
    __dirname,
    '../../docs/api-reference/openapi.json'
);

// ---------------------------------------------------------------------------
// Hosted-context rewrites
//
// The sidecar spec is unauthenticated and points at localhost. For the
// hosted Mintlify docs we overlay the production URL, bearer auth, and
// a user-facing title/description. These transforms mirror what the
// now-deleted scripts/sync-docs.js used to do at postinstall time.
// ---------------------------------------------------------------------------

const HOSTED_URL = process.env.HOSTED_PMXT_URL || 'https://api.pmxt.dev';
const HOSTED_TITLE = 'PMXT Hosted API';
const HOSTED_DESCRIPTION =
    'One API for supported prediction markets. Hosted catalog search in under 10ms, a unified schema for supported venues, and venue-native trading where venues expose writes.';
const INTERNAL_HOSTED_EXCHANGE_KEYS = new Set(['mock']);
const EXAMPLE_EVM_ADDRESS = '0x1111111111111111111111111111111111111111';
const ROUTER_BACKED_SAMPLE_OPERATIONS = new Set([
    'fetchMarkets',
    'fetchEvents',
    'fetchSeries',
]);

function readCoreVersion() {
    try {
        const pkg = JSON.parse(
            fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')
        );
        return pkg.version;
    } catch {
        return 'unknown';
    }
}

/**
 * Return a new spec object with hosted-specific overrides applied.
 * The input is never mutated.
 */
function rewriteForHosted(spec, coreVersion) {
    const next = { ...spec };

    next.openapi = String(spec.openapi || '3.0.0');

    next.info = {
        ...(spec.info || {}),
        title: HOSTED_TITLE,
        description: HOSTED_DESCRIPTION,
        version: String(coreVersion),
    };

    next.servers = [
        {
            url: HOSTED_URL,
            description: 'Hosted PMXT (production)',
        },
    ];

    const components = { ...(spec.components || {}) };
    components.securitySchemes = {
        ...(components.securitySchemes || {}),
        bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            description:
                'Required when calling the hosted API directly (curl, requests, fetch). SDK users pass credentials via constructor params instead.',
        },
    };
    next.components = components;

    // No global security — most endpoints work without an API key
    // (locally or hosted). Per-operation security is applied by
    // assignHostedTags() for API-only endpoints.

    return next;
}

function stripInternalHostedTargets(spec) {
    const constructors = spec['x-sdk-constructors'];
    const nextConstructors = constructors
        ? Object.fromEntries(
            Object.entries(constructors).filter(
                ([wireKey]) => !INTERNAL_HOSTED_EXCHANGE_KEYS.has(wireKey)
            )
        )
        : constructors;

    const components = { ...(spec.components || {}) };
    const parameters = { ...(components.parameters || {}) };
    const exchangeParam = parameters.ExchangeParam;
    const exchangeSchema = exchangeParam?.schema;
    const filteredExchangeParam = Array.isArray(exchangeSchema?.enum)
        ? {
            ...exchangeParam,
            schema: {
                ...exchangeSchema,
                enum: exchangeSchema.enum.filter(
                    (wireKey) => !INTERNAL_HOSTED_EXCHANGE_KEYS.has(wireKey)
                ),
            },
        }
        : exchangeParam;

    return {
        ...spec,
        ...(nextConstructors ? { 'x-sdk-constructors': nextConstructors } : {}),
        components: {
            ...components,
            parameters: {
                ...parameters,
                ...(filteredExchangeParam ? { ExchangeParam: filteredExchangeParam } : {}),
            },
        },
    };
}

// ---------------------------------------------------------------------------
// Hosted-context tag assignment
//
// The hosted Mintlify docs group operations by product category so
// payment processors (and users) can see what the paid product is
// (catalog + historical data) vs what's free/open-source (venue
// pass-through, trading, account).
// ---------------------------------------------------------------------------

const HOSTED_TAGS = [
    {
        name: 'Hosted',
        description:
            'Requires a PMXT API key. These endpoints use the cross-venue catalog and have no local equivalent.',
    },
    {
        name: 'Local Only',
        description:
            'Executed locally by the SDK against the venue. Never proxied through PMXT servers.',
    },
    {
        name: 'Data Feeds',
        description:
            'Auxiliary price and oracle data feeds (Binance, Chainlink). CCXT-compatible method names and response shapes.',
    },
];

// Only endpoints that are exceptions get a tag+badge. Most endpoints
// work both locally and hosted — they get no badge (less noise).
const TAG_MAP = {
    // Hosted only — requires the PMXT catalog, no local equivalent
    fetchMarketMatches: 'Hosted',
    fetchEventMatches: 'Hosted',
    fetchMatchedMarkets: 'Hosted',
    fetchRelatedMarkets: 'Hosted',
    compareMarketPrices: 'Hosted',
    fetchMatchedPrices: 'Hosted',
    // Local only — executed by the SDK against the venue directly,
    // never proxied through PMXT servers
    createOrder: 'Local Only',
    buildOrder: 'Local Only',
    submitOrder: 'Local Only',
    cancelOrder: 'Local Only',
};

// Badge labels shown in the Mintlify sidebar via x-mint.metadata.tag.
// Endpoints not in TAG_MAP get no badge.
const TAG_BADGE_MAP = {
    'Hosted': 'Hosted',
    'Local Only': 'Local Only',
};

// ---------------------------------------------------------------------------
// Catalog-backed notice
//
// These endpoints are transparently served from the hosted Postgres catalog
// (~10ms) instead of proxying to the venue (~500ms) when the caller passes
// a PMXT API key and does not include venue credentials.  The notice is
// prepended to the operation description in the hosted docs spec so users
// know the hosted path is dramatically faster.
// ---------------------------------------------------------------------------

const CATALOG_BACKED_METHODS = new Set([
    'fetchMarkets',
    'fetchEvents',
    'fetchMarket',
    'fetchEvent',
    'fetchMarketsPaginated',
    'fetchEventsPaginated',
    'loadMarkets',
]);

const CATALOG_NOTICE =
    '<Info>\n' +
    '**Faster with an API key** — With a PMXT API key this endpoint ' +
    'is served from an indexed catalog (~10 ms) instead of proxying to ' +
    'the venue (~500 ms). No code changes required — same request, same ' +
    'response, just faster. ' +
    '[Learn more](/concepts/catalog-vs-live).\n' +
    '</Info>';

/**
 * Add a catalog-speed notice via x-mint.content on every operation
 * whose operationId is in CATALOG_BACKED_METHODS.  Uses x-mint.content
 * instead of the description field so Mintlify renders it as a proper
 * <Info> callout box rather than a plain blockquote.
 * Returns a NEW spec object — the input is never mutated.
 */
function injectCatalogNotices(spec) {
    const paths = { ...(spec.paths || {}) };
    for (const [pathKey, methods] of Object.entries(paths)) {
        const newMethods = {};
        for (const [method, op] of Object.entries(methods)) {
            if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
                newMethods[method] = op;
                continue;
            }
            if (CATALOG_BACKED_METHODS.has(op.operationId)) {
                const existing = (op['x-mint'] || {}).content || '';
                const content = existing
                    ? CATALOG_NOTICE + '\n\n' + existing
                    : CATALOG_NOTICE;
                newMethods[method] = {
                    ...op,
                    'x-mint': {
                        ...(op['x-mint'] || {}),
                        content,
                    },
                };
            } else {
                newMethods[method] = op;
            }
        }
        paths[pathKey] = newMethods;
    }
    return { ...spec, paths };
}

/**
 * Walk every operation in the hosted spec and:
 *   1. Set `x-mint.metadata.tag` — renders a badge next to the endpoint
 *      title in the Mintlify sidebar (e.g. "Hosted", "Open Source",
 *      "Local Only").
 *   2. Keep the OpenAPI `tags` array for non-sidebar consumers.
 *
 * Returns a NEW spec object — the input is never mutated.
 */
function assignHostedTags(spec) {
    const newSpec = { ...spec };
    newSpec.tags = HOSTED_TAGS;

    const paths = { ...(spec.paths || {}) };
    for (const [pathKey, methods] of Object.entries(paths)) {
        const newMethods = {};
        for (const [method, op] of Object.entries(methods)) {
            if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
                newMethods[method] = op;
                continue;
            }
            const tag = TAG_MAP[op.operationId];
            if (tag) {
                // Map internal tag names to user-facing badge labels
                const badgeLabel = TAG_BADGE_MAP[tag] || tag;
                const enhanced = {
                    ...op,
                    tags: [tag],
                    'x-mint': {
                        ...(op['x-mint'] || {}),
                        metadata: {
                            ...((op['x-mint'] || {}).metadata || {}),
                            tag: badgeLabel,
                        },
                    },
                };
                // API-only endpoints require bearer auth; everything
                // else works without a key (locally or hosted).
                if (tag === 'Hosted') {
                    enhanced.security = [{ bearerAuth: [] }];
                }
                newMethods[method] = enhanced;
            } else if (Array.isArray(op.tags) && op.tags.includes('Data Feeds')) {
                // Feed endpoints: preserve existing tag, add auth + badge
                newMethods[method] = {
                    ...op,
                    security: [{ bearerAuth: [] }],
                    'x-mint': {
                        ...(op['x-mint'] || {}),
                        metadata: {
                            ...((op['x-mint'] || {}).metadata || {}),
                            tag: 'Data Feeds',
                        },
                    },
                };
            } else {
                // Explicitly mark non-tagged endpoints as no-auth so
                // Mintlify doesn't inherit a global security requirement.
                newMethods[method] = { ...op, security: [] };
            }
        }
        paths[pathKey] = newMethods;
    }
    newSpec.paths = paths;
    return newSpec;
}

// ---------------------------------------------------------------------------
// SDK code sample generation (x-codeSamples)
//
// Mintlify supports `x-codeSamples` on each OpenAPI operation to display
// custom language tabs. We generate Python SDK (pmxt) and TypeScript SDK
// (pmxtjs) samples so users see real SDK calls instead of raw HTTP.
// ---------------------------------------------------------------------------

/** Convert a camelCase string to snake_case, keeping acronyms intact. */
function toSnakeCaseSdk(str) {
    return str
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .toLowerCase();
}

/** Resolve a JSON Pointer $ref against the spec. */
function resolveRef(ref, spec) {
    if (typeof ref !== 'string' || !ref.startsWith('#/')) return undefined;
    const parts = ref.replace(/^#\//, '').split('/');
    let current = spec;
    for (const part of parts) {
        if (current == null) return undefined;
        current = current[part];
    }
    return current;
}

/** Return a sensible example value for a parameter based on its name and schema. */
function exampleValue(name, schema) {
    const lowerName = (name || '').toLowerCase();

    if (schema) {
        if (schema.example !== undefined) return schema.example;
        if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
        if (schema.format === 'date-time') {
            return lowerName.includes('until') || lowerName === 'end'
                ? '2026-01-31T00:00:00Z'
                : '2026-01-01T00:00:00Z';
        }
    }

    if (lowerName === 'query') return 'election';
    if (lowerName === 'id' || lowerName === 'marketid' || lowerName === 'eventid') return '12345';
    if (lowerName === 'outcomeid') return '67890';
    if (lowerName === 'orderid') return 'ord-001';
    if (lowerName === 'limit') return 10;
    if (lowerName === 'offset') return 0;
    if (lowerName === 'cursor') return 'abc123';
    if (lowerName === 'side') return 'buy';
    if (lowerName === 'type') return 'limit';
    if (lowerName === 'amount') return 10;
    if (lowerName === 'price') return 0.55;
    if (lowerName === 'symbol' || lowerName === 'slug') return 'BTC-USD';
    if (lowerName === 'address') return EXAMPLE_EVM_ADDRESS;
    if (lowerName === 'resolution') return '1h';
    if (lowerName.includes('id')) return '12345';

    if (schema) {
        if (schema.type === 'string') return 'value';
        if (schema.type === 'number' || schema.type === 'integer') return 1;
        if (schema.type === 'boolean') return true;
        if (schema.type === 'array') return [];
        if (schema.type === 'object') return {};
    }

    return 'value';
}

/** Format a value for Python source code. */
function formatPyValue(v) {
    if (typeof v === 'string') return `"${v}"`;
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    if (Array.isArray(v)) return '[]';
    if (v !== null && typeof v === 'object') return '{}';
    return String(v);
}

/** Format a value for JavaScript/TypeScript source code. */
function formatJsValue(v) {
    if (typeof v === 'string') return `"${v}"`;
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (Array.isArray(v)) return '[]';
    if (v !== null && typeof v === 'object') return '{}';
    return String(v);
}

/**
 * For GET endpoints, collect query parameters (skipping ExchangeParam $refs).
 * Returns an array of { name, value } — required first, then optional.
 */
function extractGetParamsSdk(operation, spec) {
    const params = operation.parameters || [];
    const required = [];
    const optional = [];

    for (const raw of params) {
        const param = raw.$ref ? resolveRef(raw.$ref, spec) : raw;
        if (!param) continue;
        if (param.name === 'exchange' || (param.schema && param.schema.title === 'ExchangeParam')) {
            continue;
        }
        if (param.in !== 'query') continue;

        const entry = { name: param.name, value: exampleValue(param.name, param.schema || {}) };
        if (param.required) {
            required.push(entry);
        } else {
            optional.push(entry);
        }
    }

    return [...required, ...optional];
}

/**
 * For POST endpoints, resolve the requestBody schema's `args.items` and
 * extract required properties plus optional, capped at reasonable total.
 */
function extractPostParamsSdk(operation, spec) {
    const content = operation.requestBody?.content?.['application/json'];
    if (!content) return [];

    let bodySchema = content.schema;
    if (bodySchema?.$ref) bodySchema = resolveRef(bodySchema.$ref, spec);
    if (!bodySchema) return [];

    let targetSchema = bodySchema;
    const argsSchema = bodySchema.properties?.args;
    if (argsSchema) {
        let itemsSchema = argsSchema.items;
        if (itemsSchema?.$ref) itemsSchema = resolveRef(itemsSchema.$ref, spec);
        if (itemsSchema) targetSchema = itemsSchema;
    }

    const properties = targetSchema.properties || {};
    const requiredNames = new Set(targetSchema.required || []);
    const required = [];
    const optional = [];

    for (const [name, propSchema] of Object.entries(properties)) {
        const resolved = propSchema?.$ref ? resolveRef(propSchema.$ref, spec) : propSchema;
        const entry = { name, value: exampleValue(name, resolved || {}) };
        if (requiredNames.has(name)) {
            required.push(entry);
        } else {
            optional.push(entry);
        }
    }

    return [...required, ...optional];
}

const PARAM_OVERRIDES = {
    fetchMarkets: [
        { name: 'query', value: 'election' },
        { name: 'limit', value: 10 },
        { name: 'status', value: 'active' },
    ],
    fetchEvents: [
        { name: 'query', value: 'election' },
        { name: 'limit', value: 10 },
        { name: 'status', value: 'active' },
    ],
    fetchMarket: [{ name: 'marketId', value: '12345' }],
    fetchEvent: [{ name: 'eventId', value: '12345' }],
    fetchMarketsPaginated: [
        { name: 'limit', value: 10 },
        { name: 'cursor', value: 'abc123' },
    ],
    fetchEventsPaginated: [
        { name: 'limit', value: 10 },
        { name: 'cursor', value: 'abc123' },
    ],
    cancelOrder: [{ name: 'orderId', value: 'ord-001' }],
    watchOrderBook: [{ name: 'id', value: '12345' }],
    watchTrades: [{ name: 'id', value: '12345' }],
    watchAddress: [{ name: 'address', value: EXAMPLE_EVM_ADDRESS }],
    unwatchAddress: [{ name: 'address', value: EXAMPLE_EVM_ADDRESS }],
    getExecutionPrice: [
        { name: 'orderBook', value: 'orderBook' },
        { name: 'side', value: 'buy' },
        { name: 'amount', value: 10 },
    ],
    getExecutionPriceDetailed: [
        { name: 'orderBook', value: 'orderBook' },
        { name: 'side', value: 'buy' },
        { name: 'amount', value: 10 },
    ],
    editOrder: [
        { name: 'orderId', value: 'ord-001' },
        { name: 'price', value: 0.55 },
        { name: 'amount', value: 10 },
    ],
    fetchMarketMatches: [{ name: 'marketId', value: '12345' }],
    fetchEventMatches: [{ name: 'eventId', value: '12345' }],
    compareMarketPrices: [{ name: 'marketId', value: '12345' }],
    fetchHedges: [{ name: 'marketId', value: '12345' }],
    fetchArbitrage: [{ name: 'minSpread', value: 0.05 }],
    fetchRelatedMarkets: [{ name: 'marketId', value: '12345' }],
    fetchMatchedMarkets: [{ name: 'minDifference', value: 0.05 }],
    fetchMatchedPrices: [{ name: 'minDifference', value: 0.05 }],
    // Self-hosted createOrder / buildOrder samples: limit order shape only.
    // The auto-extracted shape mixed `type: "market"` with `price: 0.55`,
    // which is incoherent (price is only meaningful for limit orders) and
    // tacked on internal-only fields (fee, tickSize, negRisk, onBehalfOf)
    // that the average reader shouldn't see. A clean limit-order example
    // is the simplest correct shape.
    createOrder: [
        { name: 'marketId', value: '12345' },
        { name: 'outcomeId', value: '67890' },
        { name: 'side', value: 'buy' },
        { name: 'type', value: 'limit' },
        { name: 'amount', value: 10 },
        { name: 'price', value: 0.55 },
    ],
    buildOrder: [
        { name: 'marketId', value: '12345' },
        { name: 'outcomeId', value: '67890' },
        { name: 'side', value: 'buy' },
        { name: 'type', value: 'limit' },
        { name: 'amount', value: 10 },
        { name: 'price', value: 0.55 },
    ],
};

const FULL_OVERRIDES = {
    fetchOHLCV: {
        pythonBody: [
            'result = exchange.fetch_ohlcv(',
            '    "67890",',
            '    resolution="1h",',
            '    start=datetime(2026, 1, 1, tzinfo=timezone.utc),',
            '    end=datetime(2026, 1, 31, tzinfo=timezone.utc),',
            '    limit=10,',
            ')',
        ],
        typescriptBody: [
            'const result = await exchange.fetchOHLCV(',
            '  "67890",',
            '  {',
            '    resolution: "1h",',
            '    start: new Date("2026-01-01T00:00:00Z"),',
            '    end: new Date("2026-01-31T00:00:00Z"),',
            '    limit: 10,',
            '  },',
            ');',
        ],
    },
    fetchOrderBook: {
        pythonBody: [
            'result = exchange.fetch_order_book(',
            '    "67890",',
            '    limit=10,',
            '    params={"outcome": "yes"},',
            ')',
        ],
        typescriptBody: [
            'const result = await exchange.fetchOrderBook(',
            '  "67890",',
            '  10,',
            '  { outcome: "yes" },',
            ');',
        ],
    },
    fetchOrderBooks: {
        pythonBody: [
            'result = exchange.fetch_order_books(["67890"])',
        ],
        typescriptBody: [
            'const result = await exchange.fetchOrderBooks(["67890"]);',
        ],
    },
    fetchTrades: {
        pythonBody: [
            'result = exchange.fetch_trades(',
            '    "67890",',
            '    start="2026-01-01T00:00:00Z",',
            '    end="2026-01-31T00:00:00Z",',
            '    limit=10,',
            ')',
        ],
        typescriptBody: [
            'const result = await exchange.fetchTrades(',
            '  "67890",',
            '  {',
            '    start: new Date("2026-01-01T00:00:00Z"),',
            '    end: new Date("2026-01-31T00:00:00Z"),',
            '    limit: 10,',
            '  },',
            ');',
        ],
    },
    submitOrder: {
        pythonBody: [
            'built = exchange.build_order(market_id="12345", outcome_id="67890", side="buy", type="limit", amount=10, price=0.55)',
            'result = exchange.submit_order(built)',
        ],
        typescriptBody: [
            'const built = await exchange.buildOrder({ marketId: "12345", outcomeId: "67890", side: "buy", type: "limit", amount: 10, price: 0.55 });',
            'const result = await exchange.submitOrder(built);',
        ],
    },
    cancelOrder: {
        pythonBody: [
            'result = exchange.cancel_order("ord-001")',
        ],
        typescriptBody: [
            'const result = await exchange.cancelOrder("ord-001");',
        ],
    },
    fetchOrder: {
        pythonBody: [
            'result = exchange.fetch_order("ord-001")',
        ],
        typescriptBody: [
            'const result = await exchange.fetchOrder("ord-001");',
        ],
    },
    fetchOpenOrders: {
        pythonBody: [
            'result = exchange.fetch_open_orders("12345")',
        ],
        typescriptBody: [
            'const result = await exchange.fetchOpenOrders("12345");',
        ],
    },
    fetchPositions: {
        pythonBody: [
            `result = exchange.fetch_positions(address="${EXAMPLE_EVM_ADDRESS}")`,
        ],
        typescriptBody: [
            `const result = await exchange.fetchPositions("${EXAMPLE_EVM_ADDRESS}");`,
        ],
    },
    fetchBalance: {
        pythonBody: [
            `result = exchange.fetch_balance(address="${EXAMPLE_EVM_ADDRESS}")`,
        ],
        typescriptBody: [
            `const result = await exchange.fetchBalance("${EXAMPLE_EVM_ADDRESS}");`,
        ],
    },
    getExecutionPrice: {
        pythonBody: [
            'order_book = pmxt.OrderBook(',
            '    bids=[pmxt.OrderLevel(price=0.52, size=100)],',
            '    asks=[pmxt.OrderLevel(price=0.54, size=100)],',
            ')',
            'result = exchange.get_execution_price(order_book, "buy", 10)',
        ],
        typescriptBody: [
            'const orderBook = {',
            '  bids: [{ price: 0.52, size: 100 }],',
            '  asks: [{ price: 0.54, size: 100 }],',
            '  timestamp: Date.now(),',
            '};',
            'const result = exchange.getExecutionPrice(orderBook, "buy", 10);',
        ],
    },
    getExecutionPriceDetailed: {
        pythonBody: [
            'order_book = pmxt.OrderBook(',
            '    bids=[pmxt.OrderLevel(price=0.52, size=100)],',
            '    asks=[pmxt.OrderLevel(price=0.54, size=100)],',
            ')',
            'result = exchange.get_execution_price_detailed(order_book, "buy", 10)',
        ],
        typescriptBody: [
            'const orderBook = {',
            '  bids: [{ price: 0.52, size: 100 }],',
            '  asks: [{ price: 0.54, size: 100 }],',
            '  timestamp: Date.now(),',
            '};',
            'const result = await exchange.getExecutionPriceDetailed(orderBook, "buy", 10);',
        ],
    },
};

const FALLBACK_CONSTRUCTORS = {
    kalshi: {
        className: 'Kalshi',
        params: [],
    },
};

function constructorParamValue(param) {
    if (param.default !== undefined) return param.default;
    return `YOUR_${param.name.toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Constructor preambles for code samples
//
// Three patterns based on endpoint type:
//   Hosted:     API key required + comment explaining why
//   Local Only: venue credentials only + comment explaining local execution
//   Default:    API key shown but marked optional (faster catalog lookups)
// ---------------------------------------------------------------------------

const WRITE_METHODS = new Set([
    'createOrder', 'buildOrder', 'submitOrder', 'cancelOrder', 'editOrder',
]);

function buildPyPreamble(exchangeInfo, operationId) {
    const lines = ['import pmxt'];
    if (operationId === 'fetchOHLCV') {
        lines.push('from datetime import datetime, timezone');
    }
    lines.push('');
    const tag = TAG_MAP[operationId];

    if (tag === 'Local Only') {
        // Trading: venue credentials, no API key
        const venueParams = exchangeInfo.params.filter((p) => p.name !== 'pmxt_api_key');
        lines.push('# Runs locally — never proxied through PMXT servers');
        if (venueParams.length === 0) {
            lines.push(`exchange = pmxt.${exchangeInfo.className}()`);
        } else {
            lines.push(`exchange = pmxt.${exchangeInfo.className}(`);
            for (const param of venueParams) {
                lines.push(`    ${param.name}=${formatPyValue(constructorParamValue(param))},`);
            }
            lines.push(')');
        }
    } else if (tag === 'Hosted') {
        // Cross-venue catalog: API key required
        lines.push('# API key required — queries the cross-venue catalog');
        lines.push(`exchange = pmxt.${exchangeInfo.className}(`);
        lines.push(`    pmxt_api_key="YOUR_PMXT_API_KEY",`);
        lines.push(')');
    } else {
        // Everything else: API key optional, enables faster lookups
        lines.push('# API key optional — enables faster catalog-backed lookups');
        lines.push(`exchange = pmxt.${exchangeInfo.className}(`);
        lines.push(`    pmxt_api_key="YOUR_PMXT_API_KEY",`);
        lines.push(')');
    }
    return lines;
}

function buildTsPreamble(exchangeInfo, operationId) {
    const lines = [
        `import { ${exchangeInfo.className} } from "pmxtjs";`,
        '',
    ];
    const tag = TAG_MAP[operationId];

    if (tag === 'Local Only') {
        const venueParams = exchangeInfo.params.filter((p) => p.name !== 'pmxt_api_key');
        lines.push('// Runs locally — never proxied through PMXT servers');
        if (venueParams.length === 0) {
            lines.push(`const exchange = new ${exchangeInfo.className}();`);
        } else {
            lines.push(`const exchange = new ${exchangeInfo.className}({`);
            for (const param of venueParams) {
                lines.push(`  ${param.tsName || param.name}: ${formatJsValue(constructorParamValue(param))},`);
            }
            lines.push('});');
        }
    } else if (tag === 'Hosted') {
        lines.push('// API key required — queries the cross-venue catalog');
        lines.push(`const exchange = new ${exchangeInfo.className}({`);
        lines.push(`  pmxtApiKey: "YOUR_PMXT_API_KEY",`);
        lines.push('});');
    } else {
        lines.push('// API key optional — enables faster catalog-backed lookups');
        lines.push(`const exchange = new ${exchangeInfo.className}({`);
        lines.push(`  pmxtApiKey: "YOUR_PMXT_API_KEY",`);
        lines.push('});');
    }
    return lines;
}

function buildPyMethodCall(pyMethod, params) {
    if (params.length === 0) {
        return [`result = exchange.${pyMethod}()`];
    }
    if (params.length <= 2) {
        const inline = params.map((p) => `${toSnakeCaseSdk(p.name)}=${formatPyValue(p.value)}`).join(', ');
        return [`result = exchange.${pyMethod}(${inline})`];
    }
    const lines = [`result = exchange.${pyMethod}(`];
    for (const p of params) {
        lines.push(`    ${toSnakeCaseSdk(p.name)}=${formatPyValue(p.value)},`);
    }
    lines.push(')');
    return lines;
}

function buildTsMethodCall(jsMethod, params) {
    if (params.length === 0) {
        return [`const result = await exchange.${jsMethod}();`];
    }
    if (params.length <= 2) {
        const inline = params.map((p) => `${p.name}: ${formatJsValue(p.value)}`).join(', ');
        return [`const result = await exchange.${jsMethod}({ ${inline} });`];
    }
    const lines = [`const result = await exchange.${jsMethod}({`];
    for (const p of params) {
        lines.push(`  ${p.name}: ${formatJsValue(p.value)},`);
    }
    lines.push('});');
    return lines;
}

function shouldIncludeSdkSampleConstructor(wireKey, operationId) {
    if (INTERNAL_HOSTED_EXCHANGE_KEYS.has(wireKey)) return false;
    if (wireKey === 'router') {
        return ROUTER_ONLY_OPERATIONS.has(operationId)
            || ROUTER_BACKED_SAMPLE_OPERATIONS.has(operationId);
    }
    if (ROUTER_ONLY_OPERATIONS.has(operationId)) return false;
    return true;
}

function getSdkSampleEntries(constructors, operationId) {
    return Object.entries(constructors).filter(
        ([wireKey]) => shouldIncludeSdkSampleConstructor(wireKey, operationId)
    );
}

/**
 * Generate an x-codeSamples array for a single operation.
 * Returns undefined for healthCheck (no SDK equivalent).
 */
function generateCodeSamples(operationId, httpMethod, pathKey, operation, spec) {
    if (!operationId || operationId === 'healthCheck') return undefined;

    const constructors = spec['x-sdk-constructors'] || FALLBACK_CONSTRUCTORS;
    const exchangeEntries = getSdkSampleEntries(constructors, operationId);

    const params = PARAM_OVERRIDES[operationId]
        || (httpMethod === 'get'
            ? extractGetParamsSdk(operation, spec)
            : extractPostParamsSdk(operation, spec));

    let pythonSdkSamples;
    let tsSdkSamples;

    if (FULL_OVERRIDES[operationId]) {
        const ov = FULL_OVERRIDES[operationId];
        pythonSdkSamples = exchangeEntries.map(([, info]) => ({
            lang: 'python',
            label: info.className,
            source: [...buildPyPreamble(info, operationId), ...ov.pythonBody].join('\n'),
        }));
        tsSdkSamples = exchangeEntries.map(([, info]) => ({
            lang: 'javascript',
            label: info.className,
            source: [...buildTsPreamble(info, operationId), ...ov.typescriptBody].join('\n'),
        }));
    } else {
        const pyMethod = toSnakeCaseSdk(operationId);
        const jsMethod = operationId;
        const pyBodyLines = buildPyMethodCall(pyMethod, params);
        const tsBodyLines = buildTsMethodCall(jsMethod, params);

        pythonSdkSamples = exchangeEntries.map(([, info]) => ({
            lang: 'python',
            label: info.className,
            source: [...buildPyPreamble(info, operationId), ...pyBodyLines].join('\n'),
        }));
        tsSdkSamples = exchangeEntries.map(([, info]) => ({
            lang: 'javascript',
            label: info.className,
            source: [...buildTsPreamble(info, operationId), ...tsBodyLines].join('\n'),
        }));
    }

    return [...pythonSdkSamples, ...tsSdkSamples];
}

/**
 * Walk every operation in the spec and attach x-codeSamples.
 * Returns a NEW spec object — the input is never mutated.
 */
function injectCodeSamples(spec) {
    const paths = spec.paths || {};
    const newPaths = {};

    for (const [pathKey, methods] of Object.entries(paths)) {
        const newMethods = {};
        for (const [method, op] of Object.entries(methods)) {
            if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
                newMethods[method] = op;
                continue;
            }
            const samples = buildFeedCodeSamples(op.operationId)
                || generateCodeSamples(op.operationId, method, pathKey, op, spec);
            if (samples) {
                newMethods[method] = { ...op, 'x-codeSamples': samples };
            } else {
                newMethods[method] = { ...op };
            }
        }
        newPaths[pathKey] = newMethods;
    }

    return { ...spec, paths: newPaths };
}

// ---------------------------------------------------------------------------
// Per-operation exchange scoping
//
// The capability system (exchange.has) knows exactly which exchanges
// support which methods. We use this to:
//   1. Replace the shared ExchangeParam $ref with an inline enum scoped
//      to only the exchanges that actually implement the method.
//   2. Filter x-codeSamples to only show applicable exchanges.
//
// This means fetchMatches only shows "Router" in the dropdown, while
// createOrder excludes read-only exchanges like Router.
// ---------------------------------------------------------------------------

/**
 * Instantiate every exchange from the built dist/ and return a map
 * of { methodName: Set<wireKey> } indicating which exchanges support
 * which methods.
 */
// Operations that only exist on the Router. Used as a fallback when
// dist/ is not built and the full capability map is unavailable.
// Keep this in sync with Router's capability overrides.
const ROUTER_ONLY_OPERATIONS = new Set([
    'fetchMarketMatches', 'fetchEventMatches', 'compareMarketPrices',
    'fetchRelatedMarkets', 'fetchMatchedMarkets', 'fetchMatchedPrices',
    'fetchHedges', 'fetchArbitrage', 'fetchMatches',
]);

function buildCapabilityMap() {
    let pmxt;
    try {
        pmxt = require(path.join(__dirname, '../dist'));
    } catch (e) {
        console.warn(
            '[generate-openapi] dist/ not found — using static Router-only list ' +
            'for exchange scoping. Run `npm run build` for full capability detection.'
        );
        // Return a minimal capability map: Router-only ops get ['router'],
        // everything else gets null (no scoping applied).
        const fallback = {};
        for (const op of ROUTER_ONLY_OPERATIONS) {
            fallback[op] = ['router'];
        }
        return fallback;
    }

    const exchangeInstances = {
        polymarket: new pmxt.Polymarket(),
        kalshi: new pmxt.Kalshi(),
        'kalshi-demo': new pmxt.KalshiDemo(),
        limitless: new pmxt.Limitless(),
        probable: new pmxt.Probable(),
        baozi: new pmxt.Baozi(),
        myriad: new pmxt.Myriad(),
        opinion: new pmxt.Opinion(),
        metaculus: new pmxt.Metaculus(),
        smarkets: new pmxt.Smarkets(),
        polymarket_us: new pmxt.PolymarketUS(),
        hyperliquid: new pmxt.Hyperliquid(),
        'gemini-titan': new pmxt.GeminiTitan(),
        suibets: new pmxt.SuiBets(),
        rain: new pmxt.Rain(),
        hunch: new pmxt.Hunch(),
        router: new pmxt.Router({ apiKey: '_' }),
    };

    // Collect all capability keys from any exchange
    const allMethods = new Set();
    for (const ex of Object.values(exchangeInstances)) {
        for (const key of Object.keys(ex.has)) {
            allMethods.add(key);
        }
    }

    // Build the map: method → [wireKeys that support it]
    const capMap = {};
    for (const method of allMethods) {
        const supported = [];
        for (const [wireKey, ex] of Object.entries(exchangeInstances)) {
            if (ex.has[method]) supported.push(wireKey);
        }
        capMap[method] = supported;
    }

    return capMap;
}

/**
 * Walk every operation in the spec and:
 *   1. Replace $ref ExchangeParam with an inline param scoped to only
 *      the exchanges that support this operationId.
 *   2. Filter x-codeSamples to only show applicable exchanges.
 *
 * Returns a NEW spec object — the input is never mutated.
 */
function scopeExchangeParams(spec, capMap, { collapsePaths = true } = {}) {
    if (!capMap) return spec;

    const constructors = spec['x-sdk-constructors'] || {};
    const paths = spec.paths || {};
    const newPaths = {};

    for (const [pathKey, methods] of Object.entries(paths)) {
        const newMethods = {};
        for (const [method, op] of Object.entries(methods)) {
            if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
                newMethods[method] = op;
                continue;
            }

            const opId = op.operationId;
            const supportedExchanges = capMap[opId];

            if (!supportedExchanges || supportedExchanges.length === 0) {
                // No capability data — keep the shared $ref as-is
                newMethods[method] = op;
                continue;
            }

            // Replace the ExchangeParam $ref with a scoped inline param
            const newParams = (op.parameters || []).map((param) => {
                if (param.$ref === '#/components/parameters/ExchangeParam') {
                    return {
                        in: 'path',
                        name: 'exchange',
                        schema: {
                            type: 'string',
                            enum: supportedExchanges,
                        },
                        required: true,
                        description: 'The prediction market exchange to target.',
                    };
                }
                return param;
            });

            // Filter code samples to only show supported exchanges
            let codeSamples = op['x-codeSamples'];
            if (Array.isArray(codeSamples)) {
                const supportedClassNames = new Set(
                    supportedExchanges
                        .map((wireKey) => constructors[wireKey]?.className)
                        .filter(Boolean)
                );
                codeSamples = codeSamples.filter(
                    (sample) => supportedClassNames.has(sample.label)
                );
            }

            newMethods[method] = {
                ...op,
                parameters: newParams,
                ...(codeSamples ? { 'x-codeSamples': codeSamples } : {}),
            };
        }

        // When collapsePaths is enabled and every operation under this
        // path is Router-only, replace the {exchange} template with
        // "router" so the docs show the real URL (e.g.
        // /api/router/fetchMarketMatches).  We only collapse for Router
        // because those endpoints are architecturally permanent.  Other
        // single-exchange methods (e.g. unwatchOrderBook on Polymarket
        // today) will gain more venues over time, so collapsing them
        // would break docs.json references.
        //
        // The sidecar spec sets collapsePaths=false: the server routes
        // on {exchange} as a path parameter, so the template must stay.
        if (collapsePaths && pathKey.includes('{exchange}')) {
            const ops = Object.values(newMethods).filter(
                (o) => typeof o === 'object' && o.operationId
            );
            const singleExchange = ops.length > 0 && ops.every((o) => {
                const supported = capMap[o.operationId];
                return supported && supported.length === 1;
            });
            const isRouterOnly = singleExchange &&
                capMap[ops[0].operationId][0] === 'router';
            if (isRouterOnly) {
                const exchange = capMap[ops[0].operationId][0];
                const concretePath = pathKey.replace('{exchange}', exchange);
                // Remove the exchange path parameter from each operation
                for (const [m, o] of Object.entries(newMethods)) {
                    if (typeof o === 'object' && Array.isArray(o.parameters)) {
                        newMethods[m] = {
                            ...o,
                            parameters: o.parameters.filter(
                                (p) => !(p.in === 'path' && p.name === 'exchange')
                            ),
                        };
                    }
                }
                newPaths[concretePath] = newMethods;
                continue;
            }
        }

        newPaths[pathKey] = newMethods;
    }

    return { ...spec, paths: newPaths };
}

/**
 * Generate the hosted docs openapi.json from the sidecar spec.
 * Applies hosted rewrites, injects SDK code samples, scopes exchange
 * params per-operation, writes JSON.
 */
function generateHostedDocsSpec(spec) {
    const coreVersion = readCoreVersion();
    const publicSpec = stripInternalHostedTargets(spec);
    const rewritten = rewriteForHosted(publicSpec, coreVersion);
    const tagged = assignHostedTags(rewritten);
    const withNotices = injectCatalogNotices(tagged);
    const withSamples = injectCodeSamples(withNotices);

    // Scope exchange params per-operation using the capability system
    const capMap = buildCapabilityMap();
    const scoped = scopeExchangeParams(withSamples, capMap);
    if (capMap) {
        // Report scoping stats
        const allExchanges = Object.keys(capMap.fetchMarkets || {}).length ||
            Object.values(capMap)[0]?.length || 0;
        const scopedOps = Object.entries(capMap)
            .filter(([, exs]) => exs.length > 0 && exs.length < 12)
            .length;
        console.log(
            `  Scoped ${scopedOps} operations to exchange subsets (capability-based)`
        );
    }

    fs.mkdirSync(path.dirname(DOCS_OPENAPI_OUT_PATH), { recursive: true });
    const out = JSON.stringify(scoped, null, 2) + '\n';
    fs.writeFileSync(DOCS_OPENAPI_OUT_PATH, out, 'utf-8');

    // Remove any stale YAML copy so Mintlify doesn't see two specs.
    const staleYaml = path.join(path.dirname(DOCS_OPENAPI_OUT_PATH), 'openapi.yaml');
    if (fs.existsSync(staleYaml)) fs.unlinkSync(staleYaml);

    const bytes = Buffer.byteLength(out, 'utf8');
    console.log(
        `Generated ${path.relative(process.cwd(), DOCS_OPENAPI_OUT_PATH)} ` +
            `(${bytes} bytes, pmxt-core@${coreVersion})`
    );
}

const EXCLUDED_METHODS = new Set(['callApi', 'defineImplicitApi', 'fetchMatches']);

// Map TypeScript type names to OpenAPI component schema names
const TYPE_REF_MAP = {
  UnifiedMarket: 'UnifiedMarket',
  UnifiedEvent: 'UnifiedEvent',
  UnifiedSeries: 'UnifiedSeries',
  MarketOutcome: 'MarketOutcome',
  Order: 'Order',
  Trade: 'Trade',
  UserTrade: 'UserTrade',
  Position: 'Position',
  Balance: 'Balance',
  PriceCandle: 'PriceCandle',
  OrderBook: 'OrderBook',
  OrderLevel: 'OrderLevel',
  ExecutionPriceResult: 'ExecutionPriceResult',
  PaginatedMarketsResult: 'PaginatedMarketsResult',
  PaginatedEventsResult: 'PaginatedEventsResult',
  // MarketFetchParams is an alias for MarketFilterParams
  MarketFetchParams: 'MarketFilterParams',
  MarketFilterParams: 'MarketFilterParams',
  EventFetchParams: 'EventFetchParams',
  OHLCVParams: 'OHLCVParams',
  FetchOrderBookParams: 'FetchOrderBookParams',
  HistoryFilterParams: 'HistoryFilterParams',
  TradesParams: 'TradesParams',
  CreateOrderParams: 'CreateOrderParams',
  MyTradesParams: 'MyTradesParams',
  OrderHistoryParams: 'OrderHistoryParams',
  BuiltOrder: 'BuiltOrder',
  MarketFilterCriteria: 'MarketFilterCriteria',
  EventFilterCriteria: 'EventFilterCriteria',
  FetchMarketMatchesParams: 'FetchMarketMatchesParams',
  // FetchMatchesParams is a deprecated alias for FetchMarketMatchesParams
  FetchMatchesParams: 'FetchMarketMatchesParams',
  FetchEventMatchesParams: 'FetchEventMatchesParams',
  FetchArbitrageParams: 'FetchArbitrageParams',
  FetchMatchedMarketsParams: 'FetchMatchedMarketsParams',
  FetchMatchedPricesParams: 'FetchMatchedMarketsParams',
  MatchedMarketPair: 'MatchedMarketPair',
  MatchResult: 'MatchResult',
  EventMatchResult: 'EventMatchResult',
  PriceComparison: 'PriceComparison',
  ArbitrageOpportunity: 'ArbitrageOpportunity',
  MatchedPricePair: 'MatchedMarketPair',
  // MatchRelation is a type alias (string union), not an interface.
  // It resolves inline via TYPE_ALIAS_REGISTRY — do NOT add it here.
};

// ---------------------------------------------------------------------------
// Type node → OpenAPI schema
// ---------------------------------------------------------------------------

function typeNodeToSchema(node, sourceFile) {
  if (!node) return {};

  switch (node.kind) {
    case ts.SyntaxKind.StringKeyword:
      return { type: 'string' };
    case ts.SyntaxKind.NumberKeyword:
      return { type: 'number' };
    case ts.SyntaxKind.BooleanKeyword:
      return { type: 'boolean' };
    // `any` / `unknown` mean "anything" — express as an empty schema,
    // which is the OpenAPI idiom. Used by e.g. BuiltOrder.raw.
    case ts.SyntaxKind.AnyKeyword:
    case ts.SyntaxKind.UnknownKeyword:
      return {};
    case ts.SyntaxKind.VoidKeyword:
    case ts.SyntaxKind.NullKeyword:
    case ts.SyntaxKind.UndefinedKeyword:
      return null;

    case ts.SyntaxKind.ArrayType: {
      const items = typeNodeToSchema(node.elementType, sourceFile);
      return { type: 'array', items: items || {} };
    }

    case ts.SyntaxKind.TypeReference: {
      const typeName = node.typeName;
      const name =
        typeName.kind === ts.SyntaxKind.Identifier
          ? typeName.text
          : typeName.right.text; // QualifiedName: take the rightmost part

      if (name === 'Promise') {
        const arg = node.typeArguments && node.typeArguments[0];
        return typeNodeToSchema(arg, sourceFile);
      }

      if (name === 'Record') {
        const valTypeNode = node.typeArguments && node.typeArguments[1];
        const valSchema = typeNodeToSchema(valTypeNode, sourceFile);
        // Permissive object: any key, any value (for Record<string, any>
        // valSchema is {} which OpenAPI treats as "any value").
        return {
          type: 'object',
          additionalProperties: valSchema == null ? {} : valSchema,
        };
      }

      // Built-in `Date` → OpenAPI date-time string. TS interfaces use
      // `Date` for wall-clock fields (resolutionDate, since, until, ...);
      // on the wire they're serialised to ISO-8601 strings.
      if (name === 'Date') {
        return { type: 'string', format: 'date-time' };
      }

      if (TYPE_REF_MAP[name]) {
        return { $ref: `#/components/schemas/${TYPE_REF_MAP[name]}` };
      }

      // Type alias (e.g. `export type CandleInterval = '1m' | '5m' | ...`).
      // Resolve by recursing into the aliased type node. We don't emit
      // these as component schemas because they're primitive unions,
      // not object shapes — inlining gives much better docs (the docs
      // show the enum values directly instead of a $ref).
      const alias = TYPE_ALIAS_REGISTRY.get(name);
      if (alias) {
        return typeNodeToSchema(alias.typeNode, alias.sourceFile);
      }

      // Unknown type reference — approximate as generic object
      return { type: 'object' };
    }

    case ts.SyntaxKind.UnionType: {
      const members = node.types;
      // Track whether the union includes `null` (an explicit `null` member
      // means the field is nullable on the wire even if also `?:` optional).
      // We strip `null` / `undefined` before classifying the union shape,
      // then re-apply `nullable: true` to the resulting schema so the JSON
      // shape stays a single type rather than a `oneOf [T, null]`.
      // TS parses `null` inside a union as `LiteralType` wrapping
      // `NullKeyword` (not bare `NullKeyword`), so check both forms.
      const isNullMember = (t) =>
        t.kind === ts.SyntaxKind.NullKeyword ||
        (t.kind === ts.SyntaxKind.LiteralType &&
          t.literal &&
          t.literal.kind === ts.SyntaxKind.NullKeyword);
      const isUndefinedMember = (t) =>
        t.kind === ts.SyntaxKind.UndefinedKeyword;
      const includesNull = members.some(isNullMember);
      const nonNull = members.filter(
        t => !isNullMember(t) && !isUndefinedMember(t)
      );

      if (nonNull.length === 0) return null;

      const withNullable = (schema) => {
        if (!includesNull || !schema) return schema;
        // OpenAPI 3.0: nullable is a sibling keyword on the schema itself.
        // For $ref values we wrap in allOf so nullable doesn't get dropped.
        if (schema.$ref) {
          return { allOf: [schema], nullable: true };
        }
        return { ...schema, nullable: true };
      };

      // All string literals → enum
      if (
        nonNull.every(
          t =>
            t.kind === ts.SyntaxKind.LiteralType &&
            t.literal.kind === ts.SyntaxKind.StringLiteral
        )
      ) {
        return withNullable({
          type: 'string',
          enum: nonNull.map(t => t.literal.text),
        });
      }

      if (nonNull.length === 1) {
        return withNullable(typeNodeToSchema(nonNull[0], sourceFile));
      }

      const schemas = nonNull
        .map(t => typeNodeToSchema(t, sourceFile))
        .filter(s => s !== null);
      if (schemas.length === 0) return null;
      if (schemas.length === 1) return withNullable(schemas[0]);
      return withNullable({ oneOf: schemas });
    }

    case ts.SyntaxKind.LiteralType: {
      const lit = node.literal;
      if (lit.kind === ts.SyntaxKind.StringLiteral) {
        return { type: 'string', enum: [lit.text] };
      }
      if (lit.kind === ts.SyntaxKind.NumericLiteral) {
        return { type: 'number' };
      }
      if (
        lit.kind === ts.SyntaxKind.TrueKeyword ||
        lit.kind === ts.SyntaxKind.FalseKeyword
      ) {
        return { type: 'boolean' };
      }
      return {};
    }

    case ts.SyntaxKind.TypeLiteral: {
      // Inline object type: { key?: T; ... }
      const properties = {};
      const requiredProps = [];
      for (const member of node.members) {
        if (member.kind !== ts.SyntaxKind.PropertySignature || !member.name) {
          continue;
        }
        let propName;
        if (member.name.kind === ts.SyntaxKind.Identifier) {
          propName = member.name.text;
        } else if (member.name.kind === ts.SyntaxKind.StringLiteral) {
          propName = member.name.text;
        } else {
          continue; // Skip computed property names
        }
        const isOptional = !!member.questionToken;
        const propSchema = typeNodeToSchema(member.type, sourceFile);
        if (propSchema !== null) {
          properties[propName] = propSchema;
          if (!isOptional) requiredProps.push(propName);
        }
      }
      const result = { type: 'object', properties };
      if (requiredProps.length > 0) result.required = requiredProps;
      return result;
    }

    case ts.SyntaxKind.FunctionType:
    case ts.SyntaxKind.ConstructorType:
      // Function types can't cross an HTTP boundary; approximate as object
      return { type: 'object' };

    case ts.SyntaxKind.ParenthesizedType:
      return typeNodeToSchema(node.type, sourceFile);

    default:
      return { type: 'object' };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SUMMARY_OVERRIDES = {
  fetchMarketMatches: 'Market Matches',
  fetchEventMatches: 'Event Matches',
  compareMarketPrices: 'Compare Prices Across Venues',
  fetchHedges: 'Find Hedging Opportunities',
  fetchArbitrage: 'Find Arbitrage Opportunities',
  fetchRelatedMarkets: 'Find Related Markets',
  fetchMatchedMarkets: 'Matched Markets',
  fetchMatchedPrices: 'Compare Matched Market Prices',
};

function camelToTitle(name) {
  if (SUMMARY_OVERRIDES[name]) return SUMMARY_OVERRIDES[name];
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}

function getJSDocDescription(node, sourceFile) {
  const ranges = ts.getLeadingCommentRanges(sourceFile.text, node.pos);
  if (!ranges || ranges.length === 0) return null;

  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i];
    const text = sourceFile.text.slice(r.pos, r.end);
    if (!text.startsWith('/**')) continue;

    // Strip /** ... */ and leading " * " on each line
    const inner = text.slice(3, -2);
    const lines = inner
      .split('\n')
      .map(l => l.replace(/^\s*\*\s?/, '').trimEnd());

    // Collect lines until we hit a @tag
    const descLines = [];
    for (const line of lines) {
      if (line.trimStart().startsWith('@')) break;
      descLines.push(line);
    }

    const description = descLines
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return description || null;
  }
  return null;
}

function isDeprecated(node, sourceFile) {
  const ranges = ts.getLeadingCommentRanges(sourceFile.text, node.pos);
  if (!ranges || ranges.length === 0) return false;

  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i];
    const text = sourceFile.text.slice(r.pos, r.end);
    if (!text.startsWith('/**')) continue;
    if (/@deprecated/i.test(text)) return true;
  }
  return false;
}

function isPublicMethod(node) {
  if (!node.modifiers) return true;
  for (const mod of node.modifiers) {
    if (
      mod.kind === ts.SyntaxKind.PrivateKeyword ||
      mod.kind === ts.SyntaxKind.ProtectedKeyword ||
      mod.kind === ts.SyntaxKind.AbstractKeyword
    ) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Verb classification + per-parameter metadata
//
// Methods whose name starts with `fetch` are exposed as **GET** on the
// HTTP surface (idempotent, cacheable, browser-native). Everything else —
// writes (`createOrder`, `cancelOrder`, ...), loaders (`loadMarkets`),
// lifecycle (`close`), realtime (`watch*`, `unwatch*`), and in-memory
// utilities (`filterMarkets`, `getExecutionPrice*`) — stays as **POST**
// because they either mutate state, carry credentials in the body, or
// take structural arguments that don't fit cleanly in a query string.
//
// A method is GET-eligible if its signature fits the shape
// `[primitive..., object?]`: any number of primitive args (routed by
// name in the query string), optionally followed by a single object arg
// whose remaining properties also travel as query params. The server's
// `queryToArgs` reserves primitive arg names and spreads everything
// else into the object slot, so this shape round-trips cleanly. Methods
// with more than one object arg, or with unknown parameter kinds, stay
// POST.
// ---------------------------------------------------------------------------

function paramKind(typeNode) {
  if (!typeNode) return 'unknown';
  switch (typeNode.kind) {
    case ts.SyntaxKind.StringKeyword:
      return 'string';
    case ts.SyntaxKind.NumberKeyword:
      return 'number';
    case ts.SyntaxKind.BooleanKeyword:
      return 'boolean';
    case ts.SyntaxKind.TypeReference:
    case ts.SyntaxKind.TypeLiteral:
      return 'object';
    case ts.SyntaxKind.UnionType: {
      const members = typeNode.types.filter(
        t =>
          t.kind !== ts.SyntaxKind.NullKeyword &&
          t.kind !== ts.SyntaxKind.UndefinedKeyword
      );
      // Union of named object types → object-kind (fetchTrades takes
      // `TradesParams | HistoryFilterParams`, etc.)
      if (members.every(t => t.kind === ts.SyntaxKind.TypeReference)) {
        return 'object';
      }
      // Union of string literals → string-kind (fetchOrderBook takes
      // `side?: 'yes' | 'no'`). These serialize as query params fine.
      if (members.every(t =>
        t.kind === ts.SyntaxKind.LiteralType &&
        t.literal.kind === ts.SyntaxKind.StringLiteral
      )) {
        return 'string';
      }
      return 'unknown';
    }
    default:
      return 'unknown';
  }
}

function paramTypeName(typeNode) {
  if (!typeNode) return null;
  if (typeNode.kind === ts.SyntaxKind.TypeReference) {
    const tn = typeNode.typeName;
    return tn.kind === ts.SyntaxKind.Identifier ? tn.text : tn.right.text;
  }
  if (typeNode.kind === ts.SyntaxKind.UnionType) {
    // Pick the first named type in a union for property enumeration.
    for (const t of typeNode.types) {
      if (t.kind === ts.SyntaxKind.TypeReference) {
        const tn = t.typeName;
        return tn.kind === ts.SyntaxKind.Identifier ? tn.text : tn.right.text;
      }
    }
  }
  return null;
}

function extractParamMeta(method) {
  return method.parameters.map(p => {
    const name =
      p.name && p.name.kind === ts.SyntaxKind.Identifier ? p.name.text : 'arg';
    const optional = !!p.questionToken || !!p.initializer;
    const kind = paramKind(p.type);
    const typeName = paramTypeName(p.type);
    return { name, optional, kind, typeName };
  });
}

const WS_METHODS = new Set([
  'watchOrderBook', 'watchOrderBooks', 'watchAllOrderBooks',
  'watchTrades', 'watchAddress',
  'unwatchOrderBook', 'unwatchAddress',
]);

function classifyVerb(methodName, paramsMeta) {
  if (WS_METHODS.has(methodName)) return 'ws';
  if (!methodName.startsWith('fetch')) return 'post';
  if (paramsMeta.length === 0) return 'get';
  // Reject unknown kinds outright — we can't safely serialise them.
  const isPrimitive = k =>
    k === 'string' || k === 'number' || k === 'boolean';
  if (!paramsMeta.every(p => isPrimitive(p.kind) || p.kind === 'object')) {
    return 'post';
  }
  // At most one object arg. `queryToArgs` reserves primitive arg names
  // and spreads the rest of the query string into the object slot, so
  // `(id: string, params: object)` shapes round-trip cleanly.
  const objectCount = paramsMeta.filter(p => p.kind === 'object').length;
  if (objectCount > 1) return 'post';
  return 'get';
}

// Expand an object-typed parameter into a list of query parameter
// definitions. We look up the named type in our static SCHEMAS map; for
// inline type literals we walk the AST members directly.
function expandObjectParamToQuery(param, methodParam, sourceFile) {
  const queryParams = [];

  // Named type — enumerate from SCHEMAS
  if (param.typeName) {
    const schemaName = TYPE_REF_MAP[param.typeName] || param.typeName;
    const schema = SCHEMAS[schemaName];
    if (schema && schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        // Hoist description to the parameter level (canonical OpenAPI location)
        // and strip it from the inner schema to avoid duplication.
        const { description, ...schemaWithoutDesc } = propSchema;
        const qp = {
          in: 'query',
          name: propName,
          required: false,
          schema: schemaWithoutDesc,
        };
        if (description) qp.description = description;
        queryParams.push(qp);
      }
      return queryParams;
    }
  }

  // Inline object type — walk the TypeLiteral members
  if (
    methodParam.type &&
    methodParam.type.kind === ts.SyntaxKind.TypeLiteral
  ) {
    for (const member of methodParam.type.members) {
      if (
        member.kind !== ts.SyntaxKind.PropertySignature ||
        !member.name ||
        member.name.kind !== ts.SyntaxKind.Identifier
      ) {
        continue;
      }
      const propSchema = typeNodeToSchema(member.type, sourceFile) || {
        type: 'string',
      };
      queryParams.push({
        in: 'query',
        name: member.name.text,
        required: !member.questionToken,
        schema: propSchema,
      });
    }
  }

  return queryParams;
}

// ---------------------------------------------------------------------------
// Build a single OpenAPI path entry from a MethodDeclaration node
// ---------------------------------------------------------------------------

function buildPathSpec(method, sourceFile) {
  const name = method.name.text;
  const params = method.parameters;
  const paramsMeta = extractParamMeta(method);
  const verb = classifyVerb(name, paramsMeta);

  let requiredCount = 0;
  for (const p of params) {
    if (!p.questionToken && !p.initializer) requiredCount++;
  }
  const totalCount = params.length;

  // Build the response schema from the return type
  const returnSchema = method.type ? typeNodeToSchema(method.type, sourceFile) : null;

  let responseSchema;
  if (returnSchema === null) {
    responseSchema = { $ref: '#/components/schemas/BaseResponse' };
  } else {
    responseSchema = {
      allOf: [
        { $ref: '#/components/schemas/BaseResponse' },
        { type: 'object', properties: { data: returnSchema } },
      ],
    };
  }

  const description = getJSDocDescription(method, sourceFile);
  const summary = camelToTitle(name);
  const deprecated = isDeprecated(method, sourceFile);

  // ---- WS: WebSocket streaming method ------------------------------------
  if (verb === 'ws') {
    const wsDescription = [
      description || summary,
      '',
      '**Transport:** WebSocket',
      '',
      '| Environment | URL |',
      '|---|---|',
      '| Local sidecar | `ws://localhost:3847/ws` |',
      '| Hosted API | `wss://api.pmxt.dev/ws?apiKey=YOUR_KEY` |',
      '',
      '**Subscribe:**',
      '```json',
      `{ "id": "req-1", "action": "subscribe", "method": "${name}", "args": [...] }`,
      '```',
      '',
      '**Server response:**',
      '```json',
      '{ "event": "data", "id": "req-1", "method": "' + name + '", "symbol": "...", "data": { ... } }',
      '```',
      '',
      '**Unsubscribe:**',
      '```json',
      '{ "id": "req-1", "action": "unsubscribe" }',
      '```',
    ].join('\n');

    const pathObj = {
      post: {
        summary,
        operationId: name,
        parameters: [{ $ref: '#/components/parameters/ExchangeParam' }],
        description: wsDescription,
        responses: {
          '200': {
            description: `${summary} response`,
            content: {
              'application/json': { schema: responseSchema },
            },
          },
        },
      },
    };
    if (deprecated) pathObj.post.deprecated = true;
    return { name, pathObj, verb, paramsMeta };
  }

  // ---- GET: query-parameter shape, no request body ----------------------
  if (verb === 'get') {
    const parameters = [{ $ref: '#/components/parameters/ExchangeParam' }];

    // Emit each param in order: primitives become flat query params
    // named after the TS arg; object params get their properties
    // expanded into flat query params via the SCHEMAS lookup. This
    // handles both shapes we care about: a single object arg
    // (fetchMarkets(params)) and mixed `[primitive..., object]` shapes
    // (fetchOHLCV(id, params)). Without the expansion the object arg
    // would render as a meaningless `params: string` field in the docs.
    for (let i = 0; i < paramsMeta.length; i++) {
      const pm = paramsMeta[i];
      if (pm.kind === 'object') {
        parameters.push(
          ...expandObjectParamToQuery(pm, params[i], sourceFile)
        );
        continue;
      }
      parameters.push({
        in: 'query',
        name: pm.name,
        required: !pm.optional,
        schema: {
          type:
            pm.kind === 'number'
              ? 'number'
              : pm.kind === 'boolean'
              ? 'boolean'
              : 'string',
        },
      });
    }

    const pathObj = {
      get: {
        summary,
        operationId: name,
        parameters,
        responses: {
          '200': {
            description: `${summary} response`,
            content: {
              'application/json': { schema: responseSchema },
            },
          },
        },
      },
    };
    if (description) pathObj.get.description = description;
    if (deprecated) pathObj.get.deprecated = true;
    return { name, pathObj, verb, paramsMeta };
  }

  // ---- POST: existing args/credentials request-body shape ---------------
  let argsSchema;
  if (totalCount === 0) {
    argsSchema = { type: 'array', maxItems: 0, items: {} };
  } else if (totalCount === 1) {
    const p = params[0];
    const itemSchema = typeNodeToSchema(p.type, sourceFile) || {};
    argsSchema = { type: 'array', maxItems: 1, items: itemSchema };
    if (requiredCount === 1) argsSchema.minItems = 1;
  } else {
    const itemSchemas = params.map(p => typeNodeToSchema(p.type, sourceFile) || {});
    // Flatten nested oneOfs — openapi-generator-cli produces broken TS
    // output for anonymous nested oneOf schemas (missing `instanceOf*`
    // type guards for the inner variants). A flat union is semantically
    // equivalent here since `items` applies to every tuple position.
    const flattened = [];
    for (const s of itemSchemas) {
      if (s && Array.isArray(s.oneOf) && Object.keys(s).length === 1) {
        flattened.push(...s.oneOf);
      } else {
        flattened.push(s);
      }
    }
    argsSchema = {
      type: 'array',
      minItems: requiredCount,
      maxItems: totalCount,
      items: { oneOf: flattened },
    };
  }

  const requestBodySchema = {
    title: name.charAt(0).toUpperCase() + name.slice(1) + 'Request',
    type: 'object',
    properties: {
      args: argsSchema,
      credentials: { $ref: '#/components/schemas/ExchangeCredentials' },
    },
  };
  if (requiredCount > 0) {
    requestBodySchema.required = ['args'];
  }

  const pathObj = {
    post: {
      summary,
      operationId: name,
      parameters: [{ $ref: '#/components/parameters/ExchangeParam' }],
      requestBody: {
        content: {
          'application/json': { schema: requestBodySchema },
        },
      },
      responses: {
        '200': {
          description: `${summary} response`,
          content: {
            'application/json': { schema: responseSchema },
          },
        },
      },
    },
  };

  if (description) {
    pathObj.post.description = description;
  }
  if (deprecated) {
    pathObj.post.deprecated = true;
  }

  return { name, pathObj, verb, paramsMeta };
}

// ---------------------------------------------------------------------------
// Parse BaseExchange.ts and extract public MethodDeclaration nodes
// ---------------------------------------------------------------------------

function extractMethods(sourceFile) {
  const methods = [];

  function visitClass(classNode) {
    for (const member of classNode.members) {
      if (member.kind !== ts.SyntaxKind.MethodDeclaration) continue;
      if (!isPublicMethod(member)) continue;

      const name =
        member.name && member.name.kind === ts.SyntaxKind.Identifier
          ? member.name.text
          : null;
      if (!name) continue;
      if (EXCLUDED_METHODS.has(name)) continue;

      methods.push(member);
    }
  }

  function visit(node) {
    if (node.kind === ts.SyntaxKind.ClassDeclaration) {
      visitClass(node);
      return; // Don't descend into nested classes
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return methods;
}

// ---------------------------------------------------------------------------
// Component schemas
//
// Everything that corresponds to a TypeScript interface in the core
// source files is AST-derived: we walk the interface's PropertySignature
// members and emit a JSON schema with per-property descriptions pulled
// from JSDoc (/** ... */) blocks or trailing `//` line comments. This
// replaces the hand-maintained SCHEMAS literal that previously shipped
// here — that literal silently drifted from types.ts every time a new
// field was added (most of them) or a description was tweaked (all of
// them), which surfaced in Mintlify as undocumented params.
//
// Only wire envelopes (BaseResponse, ErrorDetail, BaseRequest,
// ErrorResponse) stay hardcoded: they describe the JSON shape the
// server wraps every call in, and have no 1:1 TS counterpart.
// ---------------------------------------------------------------------------

const SOURCE_FILES = [
  path.join(__dirname, '../src/BaseExchange.ts'),
  path.join(__dirname, '../src/types.ts'),
  path.join(__dirname, '../src/utils/math.ts'),
  path.join(__dirname, '../src/router/types.ts'),
];

const STATIC_SCHEMAS = {
  BaseResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      error: { $ref: '#/components/schemas/ErrorDetail' },
    },
  },
  ErrorDetail: {
    type: 'object',
    description:
      'Structured error envelope returned inside `BaseResponse.error` and `ErrorResponse.error`. ' +
      'Hosted-mode endpoints populate `code`, `retryable`, and optionally `exchange` / `detail`; ' +
      'legacy local-mode endpoints may still return only `message`.',
    properties: {
      message: {
        type: 'string',
        description: 'Human-readable error message.',
      },
      code: {
        type: 'string',
        description:
          'Stable machine-readable error code. Hosted-mode errors use the `HostedTradingError` family ' +
          '(e.g. `INSUFFICIENT_ESCROW_BALANCE`, `BUILT_ORDER_EXPIRED`); pre-hosted local errors use the ' +
          'legacy family (e.g. `BAD_REQUEST`, `NOT_FOUND`).',
        enum: [
          // Hosted-mode error codes (v2.49.0+)
          'HOSTED_TRADING_ERROR',
          'INSUFFICIENT_ESCROW_BALANCE',
          'ORDER_SIZE_TOO_SMALL',
          'INVALID_API_KEY',
          'OUTCOME_NOT_FOUND',
          'CATALOG_UNAVAILABLE',
          'BUILT_ORDER_EXPIRED',
          'INVALID_SIGNATURE',
          'NO_LIQUIDITY',
          'MISSING_WALLET_ADDRESS',
          // Pre-hosted (legacy) error codes
          'BAD_REQUEST',
          'AUTHENTICATION_ERROR',
          'PERMISSION_DENIED',
          'NOT_FOUND',
          'ORDER_NOT_FOUND',
          'MARKET_NOT_FOUND',
          'EVENT_NOT_FOUND',
          'RATE_LIMIT_EXCEEDED',
          'INVALID_ORDER',
          'INSUFFICIENT_FUNDS',
          'VALIDATION_ERROR',
          'NETWORK_ERROR',
          'EXCHANGE_NOT_AVAILABLE',
          'NOT_SUPPORTED',
        ],
      },
      retryable: {
        type: 'boolean',
        description:
          'Hint for clients: when `true`, the same request may succeed on retry (e.g. transient network ' +
          'or rate-limit conditions); when `false`, the caller should not retry without modifying the ' +
          'request.',
      },
      exchange: {
        type: 'string',
        nullable: true,
        description:
          "Venue the error originated from, when known (e.g. 'polymarket', 'kalshi').",
      },
      detail: {
        type: 'object',
        additionalProperties: {},
        nullable: true,
        description:
          'Free-form hosted-mode detail blob. Shape depends on `code` — e.g. for ' +
          '`INSUFFICIENT_ESCROW_BALANCE` it may include `{ requested, available }`; for ' +
          '`ORDER_SIZE_TOO_SMALL` it may include `{ min }`; for `BUILT_ORDER_EXPIRED` it may include ' +
          '`{ expiry }`.',
      },
    },
  },
  ExchangeOptions: {
    type: 'object',
    description:
      'Constructor-level options for venue clients (Polymarket, Kalshi, Opinion, etc.).\n' +
      'Hosted mode is the default when pmxtApiKey is set; otherwise the SDK runs against\n' +
      'a local sidecar with venue credentials.',
    properties: {
      pmxtApiKey: {
        type: 'string',
        description:
          'PMXT customer API key. When set, the SDK routes to api.pmxt.dev (catalog) and ' +
          'trade.pmxt.dev (trading). Get one at pmxt.dev/dashboard.',
      },
      walletAddress: {
        type: 'string',
        nullable: true,
        description:
          'EVM wallet address for hosted reads/writes. Required for endpoints that operate on a wallet ' +
          '(balances, positions, trades, open orders).',
      },
      signer: {
        type: 'object',
        nullable: true,
        description:
          'Optional pre-built signer for hosted writes. If absent and privateKey is set, the SDK ' +
          'auto-wraps privateKey into a signer.',
      },
      privateKey: {
        type: 'string',
        nullable: true,
        description:
          'Private key. In hosted mode, used to derive an EIP-712 signer for writes (wraps into ' +
          'EthAccountSigner/EthersSigner). In self-hosted mode, used as the venue credential directly.',
      },
      baseUrl: {
        type: 'string',
        nullable: true,
        description:
          'Explicit base URL override. When unset, the SDK uses api.pmxt.dev when pmxtApiKey is set, ' +
          'or the local sidecar otherwise.',
      },
      apiKey: {
        type: 'string',
        nullable: true,
        description:
          'Venue-side API key (e.g. Polymarket CLOB key). Only relevant for self-hosted mode.',
      },
      autoStartServer: {
        type: 'boolean',
        nullable: true,
        description:
          'Auto-start the local sidecar when running self-hosted. Defaults to true when no pmxtApiKey ' +
          'is set, false when hosted.',
      },
    },
  },
  BaseRequest: {
    type: 'object',
    description: 'Base request structure with optional credentials',
    properties: {
      credentials: { $ref: '#/components/schemas/ExchangeCredentials' },
    },
  },
  ErrorResponse: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      error: { $ref: '#/components/schemas/ErrorDetail' },
    },
  },
};

// Order in which AST-derived schemas are emitted. Matches the grouping
// the hand-maintained literal used, purely so diffs stay readable.
const GENERATED_SCHEMA_ORDER = [
  // Core data models
  'UnifiedMarket',
  'MarketOutcome',
  'UnifiedEvent',
  'UnifiedSeries',
  'PriceCandle',
  'OrderBook',
  'OrderLevel',
  'Trade',
  'UserTrade',
  // Trading data models
  'Order',
  'Position',
  'Balance',
  'ExecutionPriceResult',
  'PaginatedMarketsResult',
  'PaginatedEventsResult',
  // Input parameter schemas
  'MarketFilterParams',
  'EventFetchParams',
  'HistoryFilterParams',
  'OHLCVParams',
  'FetchOrderBookParams',
  'TradesParams',
  'CreateOrderParams',
  'BuiltOrder',
  'MyTradesParams',
  'OrderHistoryParams',
  // Filtering criteria
  'MarketFilterCriteria',
  'EventFilterCriteria',
  // Matching types (Router)
  'FetchMarketMatchesParams',
  'FetchEventMatchesParams',
  'FetchArbitrageParams',
  'MatchResult',
  'EventMatchResult',
  'PriceComparison',
  'ArbitrageOpportunity',
  'FetchMatchedMarketsParams',
  'MatchedMarketPair',
  // Auth
  'ExchangeCredentials',
];

// Look up a property description: prefer a leading JSDoc `/** ... */`
// block, fall back to a trailing `// ...` line comment on the same
// line. Most BaseExchange.ts param interfaces use the trailing style;
// most types.ts fields use JSDoc. Both flow through.
function getPropertyDescription(member, sourceFile) {
  const jsdoc = getJSDocDescription(member, sourceFile);
  if (jsdoc) return jsdoc;

  const trailing = ts.getTrailingCommentRanges(sourceFile.text, member.end);
  if (trailing && trailing.length > 0) {
    const r = trailing[0];
    const text = sourceFile.text.slice(r.pos, r.end);
    if (text.startsWith('//')) {
      return text.slice(2).trim() || null;
    }
    if (text.startsWith('/*') && text.endsWith('*/')) {
      return text.slice(2, -2).trim() || null;
    }
  }
  return null;
}

// Module-level type alias map. Populated by buildInterfaceRegistry().
// Accessed by typeNodeToSchema when it encounters a TypeReference whose
// name isn't a known interface in TYPE_REF_MAP — e.g. `CandleInterval`
// which is `'1m' | '5m' | '15m' | '1h' | '6h' | '1d'`.
const TYPE_ALIAS_REGISTRY = new Map();

// Parse every source file once up front. Index InterfaceDeclarations
// by name for buildInterfaceSchema, and index TypeAliasDeclarations
// (e.g. `type CandleInterval = '1m' | ...`) for typeNodeToSchema to
// resolve inline.
function buildInterfaceRegistry() {
  const registry = new Map();
  TYPE_ALIAS_REGISTRY.clear();
  for (const filePath of SOURCE_FILES) {
    const src = fs.readFileSync(filePath, 'utf-8');
    const sf = ts.createSourceFile(
      path.basename(filePath),
      src,
      ts.ScriptTarget.ES2022,
      /* setParentNodes */ true
    );
    ts.forEachChild(sf, function visit(node) {
      if (node.kind === ts.SyntaxKind.InterfaceDeclaration && node.name) {
        registry.set(node.name.text, { node, sourceFile: sf });
      } else if (node.kind === ts.SyntaxKind.TypeAliasDeclaration && node.name) {
        TYPE_ALIAS_REGISTRY.set(node.name.text, {
          typeNode: node.type,
          sourceFile: sf,
        });
      }
      // Interfaces in pmxt-core are all top-level exports, so no need
      // to recurse into namespaces / modules here.
    });
  }
  return registry;
}

// Build a JSON schema from a TS interface by walking its members.
// Handles `extends` by recursively merging parent properties, and
// emits `required` from the absence of question tokens.
function buildInterfaceSchema(interfaceName, registry, visiting = new Set()) {
  if (visiting.has(interfaceName)) return null; // cycle guard
  const entry = registry.get(interfaceName);
  if (!entry) return null;
  visiting.add(interfaceName);

  const { node, sourceFile } = entry;
  const properties = {};
  const required = [];

  // Merge parent interfaces first so child members can override.
  if (node.heritageClauses) {
    for (const clause of node.heritageClauses) {
      if (clause.token !== ts.SyntaxKind.ExtendsKeyword) continue;
      for (const expr of clause.types) {
        if (!expr.expression || expr.expression.kind !== ts.SyntaxKind.Identifier) {
          continue;
        }
        const parentName = expr.expression.text;
        const parentSchema = buildInterfaceSchema(parentName, registry, visiting);
        if (parentSchema && parentSchema.properties) {
          Object.assign(properties, parentSchema.properties);
          if (Array.isArray(parentSchema.required)) {
            for (const r of parentSchema.required) {
              if (!required.includes(r)) required.push(r);
            }
          }
        }
      }
    }
  }

  for (const member of node.members) {
    if (member.kind !== ts.SyntaxKind.PropertySignature || !member.name) continue;
    let propName;
    if (member.name.kind === ts.SyntaxKind.Identifier) {
      propName = member.name.text;
    } else if (member.name.kind === ts.SyntaxKind.StringLiteral) {
      propName = member.name.text;
    } else {
      continue;
    }

    const isOptional = !!member.questionToken;
    let propSchema = typeNodeToSchema(member.type, sourceFile);
    if (propSchema === null) continue;

    const description = getPropertyDescription(member, sourceFile);
    if (description) {
      if (propSchema.$ref) {
        // OpenAPI 3.0: sibling keys of $ref are ignored, so wrap in allOf
        propSchema = { allOf: [propSchema], description };
      } else if (!propSchema.description) {
        propSchema.description = description;
      }
    }

    properties[propName] = propSchema;

    if (isOptional) {
      const idx = required.indexOf(propName);
      if (idx >= 0) required.splice(idx, 1);
    } else if (!required.includes(propName)) {
      required.push(propName);
    }
  }

  visiting.delete(interfaceName);

  const schema = { type: 'object' };
  // Interface-level JSDoc becomes the schema description.
  const interfaceDesc = getJSDocDescription(node, sourceFile);
  if (interfaceDesc) schema.description = interfaceDesc;
  schema.properties = properties;
  if (required.length > 0) schema.required = required;
  return schema;
}

function buildAllSchemas(registry) {
  const schemas = { ...STATIC_SCHEMAS };
  for (const interfaceName of GENERATED_SCHEMA_ORDER) {
    const schema = buildInterfaceSchema(interfaceName, registry);
    if (!schema) {
      throw new Error(
        `[generate-openapi] Failed to locate interface "${interfaceName}" ` +
          `in any of: ${SOURCE_FILES.map(f => path.basename(f)).join(', ')}. ` +
          `Either the interface was renamed/moved or SOURCE_FILES needs ` +
          `an additional entry.`
      );
    }
    schemas[interfaceName] = schema;
  }
  return schemas;
}

// Placeholder — replaced by buildAllSchemas() at runtime. Left in place
// so the rest of the file can keep referring to `SCHEMAS` while we
// transition; main() populates it before any consumer runs.
let SCHEMAS = { ...STATIC_SCHEMAS };


// ---------------------------------------------------------------------------
// Data Feed schemas and paths
//
// Feed endpoints live at /api/feeds/{feed}/{method} and use CCXT-compatible
// types (Ticker, Market, OracleRound) that differ from the prediction-market
// types in types.ts. Defined statically to avoid naming conflicts with the
// AST-derived exchange schemas (both define OrderBook, Market, etc.).
// ---------------------------------------------------------------------------

const FEED_SCHEMAS = {
  FeedTicker: {
    type: 'object',
    description: 'CCXT-compatible ticker with last trade price and metadata.',
    properties: {
      symbol: { type: 'string', description: 'Trading pair symbol (e.g. BTC/USD)' },
      info: { description: 'Raw provider-specific data' },
      timestamp: { type: 'integer', description: 'Unix timestamp in milliseconds' },
      datetime: { type: 'string', format: 'date-time' },
      high: { type: 'number' }, low: { type: 'number' },
      bid: { type: 'number' }, bidVolume: { type: 'number' },
      ask: { type: 'number' }, askVolume: { type: 'number' },
      vwap: { type: 'number' }, open: { type: 'number' },
      close: { type: 'number' },
      last: { type: 'number', description: 'Last trade price' },
      previousClose: { type: 'number' },
      change: { type: 'number' }, percentage: { type: 'number' },
      average: { type: 'number' },
      quoteVolume: { type: 'number' }, baseVolume: { type: 'number' },
      indexPrice: { type: 'number' }, markPrice: { type: 'number' },
    },
    required: ['symbol'],
  },
  FeedMarket: {
    type: 'object',
    description: 'CCXT-compatible market descriptor for a data feed.',
    properties: {
      id: { type: 'string' },
      symbol: { type: 'string' },
      base: { type: 'string' },
      quote: { type: 'string' },
      active: { type: 'boolean' },
      type: { type: 'string' },
      info: { description: 'Provider-specific metadata' },
    },
    required: ['id', 'symbol', 'base', 'quote'],
  },
  FeedOracleRound: {
    type: 'object',
    description: 'Chainlink oracle price round.',
    properties: {
      feed: { type: 'string', description: 'Price feed pair (e.g. BTC/USD)' },
      roundId: { type: 'string' },
      answer: { type: 'number', description: 'Oracle price' },
      startedAt: { type: 'integer' },
      updatedAt: { type: 'integer' },
      answeredInRound: { type: 'string' },
      decimals: { type: 'integer' },
      description: { type: 'string' },
    },
    required: ['feed', 'roundId', 'answer', 'startedAt', 'updatedAt', 'answeredInRound', 'decimals'],
  },
};

const FEED_PARAM = {
  in: 'path',
  name: 'feed',
  schema: { type: 'string', enum: ['binance', 'chainlink'] },
  required: true,
  description: 'The data feed provider.',
};

function feedResponse(dataSchema) {
  return {
    '200': {
      description: 'Successful response',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: dataSchema,
            },
          },
        },
      },
    },
  };
}

function buildFeedPaths() {
  const paths = {};

  paths['/api/feeds'] = {
    get: {
      summary: 'List Available Feeds',
      operationId: 'feedList',
      description: 'Returns the list of available data feed providers.',
      responses: feedResponse({ type: 'array', items: { type: 'string' } }),
      tags: ['Data Feeds'],
    },
  };

  paths['/api/feeds/{feed}/loadMarkets'] = {
    get: {
      summary: 'Load Feed Markets',
      operationId: 'feedLoadMarkets',
      description: 'Returns all trading pairs supported by this feed.',
      parameters: [FEED_PARAM],
      responses: feedResponse({
        type: 'object',
        additionalProperties: { $ref: '#/components/schemas/FeedMarket' },
      }),
      tags: ['Data Feeds'],
    },
  };

  paths['/api/feeds/{feed}/fetchTicker'] = {
    get: {
      summary: 'Fetch Ticker',
      operationId: 'feedFetchTicker',
      description: 'Returns the latest ticker for a single symbol.',
      parameters: [
        FEED_PARAM,
        { in: 'query', name: 'symbol', required: true, schema: { type: 'string' }, description: 'Trading pair (e.g. BTC/USD, BTC/USDT)' },
      ],
      responses: feedResponse({ $ref: '#/components/schemas/FeedTicker' }),
      tags: ['Data Feeds'],
    },
  };

  paths['/api/feeds/{feed}/fetchTickers'] = {
    get: {
      summary: 'Fetch Tickers',
      operationId: 'feedFetchTickers',
      description: 'Returns the latest tickers for all symbols, or a filtered subset.',
      parameters: [
        FEED_PARAM,
        { in: 'query', name: 'symbols', required: false, schema: { type: 'string' }, description: 'Comma-separated symbols to filter (optional)' },
      ],
      responses: feedResponse({
        type: 'object',
        additionalProperties: { $ref: '#/components/schemas/FeedTicker' },
      }),
      tags: ['Data Feeds'],
    },
  };

  paths['/api/feeds/{feed}/fetchOHLCV'] = {
    get: {
      summary: 'Fetch OHLCV',
      operationId: 'feedFetchOHLCV',
      description: 'Returns OHLCV candle data for a symbol.',
      parameters: [
        FEED_PARAM,
        { in: 'query', name: 'symbol', required: true, schema: { type: 'string' }, description: 'Trading pair' },
        { in: 'query', name: 'timeframe', required: false, schema: { type: 'string', default: '1h' }, description: 'Candle interval (e.g. 1m, 5m, 1h, 1d)' },
        { in: 'query', name: 'since', required: false, schema: { type: 'integer' }, description: 'Start timestamp in ms' },
        { in: 'query', name: 'limit', required: false, schema: { type: 'integer' }, description: 'Max candles to return' },
      ],
      responses: feedResponse({
        type: 'array',
        items: { type: 'array', items: { type: 'number' }, minItems: 6, maxItems: 6 },
        description: 'Array of [timestamp, open, high, low, close, volume] tuples',
      }),
      tags: ['Data Feeds'],
    },
  };

  paths['/api/feeds/{feed}/fetchOrderBook'] = {
    get: {
      summary: 'Fetch Order Book',
      operationId: 'feedFetchOrderBook',
      description: 'Returns the current order book for a symbol (where supported).',
      parameters: [
        FEED_PARAM,
        { in: 'query', name: 'symbol', required: true, schema: { type: 'string' }, description: 'Trading pair' },
        { in: 'query', name: 'limit', required: false, schema: { type: 'integer' }, description: 'Depth limit' },
      ],
      responses: feedResponse({
        type: 'object',
        properties: {
          asks: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
          bids: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
          timestamp: { type: 'integer' },
          datetime: { type: 'string' },
          symbol: { type: 'string' },
        },
      }),
      tags: ['Data Feeds'],
    },
  };

  paths['/api/feeds/{feed}/fetchOracleRound'] = {
    get: {
      summary: 'Fetch Oracle Round',
      operationId: 'feedFetchOracleRound',
      description: 'Returns the latest Chainlink oracle round for a price feed.',
      parameters: [
        FEED_PARAM,
        { in: 'query', name: 'feed', required: true, schema: { type: 'string' }, description: 'Price feed pair (e.g. BTC/USD)' },
      ],
      responses: feedResponse({ $ref: '#/components/schemas/FeedOracleRound' }),
      tags: ['Data Feeds'],
    },
  };

  paths['/api/feeds/{feed}/fetchOracleHistory'] = {
    get: {
      summary: 'Fetch Oracle History',
      operationId: 'feedFetchOracleHistory',
      description: 'Returns historical Chainlink oracle rounds for a price feed.',
      parameters: [
        FEED_PARAM,
        { in: 'query', name: 'feed', required: true, schema: { type: 'string' }, description: 'Price feed pair (e.g. BTC/USD)' },
        { in: 'query', name: 'limit', required: false, schema: { type: 'integer' }, description: 'Max rounds to return (default 500)' },
      ],
      responses: feedResponse({
        type: 'array',
        items: { $ref: '#/components/schemas/FeedOracleRound' },
      }),
      tags: ['Data Feeds'],
    },
  };

  paths['/api/feeds/{feed}/fetchHistoricalPrices'] = {
    get: {
      summary: 'Fetch Historical Prices',
      operationId: 'feedFetchHistoricalPrices',
      description: 'Returns historical price data as tickers within a time range.',
      parameters: [
        FEED_PARAM,
        { in: 'query', name: 'symbol', required: true, schema: { type: 'string' }, description: 'Trading pair (e.g. BTC/USD)' },
        { in: 'query', name: 'fromTimestamp', required: false, schema: { type: 'integer' }, description: 'Start unix timestamp (seconds)' },
        { in: 'query', name: 'untilTimestamp', required: false, schema: { type: 'integer' }, description: 'End unix timestamp (seconds)' },
        { in: 'query', name: 'maxSize', required: false, schema: { type: 'integer' }, description: 'Max records to return' },
        { in: 'query', name: 'order', required: false, schema: { type: 'string', enum: ['asc', 'desc'] }, description: 'Sort order' },
      ],
      responses: feedResponse({
        type: 'array',
        items: { $ref: '#/components/schemas/FeedTicker' },
      }),
      tags: ['Data Feeds'],
    },
  };

  // WebSocket streaming — watchTicker
  paths['/api/feeds/{feed}/watchTicker'] = {
    get: {
      summary: 'Watch Ticker (WebSocket)',
      operationId: 'feedWatchTicker',
      description: [
        'Stream live ticker updates for a symbol via WebSocket.',
        '',
        '**Transport:** WebSocket',
        '',
        '| Environment | URL |',
        '|---|---|',
        '| Hosted API | `wss://api.pmxt.dev/ws?apiKey=YOUR_KEY` |',
        '',
        '**Subscribe:**',
        '```json',
        '{ "id": "btc-stream", "action": "subscribe", "method": "watchTicker", "args": ["BTC/USDT"], "feed": "binance" }',
        '```',
        '',
        '**Server response:**',
        '```json',
        '{ "event": "data", "id": "btc-stream", "method": "watchTicker", "symbol": "BTC/USDT", "source": "binance", "data": { "symbol": "BTC/USDT", "last": 76949.16, "timestamp": 1716148800000, ... } }',
        '```',
        '',
        '**Unsubscribe:**',
        '```json',
        '{ "id": "btc-stream", "action": "unsubscribe" }',
        '```',
        '',
        'Currently supports Binance feeds only. Tickers stream as they arrive from the Binance trade relay.',
      ].join('\n'),
      parameters: [
        FEED_PARAM,
        { in: 'query', name: 'symbol', required: true, schema: { type: 'string' }, description: 'Trading pair to stream (e.g. BTC/USDT)' },
      ],
      responses: feedResponse({ $ref: '#/components/schemas/FeedTicker' }),
      tags: ['Data Feeds'],
    },
  };

  return paths;
}

// SDK code samples for feed endpoints
function buildFeedCodeSamples(operationId) {
  const FEED_SAMPLES = {
    feedList: {
      python: 'import requests\n\nresp = requests.get(\n    "https://api.pmxt.dev/api/feeds",\n    headers={"Authorization": "Bearer YOUR_PMXT_API_KEY"},\n)\nprint(resp.json()["data"])',
      typescript: 'const resp = await fetch("https://api.pmxt.dev/api/feeds", {\n  headers: { Authorization: "Bearer YOUR_PMXT_API_KEY" },\n});\nconst { data } = await resp.json();\nconsole.log(data);',
    },
    feedLoadMarkets: {
      python: 'from pmxt.feed_client import FeedClient\n\nfeed = FeedClient("chainlink", pmxt_api_key="YOUR_PMXT_API_KEY")\nmarkets = feed.load_markets()\nfor symbol, market in markets.items():\n    print(symbol, market.base, market.quote)',
      typescript: 'import { FeedClient } from "pmxtjs";\n\nconst feed = new FeedClient("chainlink", { pmxtApiKey: "YOUR_PMXT_API_KEY" });\nconst markets = await feed.loadMarkets();\nfor (const [symbol, market] of Object.entries(markets)) {\n  console.log(symbol, market.base, market.quote);\n}',
    },
    feedFetchTicker: {
      python: 'from pmxt.feed_client import FeedClient\n\n# Chainlink oracle price\nfeed = FeedClient("chainlink", pmxt_api_key="YOUR_PMXT_API_KEY")\nticker = feed.fetch_ticker("BTC/USD")\nprint(f"BTC/USD: ${ticker.last}")\n\n# Binance spot price\nfeed = FeedClient("binance", pmxt_api_key="YOUR_PMXT_API_KEY")\nticker = feed.fetch_ticker("BTC/USDT")\nprint(f"BTC/USDT: ${ticker.last}")',
      typescript: 'import { FeedClient } from "pmxtjs";\n\n// Chainlink oracle price\nconst chainlink = new FeedClient("chainlink", { pmxtApiKey: "YOUR_PMXT_API_KEY" });\nconst ticker = await chainlink.fetchTicker("BTC/USD");\nconsole.log(`BTC/USD: $${ticker.last}`);\n\n// Binance spot price\nconst binance = new FeedClient("binance", { pmxtApiKey: "YOUR_PMXT_API_KEY" });\nconst btc = await binance.fetchTicker("BTC/USDT");\nconsole.log(`BTC/USDT: $${btc.last}`);',
    },
    feedFetchTickers: {
      python: 'from pmxt.feed_client import FeedClient\n\nfeed = FeedClient("chainlink", pmxt_api_key="YOUR_PMXT_API_KEY")\ntickers = feed.fetch_tickers()\nfor symbol, ticker in tickers.items():\n    print(f"{symbol}: ${ticker.last}")',
      typescript: 'import { FeedClient } from "pmxtjs";\n\nconst feed = new FeedClient("chainlink", { pmxtApiKey: "YOUR_PMXT_API_KEY" });\nconst tickers = await feed.fetchTickers();\nfor (const [symbol, ticker] of Object.entries(tickers)) {\n  console.log(`${symbol}: $${ticker.last}`);\n}',
    },
    feedFetchOHLCV: {
      python: 'from pmxt.feed_client import FeedClient\n\nfeed = FeedClient("binance", pmxt_api_key="YOUR_PMXT_API_KEY")\ncandles = feed.fetch_ohlcv("BTC/USDT", timeframe="1m", since=1700000000000, limit=3)\nfor timestamp, open_, high, low, close, volume in candles:\n    print(timestamp, close)',
      typescript: 'import { FeedClient } from "pmxtjs";\n\nconst feed = new FeedClient("binance", { pmxtApiKey: "YOUR_PMXT_API_KEY" });\nconst candles = await feed.fetchOHLCV("BTC/USDT", "1m", 1700000000000, 3);\nfor (const [timestamp, _open, _high, _low, close, _volume] of candles) {\n  console.log(timestamp, close);\n}',
    },
    feedFetchOrderBook: {
      python: 'import requests\n\nresp = requests.get(\n    "https://api.pmxt.dev/api/feeds/binance/fetchOrderBook",\n    params={"symbol": "BTC/USDT", "limit": 10},\n    headers={"Authorization": "Bearer YOUR_PMXT_API_KEY"},\n)\nbook = resp.json()["data"]\nprint(book["bids"][:3])',
      typescript: 'const params = new URLSearchParams({ symbol: "BTC/USDT", limit: "10" });\nconst resp = await fetch(`https://api.pmxt.dev/api/feeds/binance/fetchOrderBook?${params}`, {\n  headers: { Authorization: "Bearer YOUR_PMXT_API_KEY" },\n});\nconst { data: book } = await resp.json();\nconsole.log(book.bids.slice(0, 3));',
    },
    feedFetchOracleRound: {
      python: 'from pmxt.feed_client import FeedClient\n\nfeed = FeedClient("chainlink", pmxt_api_key="YOUR_PMXT_API_KEY")\nround = feed.fetch_oracle_round("BTC/USD")\nprint(f"Round {round.round_id}: ${round.answer} (decimals: {round.decimals})")',
      typescript: 'import { FeedClient } from "pmxtjs";\n\nconst feed = new FeedClient("chainlink", { pmxtApiKey: "YOUR_PMXT_API_KEY" });\nconst round = await feed.fetchOracleRound("BTC/USD");\nconsole.log(`Round ${round.roundId}: $${round.answer}`);',
    },
    feedFetchOracleHistory: {
      python: 'from pmxt.feed_client import FeedClient\n\nfeed = FeedClient("chainlink", pmxt_api_key="YOUR_PMXT_API_KEY")\nrounds = feed.fetch_oracle_history("BTC/USD", limit=10)\nfor r in rounds:\n    print(f"{r.round_id}: ${r.answer}")',
      typescript: 'import { FeedClient } from "pmxtjs";\n\nconst feed = new FeedClient("chainlink", { pmxtApiKey: "YOUR_PMXT_API_KEY" });\nconst rounds = await feed.fetchOracleHistory("BTC/USD", 10);\nfor (const r of rounds) {\n  console.log(`${r.roundId}: $${r.answer}`);\n}',
    },
    feedFetchHistoricalPrices: {
      python: 'from pmxt.feed_client import FeedClient\n\nfeed = FeedClient("chainlink", pmxt_api_key="YOUR_PMXT_API_KEY")\nprices = feed.fetch_historical_prices("BTC/USD", max_size=20, order="desc")\nfor p in prices:\n    print(f"{p.datetime}: ${p.last}")',
      typescript: 'import { FeedClient } from "pmxtjs";\n\nconst feed = new FeedClient("chainlink", { pmxtApiKey: "YOUR_PMXT_API_KEY" });\nconst prices = await feed.fetchHistoricalPrices("BTC/USD", {\n  maxSize: 20,\n  order: "desc",\n});\nfor (const p of prices) {\n  console.log(`${p.datetime}: $${p.last}`);\n}',
    },
    feedWatchTicker: {
      python: 'import asyncio\nimport json\nimport websockets\n\nasync def main():\n    url = "wss://api.pmxt.dev/ws?apiKey=YOUR_PMXT_API_KEY"\n    async with websockets.connect(url) as ws:\n        await ws.send(json.dumps({\n            "id": "btc-stream",\n            "action": "subscribe",\n            "method": "watchTicker",\n            "args": ["BTC/USDT"],\n            "feed": "binance",\n        }))\n        async for raw in ws:\n            msg = json.loads(raw)\n            if msg.get("event") == "data":\n                print(f\'{msg["data"]["symbol"]}: ${msg["data"]["last"]}\')\n\nasyncio.run(main())',
      typescript: 'const ws = new WebSocket("wss://api.pmxt.dev/ws?apiKey=YOUR_PMXT_API_KEY");\n\nws.onopen = () => {\n  ws.send(JSON.stringify({\n    id: "btc-stream",\n    action: "subscribe",\n    method: "watchTicker",\n    args: ["BTC/USDT"],\n    feed: "binance",\n  }));\n};\n\nws.onmessage = (e) => {\n  const msg = JSON.parse(e.data);\n  if (msg.event === "data") {\n    console.log(`${msg.data.symbol}: $${msg.data.last}`);\n  }\n};',
    },
  };

  const sample = FEED_SAMPLES[operationId];
  if (!sample) return undefined;
  return [
    { lang: 'python', label: 'Python', source: sample.python },
    { lang: 'javascript', label: 'TypeScript', source: sample.typescript },
  ];
}


// ---------------------------------------------------------------------------
// Assemble and write the full spec
// ---------------------------------------------------------------------------

function buildSpec(methodSpecs) {
  const paths = {};

  // Static health endpoint
  paths['/health'] = {
    get: {
      summary: 'Server Health Check',
      operationId: 'healthCheck',
      responses: {
        '200': {
          description: 'Server is consistent and running.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', example: 'ok' },
                  timestamp: { type: 'integer', format: 'int64' },
                },
              },
            },
          },
        },
      },
    },
  };

  for (const { name, pathObj } of methodSpecs) {
    paths[`/api/{exchange}/${name}`] = pathObj;
  }

  // Data feed endpoints
  const feedPaths = buildFeedPaths();
  Object.assign(paths, feedPaths);

  return {
    openapi: '3.0.0',
    info: {
      title: 'PMXT Sidecar API',
      description:
        'A unified local sidecar API for supported prediction markets. ' +
        'This API acts as a JSON-RPC-style gateway over PMXT exchange implementations, ' +
        'with venue and write support varying by method and capability.',
      version: '0.4.4',
    },
    servers: [
      { url: 'http://localhost:3847', description: 'Local development server' },
    ],
    paths,
    components: {
      parameters: {
        ExchangeParam: {
          in: 'path',
          name: 'exchange',
          schema: {
            type: 'string',
            enum: ['polymarket', 'kalshi', 'kalshi-demo', 'limitless', 'probable', 'baozi', 'myriad', 'opinion', 'metaculus', 'smarkets', 'polymarket_us', 'gemini-titan', 'hyperliquid', 'suibets', 'rain', 'hunch', 'mock', 'router'],
          },
          required: true,
          description: 'The prediction market exchange to target.',
        },
        FeedParam: {
          in: 'path',
          name: 'feed',
          schema: { type: 'string', enum: ['binance', 'chainlink'] },
          required: true,
          description: 'The data feed provider.',
        },
      },
      schemas: { ...SCHEMAS, ...FEED_SCHEMAS },
    },
  };
}

// ---------------------------------------------------------------------------
// Runtime sidecar: method name → verb + arg spec
//
// The generated OpenAPI spec is the public contract, but app.ts needs
// a lean, O(1)-lookup form of the same info to drive its GET dispatch
// at runtime. We emit it as plain JSON (no yaml parser required in the
// server) next to openapi.yaml, so `npm run build` copies both into
// dist/server/ in a single `cp` line.
// ---------------------------------------------------------------------------

function buildMethodVerbs(methodSpecs) {
  const out = {};
  for (const { name, verb, paramsMeta } of methodSpecs) {
    out[name] = {
      verb,
      args: paramsMeta.map(p => ({
        name: p.name,
        kind: p.kind,
        optional: p.optional,
      })),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Exchange constructor metadata (x-sdk-constructors)
//
// Parses createExchange() in exchange-factory.ts to discover which exchanges exist and
// which credentials each one requires — the same logic used by
// generate-python-exchanges.js. The result is attached to the OpenAPI spec
// as the `x-sdk-constructors` vendor extension so downstream consumers
// (e.g. Mintlify docs sync) can auto-generate per-exchange SDK samples.
// ---------------------------------------------------------------------------

// Overrides that cannot be derived from app.ts alone.
const EXCHANGE_OVERRIDES = {
    polymarket: {
        defaults: { signature_type: 'gnosis-safe' },
    },
    polymarket_us: {
        className: 'PolymarketUS',
    },
    suibets: {
        className: 'SuiBets',
    },
    myriad: {
        paramAliases: { private_key: 'wallet_address' },
        paramDocs: {
            wallet_address: 'Wallet address (required for positions and balance)',
        },
    },
};

function toClassName(name) {
    return name
        .split(/[-_]/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}

function parseExchanges(content) {
    const startIdx = content.indexOf('function createExchange(');
    if (startIdx === -1) throw new Error('createExchange not found in exchange-factory.ts');

    const tail = content.slice(startIdx);
    let depth = 0;
    let bodyEnd = 0;
    for (let i = tail.indexOf('{'); i < tail.length; i++) {
        if (tail[i] === '{') depth++;
        else if (tail[i] === '}') {
            depth--;
            if (depth === 0) { bodyEnd = i + 1; break; }
        }
    }
    const funcBody = tail.slice(0, bodyEnd);

    const exchanges = [];
    const lines = funcBody.split('\n');
    let currentName = null;
    let currentBlock = '';

    for (const line of lines) {
        const caseMatch = line.match(/^\s*case "([^"]+)":/);
        if (caseMatch) {
            if (currentName) exchanges.push(buildExchange(currentName, currentBlock));
            currentName = caseMatch[1];
            currentBlock = '';
            continue;
        }
        if (/^\s*default:/.test(line) && currentName) {
            exchanges.push(buildExchange(currentName, currentBlock));
            currentName = null;
            currentBlock = '';
            continue;
        }
        if (currentName) currentBlock += line + '\n';
    }
    if (currentName) exchanges.push(buildExchange(currentName, currentBlock));

    return exchanges;
}

function buildExchange(name, block) {
    return {
        name,
        creds: {
            apiKey:        /credentials\?\.apiKey/.test(block),
            apiToken:      /credentials\?\.apiToken/.test(block),
            apiSecret:     /credentials\?\.apiSecret/.test(block),
            passphrase:    /credentials\?\.passphrase/.test(block),
            privateKey:    /credentials\?\.privateKey/.test(block),
            funderAddress: /credentials\?\.funderAddress/.test(block),
            signatureType: /credentials\?\.signatureType/.test(block),
        },
    };
}

// Credential flag → default param metadata
const CRED_PARAM_MAP = {
    apiKey:        { name: 'api_key',        tsName: 'apiKey',        description: 'API key for authentication' },
    apiToken:      { name: 'api_token',      tsName: 'apiToken',      description: 'API token for authentication' },
    apiSecret:     { name: 'api_secret',     tsName: 'apiSecret',     description: 'API secret for authentication' },
    passphrase:    { name: 'passphrase',     tsName: 'passphrase',    description: 'Passphrase for authentication' },
    privateKey:    { name: 'private_key',    tsName: 'privateKey',    description: 'Private key for authentication' },
    funderAddress: { name: 'proxy_address',  tsName: 'proxyAddress',  description: 'Proxy/smart wallet address' },
    signatureType: { name: 'signature_type', tsName: 'signatureType', description: 'Signature type' },
};

function camelCase(snakeName) {
    return snakeName.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function buildSdkConstructors(exchanges) {
    const result = {};

    for (const exchange of exchanges) {
        const { name, creds } = exchange;
        const ov = EXCHANGE_OVERRIDES[name] || {};
        const aliases = ov.paramAliases || {};
        const defaults = ov.defaults || {};
        const paramDocs = ov.paramDocs || {};
        const className = ov.className || toClassName(name);

        // Every exchange gets the hosted API key param first
        const params = [
            {
                name: 'pmxt_api_key',
                tsName: 'pmxtApiKey',
                type: 'string',
                description: 'PMXT API key for hosted access',
            },
        ];

        for (const [credFlag, baseMeta] of Object.entries(CRED_PARAM_MAP)) {
            if (!creds[credFlag]) continue;

            const aliasedSnakeName = aliases[baseMeta.name] || baseMeta.name;
            const aliasedTsName = camelCase(aliasedSnakeName);
            const description = paramDocs[aliasedSnakeName] || baseMeta.description;

            const param = {
                name: aliasedSnakeName,
                tsName: aliasedTsName,
                type: 'string',
                description,
            };

            const defaultVal = defaults[baseMeta.name];
            if (defaultVal) {
                param.default = defaultVal;
            }

            params.push(param);
        }

        result[name] = {
            className,
            params,
        };
    }

    return result;
}

function main() {
  // Build the interface registry and the full component-schema map
  // FIRST. `buildPathSpec` below consults the global SCHEMAS map via
  // `expandObjectParamToQuery` to flatten object-typed query params,
  // so the schemas have to exist before any path is built.
  const registry = buildInterfaceRegistry();
  SCHEMAS = buildAllSchemas(registry);

  const source = fs.readFileSync(BASE_EXCHANGE_PATH, 'utf-8');
  const sourceFile = ts.createSourceFile(
    'BaseExchange.ts',
    source,
    ts.ScriptTarget.ES2022,
    /* setParentNodes */ true
  );

  const methodNodes = extractMethods(sourceFile);
  const methodSpecs = methodNodes.map(m => buildPathSpec(m, sourceFile));
  // WebSocket methods get their own MDX page — exclude from OpenAPI spec
  // so Mintlify doesn't render them as POST endpoints.
  const restMethodSpecs = methodSpecs.filter(s => s.verb !== 'ws');
  const spec = buildSpec(restMethodSpecs);

  // Attach per-exchange SDK constructor metadata from app.ts
  const appTsContent = fs.readFileSync(APP_TS_PATH, 'utf-8');
  const exchanges = parseExchanges(appTsContent);
  spec['x-sdk-constructors'] = buildSdkConstructors(exchanges);

  // Scope exchange params per-operation for the sidecar spec so that
  // router-only operations (fetchMarketMatches, fetchArbitrage, etc.)
  // restrict the exchange enum to ["router"] instead of listing every
  // venue. The MCP tool generator reads this YAML and uses the enum to
  // constrain valid exchange values, so scoping here prevents MCP tools
  // from accepting unsupported exchanges.
  // collapsePaths=false keeps the {exchange} path template intact — the
  // sidecar server routes on it as a parameter.
  const capMap = buildCapabilityMap();
  const sidecarSpec = scopeExchangeParams(spec, capMap, { collapsePaths: false });

  const yamlStr = yaml.dump(sidecarSpec, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
  });

  fs.writeFileSync(OPENAPI_OUT_PATH, yamlStr, 'utf-8');
  console.log(`Generated ${path.relative(process.cwd(), OPENAPI_OUT_PATH)}`);

  const methodVerbs = buildMethodVerbs(methodSpecs);
  fs.writeFileSync(
    METHOD_VERBS_OUT_PATH,
    JSON.stringify(methodVerbs, null, 2) + '\n',
    'utf-8'
  );
  console.log(
    `Generated ${path.relative(process.cwd(), METHOD_VERBS_OUT_PATH)}`
  );

  const getCount = methodSpecs.filter(s => s.verb === 'get').length;
  const postCount = methodSpecs.length - getCount;
  console.log(
    `  ${methodSpecs.length} endpoints extracted from BaseExchange.ts ` +
      `(${getCount} GET, ${postCount} POST):`
  );
  for (const { name, verb } of methodSpecs) {
    console.log(`  - ${verb.toUpperCase().padEnd(4)} ${name}`);
  }

  // Generate the hosted docs openapi.json alongside the sidecar YAML
  // so that `generate:openapi` is the single command that keeps both
  // artefacts in sync.
  generateHostedDocsSpec(spec);
}

main();
