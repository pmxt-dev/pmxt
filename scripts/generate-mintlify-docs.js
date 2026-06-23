#!/usr/bin/env node
'use strict';

/**
 * generate-mintlify-docs.js
 *
 * Generates Mintlify-specific documentation artefacts from the hosted
 * openapi.json that `generate:openapi` already produces:
 *
 *   1. docs/concepts/venues.mdx  — venue matrix from the ExchangeParam enum
 *   2. docs/docs.json            — navigation sidebar with endpoint groups
 *
 * Run: node scripts/generate-mintlify-docs.js
 *
 * This script is idempotent and safe to run repeatedly. It reads from the
 * already-generated docs/api-reference/openapi.json (produced by
 * core/scripts/generate-openapi.js) so the two scripts can be chained:
 *   generate:openapi -> generate:mintlify
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OPENAPI_JSON_PATH = path.join(ROOT, 'docs', 'api-reference', 'openapi.json');
const VENUES_DEST = path.join(ROOT, 'docs', 'concepts', 'venues.mdx');
const DOCS_JSON = path.join(ROOT, 'docs', 'docs.json');
const LEGACY_MINT_JSON = path.join(ROOT, 'docs', 'mint.json');

// ---------------------------------------------------------------------------
// Venue labels
// ---------------------------------------------------------------------------

const VENUE_LABELS = {
    polymarket: 'Polymarket',
    polymarket_us: 'Polymarket US',
    kalshi: 'Kalshi',
    'kalshi-demo': 'Kalshi (Demo)',
    limitless: 'Limitless',
    probable: 'Probable',
    baozi: 'Baozi',
    myriad: 'Myriad',
    opinion: 'Opinion',
    metaculus: 'Metaculus',
    smarkets: 'Smarkets',
    'gemini-titan': 'Gemini Titan',
    hyperliquid: 'Hyperliquid',
    suibets: 'SuiBets',
    rain: 'Rain',
    hunch: 'Hunch',
};

const INTERNAL_EXCHANGE_TARGETS = new Set(['mock', 'router']);

function extractVenues(spec) {
    const enumValues =
        spec?.components?.parameters?.ExchangeParam?.schema?.enum;
    if (!Array.isArray(enumValues)) return [];
    return enumValues
        .filter((wire) => !INTERNAL_EXCHANGE_TARGETS.has(wire))
        .map((wire) => ({
            wire,
            label: VENUE_LABELS[wire] || wire,
        }));
}

// Extract all HOSTED-AUTOGEN:*:START ... HOSTED-AUTOGEN:*:END blocks from
// existing file content so they can be preserved after regeneration.
function extractHostedAutoGenBlocks(text) {
    const blocks = [];
    const re = /(\{\/\* HOSTED-AUTOGEN:[\w-]+:START \*\/\}[\s\S]*?\{\/\* HOSTED-AUTOGEN:[\w-]+:END \*\/\})/g;
    let match;
    while ((match = re.exec(text)) !== null) {
        blocks.push(match[1]);
    }
    return blocks;
}

function writeVenuesPage(venues, coreVersion) {
    // Read existing file to preserve HOSTED-AUTOGEN blocks
    let hostedBlocks = [];
    if (fs.existsSync(VENUES_DEST)) {
        const existing = fs.readFileSync(VENUES_DEST, 'utf8');
        hostedBlocks = extractHostedAutoGenBlocks(existing);
    }

    const rows = venues
        .map(
            ({ wire, label }) =>
                `| ${label} | \`${wire}\` | \`POST /api/${wire}/:method\` |`
        )
        .join('\n');

    const hostedSection = hostedBlocks.length > 0
        ? '\n\n' + hostedBlocks.join('\n\n') + '\n'
        : '';

    const body = `---
title: Supported Venues
description: "Every venue PMXT currently speaks."
---

{/*
  AUTO-GENERATED from pmxt-core's openapi spec (ExchangeParam enum).
  Do not edit by hand — run \`npm run generate:mintlify\` to regenerate.
  Source: docs/api-reference/openapi.json
  pmxt-core version at last sync: ${coreVersion}
*/}

PMXT currently supports the following venue targets. The **wire key** is
the value you pass in the URL — e.g. \`POST /api/polymarket/fetchMarkets\`
or \`new pmxt.Polymarket({})\` from the SDKs.

| Venue | Wire Key | Pass-Through Base |
| ----- | -------- | ----------------- |
${rows}

<Note>
  This list is regenerated automatically from the \`ExchangeParam\` enum
  in pmxt-core's OpenAPI spec on every \`pmxt-core\` upgrade. If a venue
  is missing here, it's not yet wired through pmxt-core.
</Note>
${hostedSection}
## Feature support

Not every venue supports every method. Broadly:

- **Catalog reads** (\`fetchMarkets\`, \`fetchEvents\`, \`fetchMarket\`,
  \`fetchEvent\`) — supported on every venue that the catalog ingests.
- **Live reads** (\`fetchOrderBook\`, \`fetchOHLCV\`, \`fetchTrades\`) —
  supported where the venue exposes the data.
- **Writes** (\`createOrder\`, \`cancelOrder\`, \`fetchBalance\`,
  \`fetchPositions\`) — supported where the venue has a trading API.

See the [API Reference](/api-reference/overview) for the per-method
matrix (inferred from the OpenAPI \`operationId\`s).
`;

    fs.mkdirSync(path.dirname(VENUES_DEST), { recursive: true });
    fs.writeFileSync(VENUES_DEST, body);
    console.log(
        `[generate-mintlify] wrote ${path.relative(ROOT, VENUES_DEST)} ` +
            `(${venues.length} venues` +
            (hostedBlocks.length > 0 ? `, preserved ${hostedBlocks.length} hosted block(s)` : '') +
            ')'
    );
}

// ---------------------------------------------------------------------------
// Endpoint grouping for the Mintlify sidebar
// ---------------------------------------------------------------------------

const ENDPOINT_GROUPS = [
    {
        name: 'System',
        match: (opId) => ['healthCheck', 'loadMarkets', 'close'].includes(opId),
    },
    {
        name: 'Events & Markets',
        match: (opId) =>
            /^(fetchEvents|fetchEvent|fetchEventsPaginated|fetchMarkets|fetchMarketsPaginated|fetchMarket)$/.test(
                opId
            ),
        order: ['fetchEvents', 'fetchEventsPaginated', 'fetchEvent', 'fetchMarkets', 'fetchMarketsPaginated', 'fetchMarket'],
    },
    {
        name: 'Order Book & Trades',
        match: (opId) =>
            /^(fetchOrderBook|fetchOrderBooks|fetchOHLCV|fetchTrades|getExecutionPrice|getExecutionPriceDetailed)$/.test(
                opId
            ),
    },
    // "Trading" and "Orders & Positions" groups are intentionally NOT
    // generated from the self-hosted openapi.json spec. The canonical
    // surfaces for those endpoints are the hosted groups in docs.json
    // (preserved via the `otherExternalGroups` path below) which render
    // from openapi-hosted-trading.json. Auto-generating the self-hosted
    // equivalents here would produce two same-named groups in the API
    // Reference sidebar (one with "Local Only" badges, one without).
    {
        name: 'Realtime',
        match: (opId) => /^(watch|unwatch)/.test(opId),
        // WebSocket methods are excluded from the OpenAPI spec (they aren't
        // HTTP request-response), so this group will never be populated from
        // spec paths alone.  Discover the hand-written .mdx pages on disk.
        discoverPages: () => {
            const apiRefDir = path.join(ROOT, 'docs', 'api-reference');
            if (!fs.existsSync(apiRefDir)) return [];
            const pages = [];
            // Overview page first
            if (fs.existsSync(path.join(apiRefDir, 'websocket.mdx'))) {
                pages.push('api-reference/websocket');
            }
            // Then individual watch/unwatch method pages in alphabetical order
            for (const file of fs.readdirSync(apiRefDir).sort()) {
                if (/^(watch|unwatch)-.*\.mdx$/.test(file)) {
                    pages.push('api-reference/' + file.replace(/\.mdx$/, ''));
                }
            }
            return pages;
        },
    },
    {
        name: 'Data Feeds',
        match: (opId) => /^feed/.test(opId),
        order: [
            'feedList', 'feedLoadMarkets', 'feedFetchTicker', 'feedFetchTickers',
            'feedFetchOHLCV', 'feedFetchOrderBook', 'feedWatchTicker',
            'feedFetchOracleRound', 'feedFetchOracleHistory', 'feedFetchHistoricalPrices',
        ],
    },
];

// Operations that exist in the OpenAPI spec but should not appear in the docs
// sidebar (e.g. SDK-only helpers that are exposed as routes but aren't meant
// to be called directly by API consumers).
const HIDDEN_OPERATIONS = new Set([
    'filterMarkets',
    'filterEvents',
    'fetchHedges',
    'fetchArbitrage',
    'fetchMatchedPrices',
    'compareMarketPrices',
    'fetchRelatedMarkets',
    'fetchMatchedMarkets',
    'fetchEventMatches',
    'fetchMarketMatches',
    'testDummyMethod',
    // Self-hosted Group A endpoints (`/api/{exchange}/createOrder`, etc.)
    // are intentionally hidden from the auto-generated sidebar. The
    // canonical "Trading" + "Orders & Positions" surfaces are the hosted
    // groups in docs.json that render from openapi-hosted-trading.json.
    // Auto-generating self-hosted equivalents would produce two same-named
    // groups (one with "Local Only" badges, one without). Self-hosters
    // still get the spec at docs/api-reference/openapi.json and reach the
    // endpoints via /guides/self-hosted.
    'createOrder',
    'buildOrder',
    'submitOrder',
    'cancelOrder',
    'editOrder',
    'fetchOrder',
    'fetchOpenOrders',
    'fetchClosedOrders',
    'fetchAllOrders',
    'fetchMyTrades',
    'fetchPositions',
    'fetchBalance',
    'fetchOrderHistory',
]);

// Convert an operationId to its expected MDX file path (docs-relative,
// no extension).  fetchEventMatches -> api-reference/fetch-event-matches
function operationIdToMdxPath(operationId) {
    const kebab = operationId
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
        .toLowerCase();
    return `api-reference/${kebab}`;
}

function buildEndpointGroups(spec) {
    // Each bucket entry is { ref, opId } so the sort comparator can
    // match against the order array regardless of ref format.
    const buckets = new Map();
    for (const group of ENDPOINT_GROUPS) buckets.set(group.name, []);
    buckets.set('Other', []);

    for (const [pathKey, methods] of Object.entries(spec.paths || {})) {
        for (const [method, op] of Object.entries(methods)) {
            if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
                continue;
            }
            const opId = op.operationId || '';
            if (HIDDEN_OPERATIONS.has(opId)) continue;

            // When an MDX file exists for this operation, reference it by
            // file path so Mintlify renders the hand-written body content
            // (examples, use-cases) alongside the OpenAPI spec.  Without
            // this, Mintlify auto-generates the page URL from the spec
            // (potentially under a tag-derived subdirectory like hosted/)
            // and the MDX body content is silently ignored.
            const mdxPath = operationIdToMdxPath(opId);
            const mdxFullPath = path.join(ROOT, 'docs', mdxPath + '.mdx');
            const ref = fs.existsSync(mdxFullPath)
                ? mdxPath
                : `${method.toUpperCase()} ${pathKey}`;

            let placed = false;
            for (const group of ENDPOINT_GROUPS) {
                if (group.match(opId)) {
                    buckets.get(group.name).push({ ref, opId });
                    placed = true;
                    break;
                }
            }
            if (!placed) buckets.get('Other').push({ ref, opId });
        }
    }

    const groups = [];
    for (const [name, entries] of buckets.entries()) {
        const groupDef = ENDPOINT_GROUPS.find((g) => g.name === name);

        // For groups with a discoverPages function (e.g. Realtime/WebSocket),
        // use discovered .mdx pages when the spec yields no entries.
        if (entries.length === 0) {
            if (groupDef?.discoverPages) {
                const discovered = groupDef.discoverPages();
                if (discovered.length > 0) {
                    groups.push({ group: name, pages: discovered });
                }
            }
            continue;
        }

        const sorted = groupDef?.order
            ? entries.sort((a, b) => {
                  const idxA = groupDef.order.indexOf(a.opId);
                  const idxB = groupDef.order.indexOf(b.opId);
                  return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
              })
            : entries;
        const refs = sorted.map((e) => e.ref);
        // Only include the openapi key when the group has OpenAPI path
        // refs (e.g. "GET /api/{exchange}/fetchMarkets").  Groups where
        // every page is an MDX file path don't need it — the openapi
        // frontmatter in each MDX file handles the spec binding.
        const hasOpenApiRefs = refs.some(
            (r) => /^(GET|POST|PUT|DELETE|PATCH) /.test(r)
        );
        const group = { group: name, pages: refs };
        if (hasOpenApiRefs) group.openapi = 'api-reference/openapi.json';
        groups.push(group);
    }
    return groups;
}

function insertGroupsAfter(groups, targetGroupName, groupsToInsert) {
    if (groupsToInsert.length === 0) return groups;

    const result = [];
    let inserted = false;
    for (const group of groups) {
        result.push(group);
        if (group.group === targetGroupName) {
            result.push(...groupsToInsert);
            inserted = true;
        }
    }

    if (!inserted) {
        result.push(...groupsToInsert);
    }
    return result;
}

function updateDocsJsonEndpoints(spec) {
    // Remove any leftover legacy mint.json.
    if (fs.existsSync(LEGACY_MINT_JSON)) {
        fs.unlinkSync(LEGACY_MINT_JSON);
        console.log(
            `[generate-mintlify] removed legacy ${path.relative(ROOT, LEGACY_MINT_JSON)}`
        );
    }

    if (!fs.existsSync(DOCS_JSON)) {
        console.warn(
            `[generate-mintlify] ${path.relative(ROOT, DOCS_JSON)} not found — skipping`
        );
        return;
    }

    const raw = fs.readFileSync(DOCS_JSON, 'utf8');
    const docs = JSON.parse(raw);
    const endpointGroups = buildEndpointGroups(spec);

    const nav = docs.navigation || {};
    const tabs = Array.isArray(nav.tabs) ? [...nav.tabs] : [];
    const apiTabIdx = tabs.findIndex((t) => t && t.tab === 'API Reference');
    // Preserve nav groups owned by other systems (e.g. hosted-pmxt's Router
    // group, which references openapi-hosted.json instead of openapi.json).
    const CORE_OPENAPI = 'api-reference/openapi.json';
    const existingApiTab = apiTabIdx >= 0 ? tabs[apiTabIdx] : null;
    const externalGroups = (existingApiTab?.groups || []).filter(
        (g) => g.openapi && g.openapi !== CORE_OPENAPI
    );
    const crossExchangeGroups = externalGroups.filter(
        (g) => g.group === 'Cross Exchange'
    );
    const enterpriseGroups = externalGroups.filter(
        (g) => g.group === 'Enterprise'
    );
    const otherExternalGroups = externalGroups.filter(
        (g) => g.group !== 'Cross Exchange' && g.group !== 'Enterprise'
    );
    // Order the API Reference tab so the customer's natural path is
    // walkable top-to-bottom: discover (Events & Markets) -> act
    // (Trading) -> inspect state (Orders & Positions) -> everything
    // else. Cross Exchange (matched-cluster discovery) gets inserted
    // first, then the hosted Trading + Orders & Positions groups are
    // inserted immediately after Events & Markets — that pushes Cross
    // Exchange one slot down, producing:
    //   ... -> Events & Markets -> Trading -> Orders & Positions
    //       -> Cross Exchange -> Order Book & Trades -> ...
    let apiGroups = [
        {
            group: 'Overview',
            pages: ['api-reference/overview'],
        },
        ...endpointGroups,
    ];
    apiGroups = insertGroupsAfter(
        apiGroups,
        'Events & Markets',
        crossExchangeGroups
    );
    apiGroups = insertGroupsAfter(
        apiGroups,
        'Events & Markets',
        otherExternalGroups
    );

    const apiTab = {
        tab: 'API Reference',
        groups: [...apiGroups, ...enterpriseGroups],
    };
    if (apiTabIdx >= 0) {
        const updatedTabs = [...tabs];
        updatedTabs[apiTabIdx] = apiTab;
        const updatedDocs = { ...docs, navigation: { ...nav, tabs: updatedTabs } };
        fs.writeFileSync(DOCS_JSON, JSON.stringify(updatedDocs, null, 2) + '\n');
    } else {
        const updatedDocs = { ...docs, navigation: { ...nav, tabs: [...tabs, apiTab] } };
        fs.writeFileSync(DOCS_JSON, JSON.stringify(updatedDocs, null, 2) + '\n');
    }

    const total = endpointGroups.reduce((n, g) => n + g.pages.length, 0);
    console.log(
        `[generate-mintlify] wrote ${path.relative(ROOT, DOCS_JSON)} ` +
            `(${endpointGroups.length} endpoint groups, ${total} endpoints)`
    );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
    if (!fs.existsSync(OPENAPI_JSON_PATH)) {
        console.error(
            `[generate-mintlify] ${path.relative(ROOT, OPENAPI_JSON_PATH)} not found. ` +
                `Run 'npm run generate:openapi --workspace=pmxt-core' first.`
        );
        process.exit(1);
    }

    const raw = fs.readFileSync(OPENAPI_JSON_PATH, 'utf8');
    const spec = JSON.parse(raw);

    // Derive the core version from the spec's info.version (set by
    // generate-openapi.js's rewriteForHosted).
    const coreVersion = spec.info?.version || 'unknown';

    // Generate venues page
    const venues = extractVenues(spec);
    if (venues.length > 0) {
        writeVenuesPage(venues, coreVersion);
    } else {
        console.warn(
            '[generate-mintlify] ExchangeParam enum missing — venues page not updated'
        );
    }

    // Update docs.json navigation sidebar
    updateDocsJsonEndpoints(spec);
}

main();
