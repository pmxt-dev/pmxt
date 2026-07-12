#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const TS_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const PY_EXT = new Set(['.py']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', '.venv', 'venv', '.next', 'coverage']);

// [description, regex, replacement]
// Applied in order — order matters:
//   1. Full-path method transforms (namespace + method in one shot) — avoids comment-insertion
//      breaking subsequent passes.
//   2. Generic namespace fallbacks — for any unmapped methods.
//   3. Constructor and standalone method transforms.
//   4. Parameter renames.
const TS_TRANSFORMS = [
  ['import @dome-api/sdk (sq)', /import\s+\{?\s*DomeClient\s*\}?\s+from\s+'@dome-api\/sdk'/g, "import pmxt from 'pmxtjs'"],
  ['import @dome-api/sdk (dq)', /import\s+\{?\s*DomeClient\s*\}?\s+from\s+"@dome-api\/sdk"/g, 'import pmxt from "pmxtjs"'],

  // Full-path method transforms — run before generic namespace patterns so the dot
  // is consumed together with the method name in a single replacement.
  ['dome.polymarket.markets.getMarketPrice(', /\bdome\.polymarket\.markets\.getMarketPrice\s*\(/g, 'poly.fetchMarkets( /* TODO(dome-to-pmxt): then .yes.price or .no.price */'],
  ['dome.polymarket.markets.getCandlestick(s)?(', /\bdome\.polymarket\.markets\.getCandlesticks?\s*\(/g, 'poly.fetchOHLCV('],
  ['dome.polymarket.markets.getMarkets(', /\bdome\.polymarket\.markets\.getMarkets\s*\(/g, 'poly.fetchMarkets('],
  ['dome.polymarket.markets.getOrderbooks(', /\bdome\.polymarket\.markets\.getOrderbooks\s*\(/g, 'poly.fetchOrderBook('],

  // Generic namespace fallbacks (unmapped methods get a TODO).
  ['dome.polymarket.websocket.', /\bdome\.polymarket\.websocket\./g, 'poly. /* TODO(dome-to-pmxt): use watchOrderBook(outcomeId) or watchTrades(outcomeId) */'],
  ['dome.polymarket.markets.', /\bdome\.polymarket\.markets\./g, 'poly. /* TODO(dome-to-pmxt): check method — fetchMarkets/fetchOHLCV/fetchOrderBook */'],
  ['dome.polymarket.', /\bdome\.polymarket\./g, 'poly.'],
  ['dome.kalshi.markets.', /\bdome\.kalshi\.markets\./g, 'kalshi. /* TODO(dome-to-pmxt): check method — fetchMarkets/fetchOHLCV/fetchOrderBook */'],
  ['dome.kalshi.', /\bdome\.kalshi\./g, 'kalshi.'],

  // Declaration-specific constructors. Keep these before generic constructor
  // replacements so Polymarket method rewrites have a matching `poly` binding.
  ['const|let|var dome = new DomeClient({...})', /\b(const|let|var)\s+dome\s*=\s*new\s+DomeClient\s*\(\{[^}]*\}\)/g, '$1 poly = /* TODO(dome-to-pmxt): new pmxt.Polymarket() or new pmxt.Kalshi() */ new pmxt.Polymarket()'],
  ['const|let|var dome = new DomeClient()', /\b(const|let|var)\s+dome\s*=\s*new\s+DomeClient\s*\(\s*\)/g, '$1 poly = /* TODO(dome-to-pmxt): new pmxt.Polymarket() or new pmxt.Kalshi() */ new pmxt.Polymarket()'],

  // Generic constructor fallbacks for non-declaration contexts.
  ['new DomeClient({...})', /new\s+DomeClient\s*\(\{[^}]*\}\)/g, '/* TODO(dome-to-pmxt): new pmxt.Polymarket() or new pmxt.Kalshi() */ new pmxt.Polymarket()'],
  ['new DomeClient()', /new\s+DomeClient\s*\(\s*\)/g, '/* TODO(dome-to-pmxt): new pmxt.Polymarket() or new pmxt.Kalshi() */ new pmxt.Polymarket()'],

  // Standalone method transforms — catch calls where the namespace was already stripped
  // or assigned to a local variable.
  ['.getMarketPrice(', /\.getMarketPrice\s*\(/g, '.fetchMarkets( /* TODO(dome-to-pmxt): then .yes.price or .no.price */'],
  ['.getCandlestick(s)?(', /\.getCandlesticks?\s*\(/g, '.fetchOHLCV('],
  ['.getMarkets(', /\.getMarkets\s*\(/g, '.fetchMarkets('],
  ['.getOrderbooks(', /\.getOrderbooks\s*\(/g, '.fetchOrderBook('],

  // Parameter renames. TS uses object key syntax (key:) so \s*: is precise enough
  // to avoid matching property access (.pagination_key).
  ['pagination_key:', /\bpagination_key\s*:/g, 'offset: /* TODO(dome-to-pmxt): cursor-based → offset-based */'],
  ['start_ts:', /\bstart_ts\s*:/g, 'start: /* TODO(dome-to-pmxt): unix seconds → new Date(ts * 1000) */'],
  ['end_ts:', /\bend_ts\s*:/g, 'end: /* TODO(dome-to-pmxt): unix seconds → new Date(ts * 1000) */'],

  // Status enum rename.
  ['status: "open" → "active"', /(\bstatus\s*:\s*['"])open(['"])/g, '$1active$2'],
];

const PY_TRANSFORMS = [
  ['from dome_api_sdk import DomeClient', /from dome_api_sdk import DomeClient/g, 'import pmxt'],
  ['import dome_api_sdk', /import dome_api_sdk/g, 'import pmxt'],

  // Full-path method transforms — run before generic namespace patterns.
  ['dome.polymarket.markets.get_market_price(', /\bdome\.polymarket\.markets\.get_market_price\s*\(/g, 'poly.fetch_markets('],
  ['dome.polymarket.markets.get_candlestick(s)?(', /\bdome\.polymarket\.markets\.get_candlesticks?\s*\(/g, 'poly.fetch_ohlcv('],
  ['dome.polymarket.markets.get_markets(', /\bdome\.polymarket\.markets\.get_markets\s*\(/g, 'poly.fetch_markets('],
  ['dome.polymarket.markets.get_orderbooks(', /\bdome\.polymarket\.markets\.get_orderbooks\s*\(/g, 'poly.fetch_order_book('],

  // Generic namespace fallbacks.
  ['dome.polymarket.markets.', /\bdome\.polymarket\.markets\./g, 'poly.'],
  ['dome.polymarket.', /\bdome\.polymarket\./g, 'poly.'],
  ['dome.kalshi.', /\bdome\.kalshi\./g, 'kalshi.'],

  // Assignment-specific constructors. Keep these before generic constructor
  // replacements so Polymarket method rewrites have a matching `poly` binding.
  ['dome = DomeClient({...})', /^(\s*)dome\s*=\s*DomeClient\s*\(\{[^}]*\}\)/gm, '$1poly = pmxt.Polymarket()  # TODO(dome-to-pmxt): or pmxt.Kalshi()'],
  ['dome = DomeClient()', /^(\s*)dome\s*=\s*DomeClient\s*\(\s*\)/gm, '$1poly = pmxt.Polymarket()  # TODO(dome-to-pmxt): or pmxt.Kalshi()'],

  // Generic constructor fallbacks for non-assignment contexts.
  ['DomeClient({...})', /DomeClient\s*\(\{[^}]*\}\)/g, 'pmxt.Polymarket()  # TODO(dome-to-pmxt): or pmxt.Kalshi()'],
  ['DomeClient()', /DomeClient\s*\(\s*\)/g, 'pmxt.Polymarket()  # TODO(dome-to-pmxt): or pmxt.Kalshi()'],

  // Standalone method transforms.
  ['.get_market_price(', /\.get_market_price\s*\(/g, '.fetch_markets('],
  ['.get_candlestick(s)?(', /\.get_candlesticks?\s*\(/g, '.fetch_ohlcv('],
  ['.get_markets(', /\.get_markets\s*\(/g, '.fetch_markets('],
  ['.get_orderbooks(', /\.get_orderbooks\s*\(/g, '.fetch_order_book('],

  // Parameter renames. Use negative lookbehind (?<!\.) so that property accesses
  // like first_page.pagination.pagination_key are NOT renamed — only dict keys
  // ("pagination_key":) and kwargs (pagination_key=) are renamed.
  ['pagination_key', /(?<!\.)\bpagination_key\b/g, 'offset'],
  ['start_ts', /(?<!\.)\bstart_ts\b/g, 'start'],
  ['end_ts', /(?<!\.)\bend_ts\b/g, 'end'],

  // Status enum rename.
  ['status="open" → "active"', /(\bstatus\s*[=:]\s*["'])open(["'])/g, '$1active$2'],
];

function collectFiles(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];

  const results = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (TS_EXT.has(ext) || PY_EXT.has(ext)) results.push(full);
      }
    }
  }
  walk(target);
  return results;
}

function transformFile(filePath, dryRun) {
  const ext = path.extname(filePath).toLowerCase();
  const transforms = PY_EXT.has(ext) ? PY_TRANSFORMS : TS_TRANSFORMS;

  let content = fs.readFileSync(filePath, 'utf8');
  const applied = [];

  for (const [desc, pattern, replacement] of transforms) {
    const next = content.replace(pattern, replacement);
    if (next !== content) {
      applied.push(desc);
      content = next;
    }
  }

  if (applied.length === 0) return null;
  if (!dryRun) fs.writeFileSync(filePath, content, 'utf8');
  return applied;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const target = args.find(a => !a.startsWith('-'));

  if (!target) {
    console.error('Usage: dome-to-pmxt <file-or-directory> [--dry-run]');
    console.error('');
    console.error('Options:');
    console.error('  --dry-run   Show what would change without writing files');
    process.exit(1);
  }

  if (!fs.existsSync(target)) {
    console.error(`Not found: ${target}`);
    process.exit(1);
  }

  const files = collectFiles(target);

  if (files.length === 0) {
    console.log('No .ts/.js/.py files found.');
    return;
  }

  let changedCount = 0;

  for (const file of files) {
    const applied = transformFile(file, dryRun);
    if (!applied) continue;
    changedCount++;
    const rel = path.relative(process.cwd(), file);
    console.log(`\n${dryRun ? '[dry-run] ' : ''}${rel}`);
    for (const desc of applied) console.log(`  ~ ${desc}`);
  }

  const verb = dryRun ? 'would be modified' : 'modified';
  console.log(`\n${changedCount}/${files.length} file(s) ${verb}.`);

  if (changedCount > 0) {
    console.log('\nNext steps:');
    console.log('  1. npm install pmxtjs   (or: pip install pmxt)');
    console.log('  2. Search for TODO(dome-to-pmxt) and resolve each one');
    console.log('  3. Full guide: docs/MIGRATE_FROM_DOMEAPI.md');
  }
}

main();
