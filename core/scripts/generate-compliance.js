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

// Exchange display order (skip kalshi-demo since it inherits Kalshi fully)
const EXCHANGE_ORDER = ['polymarket', 'kalshi', 'limitless', 'probable', 'baozi', 'myriad', 'opinion', 'metaculus', 'hunch'];

function toDisplayName(slug) {
    return slug.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
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
    const capabilityOverrides = parseCapabilityOverrides(indexContent);

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

    for (const [method, value] of Object.entries(capabilityOverrides)) {
        if (!allMethods.includes(method)) continue;
        if (value === false) {
            results[method] = 'no';
        } else if (value === 'emulated') {
            results[method] = 'emulated';
        } else if (value === true) {
            results[method] = 'yes';
        }
    }

    // Special case: watchOrderBook/watchTrades may be delegated to websocket module
    // If index.ts has the method and calls websocket, it's supported
    // The index.ts override check above already catches this

    return results;
}

function parseCapabilityOverrides(content) {
    const match = /capabilityOverrides\s*=\s*\{([\s\S]*?)\n\s*\}/.exec(content);
    if (!match) return {};

    const overrides = {};
    const entryRegex = /(\w+)\s*:\s*(false|true|'emulated'|"emulated")/g;
    let entry;
    while ((entry = entryRegex.exec(match[1])) !== null) {
        const [, method, rawValue] = entry;
        if (rawValue === 'false') {
            overrides[method] = false;
        } else if (rawValue === 'true') {
            overrides[method] = true;
        } else {
            overrides[method] = 'emulated';
        }
    }
    return overrides;
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
        case 'emulated': return 'E';
        case 'no': return '-';
        default: return '?';
    }
}

const HUNCH_NOTES = `
## Hunch Notes

Hunch is a parimutuel prediction market on Base USDC. Markets are pool-based
rather than CLOB- or AMM-backed; prices are implied odds. Settlement uses
x402 / EIP-3009 transferWithAuthorization, where the bettor wallet signs a USDC
authorization and the relayer sponsors gas.

Hunch \`fetchOrderBook\`, \`watchOrderBook\`, and \`watchTrades\` are emulated
from the research/order state. \`createOrder\` accepts only \`side: 'buy'\` and
\`type: 'market'\`; \`outcomeId\` uses \`"{marketId}:{side}"\`. Hunch positions
are pool entries, so \`cancelOrder\`, \`fetchOrder\`, \`fetchClosedOrders\`, and
\`fetchAllOrders\` are not supported.
`;

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
- **E** - Emulated or partially supported
- **-** - Not supported

${HUNCH_NOTES}

## Compliance Policy
- **Failure over Warning**: Tests must fail if no relevant data (markets, events, candles) is found. This ensures that we catch API breakages or unexpected empty responses.

## Tests with authentication
requires a dotenv in the root dir with
\`\`\`
POLYMARKET_PRIVATE_KEY=0x...
# Kalshi
KALSHI_API_KEY=...
KALSHI_PRIVATE_KEY=... (RSA Private Key)
# Limitless
LIMITLESS_PRIVATE_KEY=0x...
# Myriad
MYRIAD_API_KEY=...
MYRIAD_WALLET_ADDRESS=0x...
# Metaculus (required for API access — unauthenticated requests return 403)
METACULUS_API_TOKEN=...
# Hunch (reads are keyless; privateKey signs the x402 USDC payment on Base)
HUNCH_PRIVATE_KEY=0x...
HUNCH_WALLET_ADDRESS=0x...   # optional; derived from HUNCH_PRIVATE_KEY when absent
\`\`\`
`;

fs.writeFileSync(OUTPUT_PATH, output);
console.log(`Generated COMPLIANCE.md with ${EXCHANGE_ORDER.length} exchanges`);
for (const slug of EXCHANGE_ORDER) {
    const r = exchangeResults[slug];
    const supported = Object.values(r).filter(v => v === 'yes' || v === 'emulated').length;
    const total = Object.values(r).length;
    console.log(`  ${toDisplayName(slug)}: ${supported}/${total} methods supported`);
}
