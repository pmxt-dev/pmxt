"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.ROOT_HELP = void 0;
exports.shouldShowRootHelp = shouldShowRootHelp;

exports.ROOT_HELP = `PMXT command-line interface

USAGE
  pmxt <exchange> <command> [flags]
  pmxt <command> --exchange <exchange> [flags]

QUICK START
  pmxt auth login --api-key <pmxt_api_key>
  pmxt polymarket markets --query Trump --limit 5
  PMXT_API_KEY=<pmxt_api_key> pmxt kalshi events --query election --limit 5

COMMON COMMANDS
  pmxt <exchange> markets             Search markets
  pmxt <exchange> events              Search events
  pmxt <exchange> market              Fetch one market
  pmxt <exchange> event               Fetch one event
  pmxt <exchange> orderbook           Fetch an order book
  pmxt <exchange> trades              Fetch public trades
  pmxt <exchange> positions           Fetch authenticated positions
  pmxt <exchange> balance             Fetch authenticated balances

GROUPS
  pmxt auth                           Manage PMXT API keys and venue credentials
  pmxt order                          Build, create, submit, cancel, or get orders
  pmxt orders                         Fetch open, closed, all, or user trade history
  pmxt router                         Find matching markets and events across venues
  pmxt feed                           Fetch data-feed tickers, candles, books, and streams
  pmxt watch                          Stream venue order books and trades as JSONL
  pmxt enterprise                     Run Enterprise matched-market and SQL commands
  pmxt server                         Manage an installed local pmxt-core sidecar

FLAGS
  --pmxt-api-key <key>                One-shot hosted PMXT API key
  --base-url <url>                    Override PMXT API base URL
  --json                              Print raw JSON
  --help                              Show command help

EXAMPLES
  pmxt polymarket markets --query Trump --limit 5
  pmxt kalshi events --query "NBA" --limit 5 --json
  pmxt polymarket orderbook <outcome-id> --limit 20
  pmxt router market-matches --market-id <market-id>
  pmxt feed fetchTicker polymarket <symbol>

Run "pmxt <command> --help" for command flags.
Run "pmxt <exchange>" for exchange-scoped examples.`;

function shouldShowRootHelp(args) {
  return args.length === 0
    || (args.length === 1 && (args[0] === "--help" || args[0] === "-h" || args[0] === "help"));
}
