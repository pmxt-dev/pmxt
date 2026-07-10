#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const cliRoot = path.resolve(__dirname, "..");
const commandsRoot = path.join(cliRoot, "commands");

const envKeys = ["HOME", "PMXT_API_KEY", "PMXT_BASE_URL", "PMXT_AUTH_STORE", "PMXT_AUTH_STORE_PATH", "FORCE_COLOR", "NO_COLOR"];
const calls = [];
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), `pmxt-feed-cli-home-${process.pid}-`));
const emptyAuthStore = path.join(tempHome, "auth.json");
fs.writeFileSync(emptyAuthStore, "{}\n", { mode: 0o600 });

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function assertRejects(fn, pattern, message) {
  try {
    await fn();
  } catch (error) {
    process.exitCode = undefined;
    assert(pattern.test(error.message), `${message}: ${error.message}`);
    return;
  }
  throw new Error(message);
}

async function rejected(fn) {
  try {
    await fn();
  } catch (error) {
    process.exitCode = undefined;
    return error;
  }
  throw new Error("expected command to reject");
}

async function withEnv(env, fn) {
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  for (const key of envKeys) {
    delete process.env[key];
  }
  Object.assign(process.env, {
    HOME: tempHome,
    PMXT_AUTH_STORE_PATH: emptyAuthStore,
  }, env);
  try {
    return await fn();
  } finally {
    for (const key of envKeys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

async function run(commandPath, argv) {
  const mod = require(path.join(commandsRoot, `${commandPath}.js`));
  const Command = mod.default || mod;
  await Command.run(argv, cliRoot);
}

function lastCall() {
  const call = calls[calls.length - 1];
  assert(call, "expected fetch to be called");
  return call;
}

function assertQuery(url, expected) {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(expected)) {
    assert(parsed.searchParams.get(key) === String(value), `expected ${key}=${value}, got ${parsed.searchParams.get(key)}`);
  }
}

function assertCall(call, expected) {
  const url = new URL(call.url);
  assert(url.origin === expected.origin, `unexpected base URL ${url.origin}`);
  assert(url.pathname === expected.pathname, `unexpected path ${url.pathname}`);
  if (expected.authorization) {
    assert(call.init.headers.Authorization === expected.authorization, `expected ${expected.authorization}`);
  }
  if (expected.query) {
    assertQuery(call.url, expected.query);
  }
}

global.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  return {
    ok: true,
    statusText: "OK",
    json: async () => ({ success: true, data: { ok: true } }),
  };
};

async function main() {
  try {
    calls.length = 0;
    await withEnv({}, async () => {
      await assertRejects(
        () => run("feeds", ["--hosted", "--json"]),
        /Hosted PMXT needs an API key/,
        "--hosted feed commands without PMXT auth should fail before network",
      );
    });
    assert(calls.length === 0, "hosted auth preflight should not make a feed HTTP call");

    calls.length = 0;
    await withEnv({ FORCE_COLOR: "1" }, async () => {
      const error = await rejected(() => run("feeds", ["--hosted"]));
      assert(/\x1b\[31mHosted PMXT needs an API key\x1b\[39m/.test(error.message), "streaming hosted auth should color error heading");
      assert(/\x1b\[33mHosted:\x1b\[39m/.test(error.message), "streaming hosted auth should color guidance labels");
      assert(/\x1b\[36mpmxt auth login --api-key <pmxt_api_key>\x1b\[39m/.test(error.message), "streaming hosted auth should color commands");
    });
    assert(calls.length === 0, "colored hosted auth preflight should not make a feed HTTP call");

    await withEnv({ FORCE_COLOR: "1" }, async () => {
      const error = await rejected(() => run("feeds", ["--hosted", "--json"]));
      assert(!/\x1b\[/.test(error.message), "--json should disable streaming auth color");
    });

    calls.length = 0;
    await withEnv({}, async () => {
      await run("feeds", [
        "--hosted",
        "--pmxt-api-key", "hosted-key",
        "--json",
      ]);
    });
    assertCall(lastCall(), {
      origin: "https://api.pmxt.dev",
      pathname: "/api/feeds",
      authorization: "Bearer hosted-key",
    });

    calls.length = 0;
    await withEnv({}, async () => {
      await run("feeds", [
        "--base-url", "https://flag.pmxt.test",
        "--pmxt-api-key", "flag-key",
        "--json",
      ]);
    });
    assertCall(lastCall(), {
      origin: "https://flag.pmxt.test",
      pathname: "/api/feeds",
      authorization: "Bearer flag-key",
    });

    calls.length = 0;
    await withEnv({ PMXT_API_KEY: "env-key", PMXT_BASE_URL: "https://env.pmxt.test" }, async () => {
      await run("feed/fetchTicker", ["binance", "BTC/USDT", "--json"]);
    });
    assertCall(lastCall(), {
      origin: "https://env.pmxt.test",
      pathname: "/api/feeds/binance/fetchTicker",
      authorization: "Bearer env-key",
      query: { symbol: "BTC/USDT" },
    });

    const storePath = path.join(os.tmpdir(), `pmxt-feed-cli-${process.pid}.json`);
    fs.writeFileSync(storePath, JSON.stringify({ pmxtApiKey: "store-key", baseUrl: "https://store.pmxt.test" }));
    try {
      calls.length = 0;
      await withEnv({}, async () => {
        await run("feed/fetchHistoricalPrices", [
          "chainlink",
          "BTC/USD",
          "--auth-store", storePath,
          "--from-timestamp", "1700000000000",
          "--until-timestamp", "1700003600000",
          "--max-size", "2",
          "--order", "desc",
          "--json",
        ]);
      });
      assertCall(lastCall(), {
        origin: "https://store.pmxt.test",
        pathname: "/api/feeds/chainlink/fetchHistoricalPrices",
        authorization: "Bearer store-key",
        query: {
          symbol: "BTC/USD",
          fromTimestamp: "1700000000000",
          untilTimestamp: "1700003600000",
          maxSize: "2",
          order: "desc",
        },
      });
    } finally {
      fs.unlinkSync(storePath);
    }

    const cases = [
      ["feed/loadMarkets", ["binance", "--json"], "/api/feeds/binance/loadMarkets"],
      ["feed/fetchTickers", ["binance", "--symbols", "BTC/USDT,ETH/USDT", "--json"], "/api/feeds/binance/fetchTickers", { symbols: "BTC/USDT,ETH/USDT" }],
      ["feed/fetchOrderBook", ["binance", "BTC/USDT", "--limit", "5", "--json"], "/api/feeds/binance/fetchOrderBook", { symbol: "BTC/USDT", limit: "5" }],
      ["feed/fetchOHLCV", ["binance", "BTC/USDT", "--timeframe", "1m", "--since", "1700000000000", "--limit", "3", "--json"], "/api/feeds/binance/fetchOHLCV", { symbol: "BTC/USDT", timeframe: "1m", since: "1700000000000", limit: "3" }],
      ["feed/fetchOracleRound", ["chainlink", "BTC/USD", "--json"], "/api/feeds/chainlink/fetchOracleRound", { feed: "BTC/USD" }],
      ["feed/fetchOracleHistory", ["chainlink", "BTC/USD", "--limit", "4", "--json"], "/api/feeds/chainlink/fetchOracleHistory", { feed: "BTC/USD", limit: "4" }],
    ];

    for (const [commandPath, argv, pathname, query] of cases) {
      calls.length = 0;
      await withEnv({}, async () => {
        await run(commandPath, [
          ...argv,
          "--base-url", "https://flag.pmxt.test",
        ]);
      });
      assertCall(lastCall(), {
        origin: "https://flag.pmxt.test",
        pathname,
        query,
      });
    }

    console.log("feed CLI verification passed");
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
