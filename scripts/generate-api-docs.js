const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Handlebars = require('handlebars');

const CORE_DIR = path.resolve(__dirname, '../core');
const SPECS_DIR = path.join(CORE_DIR, 'specs');
const OPENAPI_PATH = path.join(CORE_DIR, 'src/server/openapi.yaml');
const GENERATED_CONFIG_PATH = path.join(CORE_DIR, 'api-doc-config.generated.json');
const PYTHON_OUT = path.resolve(__dirname, '../sdks/python/API_REFERENCE.md');
const TS_OUT = path.resolve(__dirname, '../sdks/typescript/API_REFERENCE.md');

// Exchange spec files in order of display
const EXCHANGE_SPECS = [
    {
        exchange: 'polymarket', displayName: 'Polymarket', files: [
            path.join(SPECS_DIR, 'polymarket/PolymarketGammaAPI.yaml'),
            path.join(SPECS_DIR, 'polymarket/PolymarketClobAPI.yaml'),
            path.join(SPECS_DIR, 'polymarket/Polymarket_Data_API.yaml'),
        ]
    },
    {
        exchange: 'kalshi', displayName: 'Kalshi', files: [
            path.join(SPECS_DIR, 'kalshi/Kalshi.yaml'),
        ]
    },
    {
        exchange: 'limitless', displayName: 'Limitless', files: [
            path.join(SPECS_DIR, 'limitless/Limitless.yaml'),
        ]
    },
    {
        exchange: 'probable', displayName: 'Probable', files: [
            path.join(SPECS_DIR, 'probable/probable.yaml'),
        ]
    },
    {
        exchange: 'myriad', displayName: 'Myriad', files: [
            path.join(SPECS_DIR, 'myriad/myriad.yaml'),
        ]
    },
];

// --- Helper Functions ---

function toSnakeCase(str) {
    // Handle consecutive uppercase letters and mixed-case acronyms (like PnL)
    // Insert underscore before uppercase letter if:
    // 1. Preceded by lowercase letter, UNLESS that lowercase is part of an acronym
    //    (e.g., testData -> test_data, but PnL -> pnl)
    // 2. Preceded by uppercase AND followed by lowercase (XMLParser -> xml_parser)
    return str
        .replace(/By(?=[A-Z])/g, 'By_')
        .replace(/My(?=[A-Z])/g, 'My_')
        .replace(/(?<![A-Z])([a-z])([A-Z])/g, '$1_$2')  // aB -> a_B, but not after uppercase
        .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')       // ABc -> A_Bc
        .toLowerCase();
}

function getRefName(ref) {
    if (!ref) return 'any';
    const parts = ref.split('/');
    return parts[parts.length - 1];
}

// --- Load Sources ---

function loadSpecs() {
    const openapi = yaml.load(fs.readFileSync(OPENAPI_PATH, 'utf8'));

    if (!fs.existsSync(GENERATED_CONFIG_PATH)) {
        console.error(`Error: ${GENERATED_CONFIG_PATH} not found. Run 'npm run extract:jsdoc' first.`);
        process.exit(1);
    }
    const config = JSON.parse(fs.readFileSync(GENERATED_CONFIG_PATH, 'utf8'));

    return { openapi, config };
}

// --- Method Parsing (from JSDoc-extracted config) ---

function parseMethods(config) {
    const methods = [];

    for (const [name, data] of Object.entries(config.methods)) {
        methods.push({
            name,
            summary: data.summary || name,
            description: data.description || data.summary || '',
            params: (data.params || []).map(p => ({
                name: p.name,
                type: p.type || 'any',
                optional: p.optional || false,
                description: p.description || p.name
            })),
            subParams: data.subParams || null,
            returns: data.returns || { type: 'any', description: 'Result' },
            notes: data.notes || null,
            exchangeOnly: data.exchangeOnly || null
        });
    }

    return methods;
}

// --- Model Parsing (from OpenAPI spec - unchanged) ---

function parseModels(openapi) {
    const dataModels = [];
    const filterModels = [];

    const schemas = openapi.components.schemas;
    for (const [name, schema] of Object.entries(schemas)) {
        if (name.endsWith('Response') || name === 'BaseResponse' || name === 'ErrorDetail' || name === 'ErrorResponse') continue;

        const fields = [];
        if (schema.properties) {
            for (const [fname, fschema] of Object.entries(schema.properties)) {
                let type = fschema.type;
                if (fschema.$ref) type = getRefName(fschema.$ref);
                if (type === 'array' && fschema.items) {
                    const itype = fschema.items.$ref ? getRefName(fschema.items.$ref) : fschema.items.type;
                    type = `${itype}[]`;
                }

                fields.push({
                    name: fname,
                    type: type,
                    description: fschema.description || '',
                    required: (schema.required && schema.required.includes(fname))
                });
            }
        }

        const model = {
            name,
            description: schema.description || '',
            fields
        };

        if (name.endsWith('Params') || name.endsWith('Request')) {
            filterModels.push(model);
        } else {
            dataModels.push(model);
        }
    }

    return { dataModels, filterModels };
}

// --- Exchange Endpoint Parsing (from per-exchange OpenAPI YAML files) ---

function generateCallApiName(httpMethod, urlPath) {
    const segments = urlPath
        .split('/')
        .filter(s => s && !s.startsWith('{'));
    const pascal = segments.map(s =>
        s.split(/[-_]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('')
    );
    return httpMethod.toLowerCase() + pascal.join('');
}

function parseExchangeEndpoints() {
    const groups = [];

    for (const { exchange, displayName, files } of EXCHANGE_SPECS) {
        const endpoints = [];

        for (const filePath of files) {
            if (!fs.existsSync(filePath)) {
                console.warn(`Warning: Exchange spec not found: ${filePath}`);
                continue;
            }

            const spec = yaml.load(fs.readFileSync(filePath, 'utf8'));
            const topLevelSecurity = !!(spec.security && spec.security.length > 0);
            const paths = spec.paths || {};

            for (const [urlPath, pathItem] of Object.entries(paths)) {
                // Collect path-level parameters
                const pathLevelParams = (pathItem.parameters || [])
                    .filter(p => p.in === 'path' || p.in === 'query');

                for (const [httpMethod, operation] of Object.entries(pathItem)) {
                    if (!['get', 'post', 'put', 'patch', 'delete'].includes(httpMethod.toLowerCase())) continue;

                    const name = operation.operationId || generateCallApiName(httpMethod, urlPath);
                    const isPrivate = operation.security !== undefined
                        ? !!(operation.security && operation.security.length > 0)
                        : topLevelSecurity;

                    // Merge path-level and operation-level parameters
                    const allParams = [...pathLevelParams, ...(operation.parameters || [])];
                    const params = allParams.map(p => ({
                        name: p.name,
                        in: p.in,
                        required: p.required || p.in === 'path',
                        type: (p.schema && p.schema.type) || 'string',
                        description: p.description || '',
                        enum: (p.schema && p.schema.enum) || null,
                    }));

                    endpoints.push({
                        name,
                        method: httpMethod.toUpperCase(),
                        path: urlPath,
                        summary: operation.summary || name,
                        params,
                        isPrivate,
                    });
                }
            }
        }

        if (endpoints.length > 0) {
            groups.push({ exchange, displayName, endpoints });
        }
    }

    return groups;
}

// --- Auto-generate Examples ---

// Map param names to sensible example values
const EXAMPLE_VALUES = {
    query: '"Trump"',
    id: '"12345"',
    marketId: '"12345"',
    eventId: '"67890"',
    outcomeId: '"abc123"',
    orderId: '"ord-001"',
    slug: '"will-trump-win"',
    limit: '10',
    offset: '0',
    side: '"buy"',
    size: '100',
    price: '0.65',
    amount: '50',
    reload: { py: 'True', ts: 'true' },
    resolution: '"1h"',
    address: '"0xabc..."',
    symbol: '"BTC-YES"',
    sort: '"volume"',
    status: '"active"',
    page: '1',
};

const PYTHON_METHOD_EXAMPLE_OVERRIDES = {
    has: 'exchange.has',
    fetchOHLCV: 'exchange.fetch_ohlcv(outcome_id="abc123", resolution="1h", limit=100)',
    fetchOrderBook: 'exchange.fetch_order_book(outcome_id="abc123", limit=10, params={})',
    fetchOrderBooks: 'exchange.fetch_order_books(outcome_ids=["12345"])',
    fetchTrades: 'exchange.fetch_trades(outcome_id="abc123", limit=50)',
    getExecutionPrice: [
        'order_book = exchange.fetch_order_book(outcome_id="abc123")',
        'exchange.get_execution_price(order_book=order_book, side="buy", amount=50)',
    ].join('\n'),
    getExecutionPriceDetailed: [
        'order_book = exchange.fetch_order_book(outcome_id="abc123")',
        'exchange.get_execution_price_detailed(order_book=order_book, side="buy", amount=50)',
    ].join('\n'),
    filterMarkets: [
        'markets = exchange.fetch_markets(query="Trump")',
        'exchange.filter_markets(markets=markets, criteria="Trump")',
    ].join('\n'),
    filterEvents: [
        'events = exchange.fetch_events(query="Trump")',
        'exchange.filter_events(events=events, criteria="Trump")',
    ].join('\n'),
    createOrder: [
        'exchange.create_order(',
        '    market_id="12345",',
        '    outcome_id="abc123",',
        '    side="buy",',
        '    type="limit",',
        '    amount=50,',
        '    price=0.65,',
        ')',
    ].join('\n'),
    buildOrder: [
        'exchange.build_order(',
        '    market_id="12345",',
        '    outcome_id="abc123",',
        '    side="buy",',
        '    type="limit",',
        '    amount=50,',
        '    price=0.65,',
        ')',
    ].join('\n'),
    submitOrder: [
        'built = exchange.build_order(',
        '    market_id="12345",',
        '    outcome_id="abc123",',
        '    side="buy",',
        '    type="limit",',
        '    amount=50,',
        '    price=0.65,',
        ')',
        'exchange.submit_order(built)',
    ].join('\n'),
    fetchMyTrades: 'exchange.fetch_my_trades(limit=10)',
    fetchClosedOrders: 'exchange.fetch_closed_orders(market_id="12345", limit=10)',
    fetchAllOrders: 'exchange.fetch_all_orders(market_id="12345", limit=10)',
    watchOrderBook: 'exchange.watch_order_book(outcome_id="abc123", limit=10, params={})',
    watchOrderBooks: 'exchange.watch_order_books(outcome_ids=["12345"], limit=10, params={})',
    watchAllOrderBooks: 'exchange.watch_all_order_books(venues=["polymarket", "limitless"])',
    firehose: 'exchange.firehose(venues=["polymarket", "limitless"])',
    watchTrades: 'exchange.watch_trades(outcome_id="abc123", address="0xabc...", since=1710000000000, limit=50)',
    watchAddress: 'exchange.watch_address(address="0xabc...", types=["trades"])',
    watchPrices: [
        'def handle_price_update(data):',
        '    pass',
        'exchange.watch_prices(market_address="0xabc...", callback=handle_price_update)',
    ].join('\n'),
    watchUserPositions: [
        'def handle_position_update(data):',
        '    pass',
        'exchange.watch_user_positions(callback=handle_position_update)',
    ].join('\n'),
    watchUserTransactions: [
        'def handle_transaction_update(data):',
        '    pass',
        'exchange.watch_user_transactions(callback=handle_transaction_update)',
    ].join('\n'),
};

const TYPESCRIPT_METHOD_EXAMPLE_OVERRIDES = {
    has: 'exchange.has',
    fetchOHLCV: 'await exchange.fetchOHLCV("abc123", { resolution: "1h", limit: 100 })',
    fetchOrderBook: 'await exchange.fetchOrderBook("abc123", 10, {})',
    fetchOrderBooks: 'await exchange.fetchOrderBooks(["12345"])',
    fetchTrades: 'await exchange.fetchTrades("abc123", { limit: 50 })',
    fetchOpenOrders: 'await exchange.fetchOpenOrders("12345")',
    fetchPositions: 'await exchange.fetchPositions("0xabc...")',
    fetchBalance: 'await exchange.fetchBalance("0xabc...")',
    getExecutionPrice: [
        'const orderBook = await exchange.fetchOrderBook("abc123")',
        'exchange.getExecutionPrice(orderBook, "buy", 50)',
    ].join('\n'),
    getExecutionPriceDetailed: [
        'const orderBook = await exchange.fetchOrderBook("abc123")',
        'await exchange.getExecutionPriceDetailed(orderBook, "buy", 50)',
    ].join('\n'),
    filterMarkets: [
        'const markets = await exchange.fetchMarkets({ query: "Trump" })',
        'await exchange.filterMarkets(markets, "Trump")',
    ].join('\n'),
    filterEvents: [
        'const events = await exchange.fetchEvents({ query: "Trump" })',
        'await exchange.filterEvents(events, "Trump")',
    ].join('\n'),
    createOrder: [
        'await exchange.createOrder({',
        '  marketId: "12345",',
        '  outcomeId: "abc123",',
        '  side: "buy",',
        '  type: "limit",',
        '  amount: 50,',
        '  price: 0.65',
        '})',
    ].join('\n'),
    buildOrder: [
        'await exchange.buildOrder({',
        '  marketId: "12345",',
        '  outcomeId: "abc123",',
        '  side: "buy",',
        '  type: "limit",',
        '  amount: 50,',
        '  price: 0.65',
        '})',
    ].join('\n'),
    submitOrder: [
        'const built = await exchange.buildOrder({',
        '  marketId: "12345",',
        '  outcomeId: "abc123",',
        '  side: "buy",',
        '  type: "limit",',
        '  amount: 50,',
        '  price: 0.65',
        '});',
        'await exchange.submitOrder(built)',
    ].join('\n'),
    fetchMyTrades: 'await exchange.fetchMyTrades({ limit: 10 })',
    fetchClosedOrders: 'await exchange.fetchClosedOrders({ marketId: "12345", limit: 10 })',
    fetchAllOrders: 'await exchange.fetchAllOrders({ marketId: "12345", limit: 10 })',
    watchOrderBook: 'await exchange.watchOrderBook("abc123", 10, {})',
    watchOrderBooks: 'await exchange.watchOrderBooks(["12345"], 10, {})',
    watchAllOrderBooks: 'await exchange.watchAllOrderBooks(["polymarket", "limitless"])',
    firehose: 'await exchange.firehose(["polymarket", "limitless"])',
    watchTrades: 'await exchange.watchTrades("abc123", "0xabc...", 1710000000000, 50)',
    watchAddress: 'await exchange.watchAddress("0xabc...", ["trades"])',
    watchPrices: 'await exchange.watchPrices("0xabc...", (data) => { void data })',
    watchUserPositions: 'await exchange.watchUserPositions((data) => { void data })',
    watchUserTransactions: 'await exchange.watchUserTransactions((data) => { void data })',
};

const TYPESCRIPT_PARAM_TYPE_OVERRIDES = {
    createOrder: { params: 'CreateOrderInput' },
    buildOrder: { params: 'CreateOrderInput' },
};

const METHOD_DOC_EXCLUDES = new Set(['implicitApi']);

const METHOD_DOC_OVERRIDES = {
    has: {
        summary: 'Capability map indicating which methods this exchange supports.',
        description: [
            'Values are `true` for native support, `false` for unavailable methods,',
            'or `emulated` for methods backed by polling or another workaround.',
        ].join('\n'),
    },
};

const PYTHON_METHOD_SIGNATURE_OVERRIDES = {
    has: 'has: ExchangeHas',
};

const TYPESCRIPT_METHOD_SIGNATURE_OVERRIDES = {
    has: 'get has(): ExchangeHas',
};

const TYPESCRIPT_SYNC_METHODS = new Set(['has', 'getExecutionPrice']);

const TYPESCRIPT_EXTRA_TYPES = [
    {
        name: 'CreateOrderInput',
        description: [
            '`createOrder` and `buildOrder` accept either explicit `marketId` / `outcomeId`',
            'fields or an outcome object returned by `fetchMarkets`.',
        ].join('\n'),
        definition: [
            'type CreateOrderInput =',
            '  | (CreateOrderParams & { outcome?: never })',
            "  | (Omit<CreateOrderParams, 'marketId' | 'outcomeId'> & {",
            '      outcome: MarketOutcome;',
            '      marketId?: never;',
            '      outcomeId?: never;',
            '    });',
        ].join('\n'),
    },
];

function getExampleValue(paramName, lang, type) {
    if (type && type.endsWith('[]') && paramName.toLowerCase().includes('id')) return '["12345"]';

    const val = EXAMPLE_VALUES[paramName];
    if (val !== undefined) {
        // Handle language-specific values (e.g. booleans)
        if (typeof val === 'object' && val.py && val.ts) {
            return lang === 'py' ? val.py : val.ts;
        }
        return val;
    }
    // Fallback: string-like params get a placeholder, others get a generic value
    if (paramName.toLowerCase().includes('id')) return '"12345"';
    if (paramName.toLowerCase().includes('name')) return '"example"';
    return '"..."';
}

function generatePythonExample(method) {
    const override = PYTHON_METHOD_EXAMPLE_OVERRIDES[method.name];
    if (override) return override;

    const pyName = toSnakeCase(method.name);
    const params = method.params || [];

    if (params.length === 0) {
        return 'exchange.' + pyName + '()';
    }

    // Single non-object param (e.g. reload: boolean)
    const required = params.filter(function(p) { return !p.optional; });
    const optional = params.filter(function(p) { return p.optional; });

    // If there is a single "params" object, show keyword args from subParams
    if (params.length === 1 && params[0].name === 'params') {
        var subParams = method.subParams || [];
        if (subParams.length > 0) {
            var args = subParams.slice(0, 3).map(function(sp) {
                var name = sp.name.replace('params.', '');
                return toSnakeCase(name) + '=' + getExampleValue(name, 'py', sp.type);
            });
            return 'exchange.' + pyName + '(' + args.join(', ') + ')';
        }
        return 'exchange.' + pyName + '()';
    }

    var argParts = [];
    required.forEach(function(p) {
        argParts.push(toSnakeCase(p.name) + '=' + getExampleValue(p.name, 'py', p.type));
    });
    optional.slice(0, 2).forEach(function(p) {
        argParts.push(toSnakeCase(p.name) + '=' + getExampleValue(p.name, 'py', p.type));
    });

    return 'exchange.' + pyName + '(' + argParts.join(', ') + ')';
}

function generateTsExample(method) {
    const override = TYPESCRIPT_METHOD_EXAMPLE_OVERRIDES[method.name];
    if (override) return override;

    var params = method.params || [];
    const callPrefix = method.isSync ? '' : 'await ';

    if (params.length === 0) {
        return callPrefix + 'exchange.' + method.name + '()';
    }

    var required = params.filter(function(p) { return !p.optional; });
    var optional = params.filter(function(p) { return p.optional; });

    // If there is a single "params" object, show object literal with subParams
    if (params.length === 1 && params[0].name === 'params') {
        var subParams = method.subParams || [];
        if (subParams.length > 0) {
            var fields = subParams.slice(0, 3).map(function(sp) {
                var name = sp.name.replace('params.', '');
                return name + ': ' + getExampleValue(name, 'ts', sp.type);
            });
            return callPrefix + 'exchange.' + method.name + '({ ' + fields.join(', ') + ' })';
        }
        return callPrefix + 'exchange.' + method.name + '()';
    }

    // Multiple params: first required as positional, then optional as object
    var argParts = [];
    required.forEach(function(p) {
        argParts.push(getExampleValue(p.name, 'ts', p.type));
    });

    if (optional.length > 0) {
        var optFields = optional.slice(0, 2).map(function(p) {
            return p.name + ': ' + getExampleValue(p.name, 'ts', p.type);
        });
        argParts.push('{ ' + optFields.join(', ') + ' }');
    }

    return callPrefix + 'exchange.' + method.name + '(' + argParts.join(', ') + ')';
}

function applyTypeScriptMethodOverrides(method) {
    const paramTypes = TYPESCRIPT_PARAM_TYPE_OVERRIDES[method.name];
    if (!paramTypes) return method;

    return {
        ...method,
        params: method.params.map(p => {
            const type = paramTypes[p.name];
            return type ? { ...p, type } : p;
        }),
    };
}

function applyMethodDocOverrides(method) {
    const overrides = METHOD_DOC_OVERRIDES[method.name];
    if (!overrides) return method;

    return {
        ...method,
        ...overrides,
    };
}

// --- Main Execution ---

const { openapi, config } = loadSpecs();
const methods = parseMethods(config)
    .filter(method => !METHOD_DOC_EXCLUDES.has(method.name))
    .map(applyMethodDocOverrides);
const { dataModels, filterModels } = parseModels(openapi);
const exchangeGroups = parseExchangeEndpoints();

// --- Handlebars Setup ---

// Create a set of linkable types regardless of case for easier matching
const linkableTypes = new Set([
    ...dataModels.map(m => m.name.toLowerCase()),
    ...filterModels.map(m => m.name.toLowerCase()),
    ...TYPESCRIPT_EXTRA_TYPES.map(t => t.name.toLowerCase())
]);

function linkify(type) {
    if (!type) return type;
    if (linkableTypes.has(type.toLowerCase())) {
        return `[${type}](#${type.toLowerCase()})`;
    }
    return type;
}

function scalarPythonType(type, includeLinks) {
    const map = { string: 'str', number: 'float', integer: 'int', boolean: 'bool', any: 'Any', void: 'None' };
    if (map[type]) return map[type];
    return includeLinks ? linkify(type) : type;
}

function formatPythonUnion(parts, includeLinks) {
    const literals = parts
        .filter(part => /^'[^']*'$/.test(part) || /^"[^"]*"$/.test(part));

    if (literals.length === parts.length) {
        const values = literals.map(part => `"${part.slice(1, -1)}"`);
        return `Literal[${values.join(', ')}]`;
    }

    const formatted = parts.map(part => formatPythonType(part, includeLinks));
    if (formatted.length === 1) return formatted[0];
    return `Union[${formatted.join(', ')}]`;
}

function formatPythonType(type, includeLinks) {
    if (!type) return 'Any';
    const normalized = type.trim();

    if (/^\(\w+:\s*any\)$/.test(normalized)) {
        return 'Callable[[Any], None]';
    }

    if (normalized.startsWith('{') && normalized.endsWith('}')) {
        return 'dict';
    }

    if (normalized.includes('|')) {
        const parts = normalized.split('|').map(part => part.trim()).filter(Boolean);
        const valueParts = parts.filter(part => part !== 'null' && part !== 'undefined');
        if (valueParts.length === 0) return 'None';
        const valueType = formatPythonUnion(valueParts, includeLinks);
        return valueParts.length === parts.length ? valueType : `Optional[${valueType}]`;
    }

    // Handle Arrays: UnifiedMarket[] -> List[UnifiedMarket]
    if (normalized.endsWith('[]')) {
        const inner = normalized.slice(0, -2);
        return `List[${scalarPythonType(inner, includeLinks)}]`;
    }

    // Handle Generics: Record<string, UnifiedMarket>
    if (normalized.startsWith('Record<')) {
        const match = normalized.match(/^Record<(.+),\s*(.+)>/);
        if (match) {
            const [_, key, value] = match;
            return `Dict[${scalarPythonType(key, includeLinks)}, ${scalarPythonType(value, includeLinks)}]`;
        }
    }

    return scalarPythonType(normalized, includeLinks);
}

Handlebars.registerHelper('pythonName', (name) => toSnakeCase(name));

Handlebars.registerHelper('pythonType', (type) => {
    return formatPythonType(type, true);
});

Handlebars.registerHelper('pythonTypeClean', (type) => {
    return formatPythonType(type, false);
});

Handlebars.registerHelper('pythonParams', (params) => {
    if (!params) return '';
    return params.map(p => {
        const pname = toSnakeCase(p.name);
        // Use clean type for parameters (inside code block)
        let ptype = Handlebars.helpers.pythonTypeClean(p.type);
        if (p.optional) return `${pname}: Optional[${ptype}] = None`;
        return `${pname}: ${ptype}`;
    }).join(', ');
});

Handlebars.registerHelper('tsType', (type) => {
    if (!type) return 'any';

    if (/^\(\w+:\s*any\)$/.test(type)) {
        return `${type} => void`;
    }

    if (type.endsWith('[]')) {
        const inner = type.slice(0, -2);
        const linkedInner = linkify(inner);
        return `${linkedInner}[]`;
    }

    const map = { integer: 'number' };
    if (map[type]) return map[type];

    return linkify(type);
});

Handlebars.registerHelper('tsTypeClean', (type) => {
    let t = Handlebars.helpers.tsType(type);
    return t.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
});
Handlebars.registerHelper('tsParams', (params) => {
    if (!params) return '';
    return params.map(p => {
        return `${p.name}${p.optional ? '?' : ''}: ${Handlebars.helpers.tsTypeClean(p.type)}`;
    }).join(', ');
});
Handlebars.registerHelper('tsOptional', (required) => required ? '' : '?');


// --- Render Python ---
const pythonTemplate = Handlebars.compile(
    fs.readFileSync(path.join(__dirname, 'templates/api-reference.python.md.hbs'), 'utf8'),
    { noEscape: true }
);

const pythonMethods = methods.map(m => ({
    ...m,
    example: generatePythonExample(m),
    signature: PYTHON_METHOD_SIGNATURE_OVERRIDES[m.name] || null,
    exchangeNote: m.exchangeOnly ? `> **Note**: This method is only available on **${m.exchangeOnly}** exchange.\n` : ''
}));

const pythonOut = pythonTemplate({
    methods: pythonMethods,
    dataModels,
    filterModels,
    exchangeGroups,
    workflowExample: config.workflowExample.python
});
fs.writeFileSync(PYTHON_OUT, pythonOut);
console.log(`Generated Python Docs: ${PYTHON_OUT}`);


// --- Render TypeScript ---
const tsTemplate = Handlebars.compile(
    fs.readFileSync(path.join(__dirname, 'templates/api-reference.typescript.md.hbs'), 'utf8'),
    { noEscape: true }
);

const tsMethods = methods.map(m => {
    const method = {
        ...applyTypeScriptMethodOverrides(m),
        isSync: TYPESCRIPT_SYNC_METHODS.has(m.name),
    };
    return {
        ...method,
        example: generateTsExample(method),
        signature: TYPESCRIPT_METHOD_SIGNATURE_OVERRIDES[method.name] || null,
        exchangeNote: method.exchangeOnly ? `> **Note**: This method is only available on **${method.exchangeOnly}** exchange.\n` : ''
    };
});

const tsOut = tsTemplate({
    methods: tsMethods,
    dataModels,
    filterModels,
    extraTypes: TYPESCRIPT_EXTRA_TYPES,
    exchangeGroups,
    workflowExample: config.workflowExample.typescript
});
fs.writeFileSync(TS_OUT, tsOut);
console.log(`Generated TypeScript Docs: ${TS_OUT}`);
