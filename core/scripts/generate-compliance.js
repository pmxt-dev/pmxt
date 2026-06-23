// Generates core/COMPLIANCE.md from exchange implementations.
// Run via: npm run generate:compliance --workspace=pmxt-core
//
// Scans each exchange's index.ts to check which BaseExchange methods are
// overridden, and whether they throw "not supported" / "not available".
// Source of truth: core/src/exchanges/*/index.ts

const fs = require('fs');
const path = require('path');

const EXCHANGES_DIR = path.join(__dirname, '../src/exchanges');
const OUTPUT_PATH = path.join(__dirname, '../COMPLIANCE.md');

// Methods to check, grouped by category for the table.
// Only includes methods that are exchange-specific (implemented per-exchange).
const METHOD_CATEGORIES = [
    { category: 'Market Data', methods: ['fetchMarkets', 'fetchEvents', 'fetchMarket', 'fetchEvent'] },
    { category: 'Public Data', methods: ['fetchOHLCV', 'fetchOrderBook', 'fetchTrades'] },
    { category: 'Private Data', methods: ['fetchBalance', 'fetchPositions', 'fetchMyTrades'] },
    { category: 'Trading', methods: ['createOrder', 'cancelOrder', 'fetchOrder', 'fetchOpenOrders', 'fetchClosedOrders', 'fetchAllOrders'] },
    { category: 'Calculations', methods: ['getExecutionPrice', 'getExecutionPriceDetailed'] },
    { category: 'Real-time', methods: ['watchOrderBook', 'watchTrades'] },
];

// Preferred public-production display order. New exchange directories not listed
// here are appended alphabetically so the matrix cannot silently omit them.
const PREFERRED_EXCHANGE_ORDER = [
    'polymarket',
    'polymarket_us',
    'kalshi',
    'limitless',
    'probable',
    'baozi',
    'myriad',
    'opinion',
    'metaculus',
    'smarkets',
    'hyperliquid',
    'gemini-titan',
    'suibets',
    'rain',
    'hunch',
];

// kalshi-demo is a demo wrapper around Kalshi, and mock is for local tests.
const SKIPPED_EXCHANGE_SLUGS = new Set(['kalshi-demo', 'mock']);

const DISPLAY_NAMES = {
    polymarket_us: 'PolymarketUS',
    'gemini-titan': 'GeminiTitan',
    suibets: 'SuiBets',
};

function listProductionExchangeSlugs() {
    const discovered = fs
        .readdirSync(EXCHANGES_DIR, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .filter(slug => fs.existsSync(path.join(EXCHANGES_DIR, slug, 'index.ts')))
        .filter(slug => !SKIPPED_EXCHANGE_SLUGS.has(slug));

    const discoveredSet = new Set(discovered);
    const preferred = PREFERRED_EXCHANGE_ORDER.filter(slug => discoveredSet.has(slug));
    const preferredSet = new Set(preferred);
    const appended = discovered
        .filter(slug => !preferredSet.has(slug))
        .sort((a, b) => a.localeCompare(b));

    return [...preferred, ...appended];
}

const EXCHANGE_ORDER = listProductionExchangeSlugs();

function toDisplayName(slug) {
    return DISPLAY_NAMES[slug] ?? slug
        .split(/[-_]/)
        .map(p => p.charAt(0).toUpperCase() + p.slice(1))
        .join('');
}

// Check if the exchange directory has a file that overrides the given method.
// We scan index.ts (and websocket.ts for watch* methods) for async method declarations.
function analyzeExchange(exchangeDir) {
    const results = {};

    const indexPath = path.join(exchangeDir, 'index.ts');
    const wsPath = path.join(exchangeDir, 'websocket.ts');

    const indexContent = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
    const wsContent = fs.existsSync(wsPath) ? fs.readFileSync(wsPath, 'utf8') : '';

    const allMethods = METHOD_CATEGORIES.flatMap(c => c.methods);

    for (const method of allMethods) {
        // Check index.ts for override
        const methodRegex = new RegExp(`async\\s+${method}\\s*\\(`);

        if (methodRegex.test(indexContent)) {
            // Method is overridden in index.ts — check if it throws "not supported"
            const block = extractMethodBlock(indexContent, method);
            if (isNotSupported(block)) {
                results[method] = 'no';
            } else {
                results[method] = 'yes';
            }
        } else {
            // Not overridden in index.ts
            // For getExecutionPrice/getExecutionPriceDetailed, these are in BaseExchange
            // and work generically for all exchanges that have fetchOrderBook
            if (method === 'getExecutionPrice' || method === 'getExecutionPriceDetailed') {
                // Available if fetchOrderBook is available
                results[method] = results['fetchOrderBook'] || 'no';
            } else if (method === 'fetchMarkets' || method === 'fetchEvents' ||
                       method === 'fetchMarket' || method === 'fetchEvent') {
                // These are implemented in BaseExchange via fetchMarketsImpl/fetchEventsImpl
                // Check if fetchMarketsImpl or fetchEventsImpl is overridden
                const implMethod = method.startsWith('fetchMarket') ? 'fetchMarketsImpl' : 'fetchEventsImpl';
                const implRegex = new RegExp(`async\\s+${implMethod}\\s*\\(`);
                if (implRegex.test(indexContent)) {
                    results[method] = 'yes';
                } else if (method === 'fetchMarket' || method === 'fetchEvent') {
                    // fetchMarket/fetchEvent delegates to fetchMarkets/fetchEvents
                    const parentMethod = method === 'fetchMarket' ? 'fetchMarkets' : 'fetchEvents';
                    results[method] = results[parentMethod] || 'no';
                } else {
                    results[method] = 'no';
                }
            } else {
                results[method] = 'no';
            }
        }
    }

    // Special case: watchOrderBook/watchTrades may be delegated to websocket module
    // If index.ts has the method and calls websocket, it's supported
    // The index.ts override check above already catches this

    return results;
}

function extractMethodBlock(content, methodName) {
    const regex = new RegExp(`async\\s+${methodName}\\s*\\(`);
    const match = regex.exec(content);
    if (!match) return '';

    // Find the opening brace of the method body
    let i = match.index;
    let depth = 0;
    let foundOpen = false;
    while (i < content.length) {
        if (content[i] === '{') {
            depth++;
            foundOpen = true;
        } else if (content[i] === '}') {
            depth--;
            if (foundOpen && depth === 0) {
                return content.slice(match.index, i + 1);
            }
        }
        i++;
    }
    return content.slice(match.index, Math.min(match.index + 500, content.length));
}

function isNotSupported(block) {
    // Check if the method body immediately throws "not supported" or "not available"
    return /throw\s+new\s+\w+\(.*not (supported|available)/i.test(block);
}

function statusSymbol(status) {
    switch (status) {
        case 'yes': return 'Y';
        case 'no': return '-';
        default: return '?';
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const exchangeResults = {};
for (const slug of EXCHANGE_ORDER) {
    const dir = path.join(EXCHANGES_DIR, slug);
    if (!fs.existsSync(dir)) {
        console.warn(`WARNING: exchange directory not found: ${slug}`);
        continue;
    }
    exchangeResults[slug] = analyzeExchange(dir);
}

// Build the table
const exchangeHeaders = EXCHANGE_ORDER.map(toDisplayName);
const headerRow = `| Category | Function | ${exchangeHeaders.join(' | ')} |`;
const alignRow = `| :--- | :--- | ${EXCHANGE_ORDER.map(() => ':---:').join(' | ')} |`;

const rows = [headerRow, alignRow];

for (const { category, methods } of METHOD_CATEGORIES) {
    for (let i = 0; i < methods.length; i++) {
        const method = methods[i];
        const catCol = i === 0 ? `**${category}**` : '';
        const cells = EXCHANGE_ORDER.map(slug => statusSymbol(exchangeResults[slug][method]));
        rows.push(`| ${catCol} | \`${method}\` | ${cells.join(' | ')} |`);
    }
}

const output = `<!-- This file is auto-generated by core/scripts/generate-compliance.js -->
<!-- Do not edit manually. To regenerate: npm run generate:compliance --workspace=pmxt-core -->
<!-- Source of truth: core/src/exchanges/*/index.ts -->

# Feature Support & Compliance

This document details the feature support and compliance status for each exchange. PMXT enforces a strict compliance standard to ensure protocol consistency across all implementations.

## Functions Status

${rows.join('\n')}

## Legend
- **Y** - Supported
- **-** - Not supported

## Compliance Policy
- **Failure over Warning**: Tests must fail if no relevant data (markets, events, candles) is found. This ensures that we catch API breakages or unexpected empty responses.

## Tests with authentication
Authenticated tests require a dotenv in the root dir with the venue credentials
needed for the methods under test. Use only test accounts or intentionally
funded wallets.

\`\`\`
# Polymarket
POLYMARKET_PRIVATE_KEY=0x...
POLYMARKET_API_KEY=...
POLYMARKET_API_SECRET=...
POLYMARKET_PASSPHRASE=...
POLYMARKET_FUNDER_ADDRESS=0x...

# Polymarket US
POLYMARKET_US_KEY_ID=...
POLYMARKET_US_SECRET_KEY=...

# Kalshi
KALSHI_API_KEY=...
KALSHI_PRIVATE_KEY=... (RSA Private Key)

# Limitless
LIMITLESS_PRIVATE_KEY=0x...
LIMITLESS_API_KEY=...
LIMITLESS_API_SECRET=...
LIMITLESS_PASSPHRASE=...

# Probable
PROBABLE_API_KEY=...
PROBABLE_API_SECRET=...
PROBABLE_PASSPHRASE=...
PROBABLE_PRIVATE_KEY=0x...

# Baozi
BAOZI_PRIVATE_KEY=...

# Myriad
MYRIAD_API_KEY=...
MYRIAD_WALLET_ADDRESS=0x...

# Opinion
OPINION_API_KEY=...
OPINION_PRIVATE_KEY=0x...
OPINION_FUNDER_ADDRESS=0x...

# Metaculus (required for API access — unauthenticated requests return 403)
METACULUS_API_TOKEN=...

# Smarkets
SMARKETS_EMAIL=...
SMARKETS_PASSWORD=...

# Hyperliquid
HYPERLIQUID_WALLET_ADDRESS=0x...
HYPERLIQUID_PRIVATE_KEY=0x...

# Gemini Titan
GEMINI_API_KEY=...
GEMINI_API_SECRET=...

# SuiBets
SUIBETS_WALLET_ADDRESS=0x...

# Rain
RAIN_PRIVATE_KEY=0x...
RAIN_WALLET_ADDRESS=0x...
RAIN_SUBGRAPH_URL=...
RAIN_SUBGRAPH_API_KEY=...
RAIN_WS_RPC_URL=...

# Hunch
HUNCH_PRIVATE_KEY=0x...
HUNCH_WALLET_ADDRESS=0x...
HUNCH_BASE_URL=...
\`\`\`
`;

fs.writeFileSync(OUTPUT_PATH, output);
console.log(`Generated COMPLIANCE.md with ${EXCHANGE_ORDER.length} exchanges`);
for (const slug of EXCHANGE_ORDER) {
    const r = exchangeResults[slug];
    const supported = Object.values(r).filter(v => v === 'yes').length;
    const total = Object.values(r).length;
    console.log(`  ${toDisplayName(slug)}: ${supported}/${total} methods supported`);
}
