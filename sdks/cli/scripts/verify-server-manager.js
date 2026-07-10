"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { ServerManager } = require("../cli/server-manager.js");

function okHealthResponse() {
  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function withTempHome(run) {
  const previousHome = process.env.HOME;
  const home = mkdtempSync(join(tmpdir(), "pmxt-cli-server-manager-"));

  process.env.HOME = home;
  try {
    await run();
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    rmSync(home, { recursive: true, force: true });
  }
}

async function testHealthyDefaultPortWithoutLockIsNotRunning() {
  const originalFetch = global.fetch;
  global.fetch = async () => okHealthResponse();

  try {
    await withTempHome(async () => {
      const manager = new ServerManager({ maxRetries: 1, retryDelayMs: 1 });
      const status = await manager.status();

      assert.equal(await manager.isServerRunning(), false);
      assert.equal(await manager.health(), false);
      assert.equal(status.running, false);
      assert.equal(status.pid, null);
      assert.equal(status.port, null);
      assert.equal(status.version, null);
    });
  } finally {
    global.fetch = originalFetch;
  }
}

async function main() {
  await testHealthyDefaultPortWithoutLockIsNotRunning();
  console.log("server manager verification passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
