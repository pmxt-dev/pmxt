#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const cliRoot = path.resolve(__dirname, "..");
const normalizerPath = path.join(cliRoot, "cli", "argv-aliases.js");

let normalizeArgvAliases;
try {
  ({ normalizeArgvAliases } = require(normalizerPath));
} catch (error) {
  throw new Error(
    `Expected argv alias normalizer at ${path.relative(cliRoot, normalizerPath)} exporting normalizeArgvAliases(argv): ${error.message}`,
  );
}

assert.equal(
  typeof normalizeArgvAliases,
  "function",
  "normalizeArgvAliases must be exported as a function",
);

function verify(name, input, expected) {
  const original = [...input];
  const actual = normalizeArgvAliases(input);

  assert.deepEqual(input, original, `${name}: normalizer must not mutate input argv`);
  assert.deepEqual(actual, expected, `${name}: normalized argv mismatch`);
  assert.deepEqual(
    normalizeArgvAliases(actual),
    expected,
    `${name}: normalizer must be idempotent for normalized argv`,
  );
}

verify(
  "exchange-prefixed camelCase operation",
  ["polymarket", "fetchMarkets", "--query", "Trump"],
  ["markets", "--exchange", "polymarket", "--query", "Trump"],
);

verify(
  "exchange-prefixed canonical command",
  ["polymarket", "markets", "--query", "Trump"],
  ["markets", "--exchange", "polymarket", "--query", "Trump"],
);

verify(
  "exchange-prefixed command help stays on the command",
  ["polymarket", "fetchMarkets", "--help"],
  ["markets", "--exchange", "polymarket", "--help"],
);

verify(
  "exchange-prefixed operation preserves positional args and flags",
  ["polymarket", "fetchOrderBook", "0xabc", "--limit", "10"],
  ["orderbook", "--exchange", "polymarket", "0xabc", "--limit", "10"],
);

verify(
  "bare exchange becomes exchange-scoped help",
  ["polymarket"],
  ["exchange", "--exchange", "polymarket"],
);

verify(
  "bare exchange help flag becomes exchange-scoped help",
  ["polymarket", "--help"],
  ["exchange", "--exchange", "polymarket"],
);

verify(
  "direct camelCase operation alias",
  ["fetchMarkets", "--query", "Trump"],
  ["markets", "--query", "Trump"],
);

verify(
  "space-separated order group",
  ["order", "create", "--market-id", "m1"],
  ["order:create", "--market-id", "m1"],
);

verify(
  "exchange-prefixed order group",
  ["kalshi", "order", "create", "--market-id", "m1"],
  ["order:create", "--exchange", "kalshi", "--market-id", "m1"],
);

verify(
  "exchange-prefixed auth exchange status",
  ["polymarket", "auth", "status"],
  ["auth", "status-exchange", "polymarket"],
);

verify(
  "exchange-prefixed auth set-exchange",
  ["polymarket", "auth", "set-exchange", "--private-key", "0xabc"],
  ["auth", "set-exchange", "polymarket", "--private-key", "0xabc"],
);

verify(
  "space-separated feed group",
  ["feed", "fetchTicker", "binance", "BTCUSDT"],
  ["feed:fetchTicker", "binance", "BTCUSDT"],
);

verify(
  "exchange-prefixed watch command prepends exchange positional arg",
  ["polymarket", "watchOrderBook", "0xabc", "--limit", "10"],
  ["watch:orderBook", "polymarket", "0xabc", "--limit", "10"],
);

verify(
  "already-normalized command is unchanged",
  ["markets", "--exchange", "polymarket", "--query", "Trump"],
  ["markets", "--exchange", "polymarket", "--query", "Trump"],
);

console.log("argv alias normalizer verification passed");
