#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const cliRoot = path.resolve(__dirname, "..");
const commandsRoot = path.join(cliRoot, "commands");

const envKeys = ["PMXT_API_KEY", "PMXT_BASE_URL", "PMXT_AUTH_STORE", "PMXT_AUTH_STORE_PATH"];
const calls = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function withEnv(env, fn) {
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  for (const key of envKeys) {
    delete process.env[key];
  }
  Object.assign(process.env, env);
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

global.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  return {
    ok: true,
    statusText: "OK",
    text: async () => JSON.stringify({ success: true, data: [{ id: "matched" }] }),
  };
};

async function main() {
  calls.length = 0;
  await withEnv({}, async () => {
    await run("enterprise/matched-markets", [
      "--base-url", "https://flag.pmxt.test",
      "--pmxt-api-key", "flag-key",
      "--json",
      "--query", "bitcoin",
      "--relations", "identity,overlap",
      "--min-difference", "0.05",
      "--category", "Crypto",
      "--limit", "25",
      "--min-confidence", "0.7",
      "--include-prices",
    ]);
  });
  {
    const call = lastCall();
    const url = new URL(call.url);
    assert(call.init.method === "GET", "matched-markets should use GET");
    assert(url.origin === "https://flag.pmxt.test", `unexpected base URL ${url.origin}`);
    assert(url.pathname === "/v0/matched-markets", `unexpected path ${url.pathname}`);
    assert(call.init.headers.Authorization === "Bearer flag-key", "expected one-shot PMXT API key header");
    assertQuery(call.url, {
      query: "bitcoin",
      relations: "identity,overlap",
      minDifference: "0.05",
      category: "Crypto",
      limit: "25",
      minConfidence: "0.7",
      includePrices: "true",
    });
  }

  calls.length = 0;
  await withEnv({ PMXT_API_KEY: "env-key", PMXT_BASE_URL: "https://env.pmxt.test" }, async () => {
    await run("enterprise/matched-prices", [
      "--json",
      "--params-json", JSON.stringify({
        relations: "subset",
        minDifference: 0.1,
        category: "Politics",
        limit: 3,
        minConfidence: 0.6,
        includePrices: true,
      }),
    ]);
  });
  {
    const call = lastCall();
    const url = new URL(call.url);
    assert(call.init.method === "GET", "matched-prices should use GET");
    assert(url.origin === "https://env.pmxt.test", `unexpected env base URL ${url.origin}`);
    assert(url.pathname === "/v0/matched-prices", `unexpected path ${url.pathname}`);
    assert(call.init.headers.Authorization === "Bearer env-key", "expected env PMXT API key header");
    assertQuery(call.url, {
      relations: "subset",
      minDifference: "0.1",
      category: "Politics",
      limit: "3",
      minConfidence: "0.6",
      includePrices: "true",
    });
  }

  const storePath = path.join(os.tmpdir(), `pmxt-enterprise-cli-${process.pid}.json`);
  fs.writeFileSync(storePath, JSON.stringify({ pmxtApiKey: "store-key", baseUrl: "https://store.pmxt.test" }));
  try {
    calls.length = 0;
    await withEnv({}, async () => {
      await run("enterprise/matched-prices", [
        "--auth-store", storePath,
        "--relation", "overlap",
        "--limit", "2",
        "--json",
      ]);
    });
    const call = lastCall();
    const url = new URL(call.url);
    assert(url.origin === "https://store.pmxt.test", `unexpected store base URL ${url.origin}`);
    assert(url.pathname === "/v0/matched-prices", `unexpected store path ${url.pathname}`);
    assert(call.init.headers.Authorization === "Bearer store-key", "expected auth-store PMXT API key header");
    assertQuery(call.url, { relations: "overlap", limit: "2" });
  } finally {
    fs.unlinkSync(storePath);
  }

  const deprecatedCommands = [
    "enterprise/fetchMatchedMarkets",
    "enterprise/fetchMatchedPrices",
    "router/fetchMatchedMarkets",
    "router/fetchMatchedPrices",
    "router/fetchArbitrage",
    "router/fetchHedges",
  ];
  for (const commandPath of deprecatedCommands) {
    assert(!fs.existsSync(path.join(commandsRoot, `${commandPath}.js`)), `deprecated command is exposed: ${commandPath}`);
  }

  console.log("enterprise CLI verification passed");
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
