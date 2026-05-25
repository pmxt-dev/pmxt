#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const cliRoot = path.resolve(__dirname, "..");
const { runVenueMethod } = require(path.join(cliRoot, "cli", "runtime.js"));

const originalFetch = global.fetch;
const originalEnv = {
  PMXT_API_KEY: process.env.PMXT_API_KEY,
  PMXT_BASE_URL: process.env.PMXT_BASE_URL,
  PMXT_AUTH_STORE: process.env.PMXT_AUTH_STORE,
  PMXT_AUTH_STORE_PATH: process.env.PMXT_AUTH_STORE_PATH,
};

delete process.env.PMXT_API_KEY;
delete process.env.PMXT_BASE_URL;
delete process.env.PMXT_AUTH_STORE;
delete process.env.PMXT_AUTH_STORE_PATH;

async function verifyUnauthorizedGuidance() {
  let requestedUrl;
  global.fetch = async () => ({
    ok: false,
    status: 401,
    statusText: "Unauthorized",
    text: async () => JSON.stringify({ error: { message: "Invalid or missing access token" } }),
  });

  await assert.rejects(
    () => runVenueMethod("fetchMarkets", [{ query: "Trump" }], {}),
    (error) => {
      assert.match(error.message, /pmxt auth login --api-key <pmxt_api_key>/);
      assert.match(error.message, /PMXT_API_KEY=<pmxt_api_key>/);
      assert.match(error.message, /--pmxt-api-key <pmxt_api_key>/);
      assert.match(error.message, /pmxt auth status/);
      return true;
    },
  );

  global.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify({ success: true, data: [] }),
    };
  };
  await runVenueMethod("fetchMarkets", [], {});
  assert.equal(
    requestedUrl,
    "https://api.pmxt.dev/api/polymarket/fetchMarkets",
    "CLI venue commands should default to the hosted API",
  );
}

verifyUnauthorizedGuidance()
  .finally(() => {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  })
  .then(() => {
    console.log("runtime error verification passed");
  });
