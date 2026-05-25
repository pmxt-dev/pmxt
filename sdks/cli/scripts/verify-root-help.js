#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const cliRoot = path.resolve(__dirname, "..");
const bin = path.join(cliRoot, "bin", "pmxt.js");

function run(args) {
  const result = spawnSync(process.execPath, [bin, ...args], {
    encoding: "utf8",
    env: { ...process.env, PMXT_API_KEY: "", PMXT_BASE_URL: "" },
  });
  assert.equal(result.status, 0, `pmxt ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

for (const args of [[], ["--help"], ["help"]]) {
  const output = run(args);
  assert.match(output, /QUICK START/, "root help should show onboarding first");
  assert.match(output, /pmxt auth login --api-key <pmxt_api_key>/, "root help should show auth setup");
  assert.match(output, /pmxt <exchange> markets/, "root help should show exchange-first usage");
  assert.doesNotMatch(output, /v0-matched-markets/, "root help should hide low-level aliases");
  assert.doesNotMatch(output, /fetch-all-orders/, "root help should hide duplicate fetch aliases");
}

console.log("root help verification passed");
