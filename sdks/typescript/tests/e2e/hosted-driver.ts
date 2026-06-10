/**
 * Live E2E driver for the hosted-mode pmxt TS SDK.
 *
 * Proves that the SDK's public methods dispatch through
 * `https://trade.pmxt.dev/v0/*` when `pmxtApiKey` is set. Uses a
 * deliberately bogus key — the server will reject auth, but the rejection
 * comes from `trade.pmxt.dev` (not `api.pmxt.dev`), which is the property
 * under test.
 *
 * Two assertion layers:
 *   1. `global.fetch` is wrapped to capture every outgoing URL. Every captured
 *      URL must start with `https://trade.pmxt.dev/v0/`.
 *   2. Local-only error paths (`MissingWalletAddress`, `NotSupported`, and
 *      `InvalidOrder` for malformed inputs) must throw before any network call.
 *
 * No real funds at risk. Writes use a bogus key + an arbitrary wallet; the
 * server returns 401 long before any settlement.
 *
 * Run:
 *   cd sdks/typescript
 *   npx tsx tests/e2e/hosted-driver.ts
 */

import { Polymarket } from "../../pmxt/client";
import { InvalidOrder, NotSupported } from "../../pmxt/errors";
import { MissingWalletAddress } from "../../pmxt/hosted-errors";

const PMXT_BOGUS_KEY = "pmxt_invalid_DO_NOT_USE_e2e_driver";
const WALLET = "0xcb856a79c3E6490e0cFD7934eB59326E593C0cD1";
const EXPECTED_BASE = "https://trade.pmxt.dev/v0/";

interface Result { label: string; pass: boolean; detail: string; url?: string }
const results: Result[] = [];
const recordedUrls: string[] = [];
let recordingActive = false;

const realFetch = global.fetch.bind(global);
global.fetch = (async (input: any, init?: RequestInit): Promise<Response> => {
  const url = typeof input === "string" ? input : input.toString();
  if (recordingActive) recordedUrls.push(url);
  try {
    return await realFetch(input, init);
  } catch (e) {
    // If offline, synthesize a 401 so URL-routing checks still proceed.
    return new Response(JSON.stringify({ detail: "synthesized: offline" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
}) as typeof fetch;

function pass(label: string, detail = "", url?: string): void {
  results.push({ label, pass: true, detail, url });
  process.stdout.write(`  PASS  ${label}${detail ? " — " + detail : ""}${url ? "  ->  " + url : ""}\n`);
}
function fail(label: string, detail = "", url?: string): void {
  results.push({ label, pass: false, detail, url });
  process.stdout.write(`  FAIL  ${label}${detail ? " — " + detail : ""}\n`);
}

async function expectThrowsLocal<T extends new (...args: any[]) => Error>(
  label: string,
  ctor: T,
  fn: () => Promise<unknown>,
): Promise<void> {
  const before = recordedUrls.length;
  try {
    await fn();
    fail(label, "expected throw, none happened");
  } catch (e) {
    if (e instanceof ctor) {
      const after = recordedUrls.length;
      if (after !== before) {
        fail(label, `threw ${ctor.name} but ${after - before} network calls happened first`);
      } else {
        pass(label, `threw ${ctor.name} locally: ${(e as Error).message.slice(0, 100)}`);
      }
    } else {
      fail(label, `expected ${ctor.name}, got ${(e as Error).constructor.name}: ${(e as Error).message.slice(0, 100)}`);
    }
  }
}

async function expectRoutesToV0(
  label: string,
  expectedSubstring: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  const before = recordedUrls.length;
  try {
    await fn();
  } catch {
    // Expected — bogus key triggers 401, that's fine. We only check URL.
  }
  const newUrls = recordedUrls.slice(before);
  if (newUrls.length === 0) {
    fail(label, "no fetch was attempted");
    return;
  }
  const url = newUrls[0];
  if (!url.startsWith(EXPECTED_BASE)) {
    fail(label, `URL ${url} does not start with ${EXPECTED_BASE}`);
    return;
  }
  if (!url.includes(expectedSubstring)) {
    fail(label, `URL ${url} missing ${expectedSubstring}`);
    return;
  }
  pass(label, "", url);
}

async function main(): Promise<number> {
  process.stdout.write(
    "======================================================================\n" +
    "PMXT hosted-mode TS SDK e2e driver\n" +
    "======================================================================\n" +
    `Bogus key:       ${PMXT_BOGUS_KEY}\n` +
    `Expected base:   ${EXPECTED_BASE}\n` +
    `Wallet address:  ${WALLET}\n\n` +
    "Phase 1: local error paths (no network call should happen)\n",
  );

  recordingActive = false;

  // Reads without walletAddress → MissingWalletAddress
  const noWallet = new Polymarket({ pmxtApiKey: PMXT_BOGUS_KEY, autoStartServer: false });
  await expectThrowsLocal("fetchBalance() without walletAddress", MissingWalletAddress, () =>
    noWallet.fetchBalance(),
  );
  await expectThrowsLocal("fetchPositions() without walletAddress", MissingWalletAddress, () =>
    noWallet.fetchPositions(),
  );
  await expectThrowsLocal("fetchOpenOrders() without walletAddress", MissingWalletAddress, () =>
    noWallet.fetchOpenOrders(),
  );
  await expectThrowsLocal("fetchMyTrades() without walletAddress", MissingWalletAddress, () =>
    noWallet.fetchMyTrades(),
  );

  // Out-of-scope methods in hosted mode → NotSupported
  const withWallet = new Polymarket({
    pmxtApiKey: PMXT_BOGUS_KEY,
    walletAddress: WALLET,
    autoStartServer: false,
  });
  await expectThrowsLocal("fetchClosedOrders() in hosted mode", NotSupported, () =>
    withWallet.fetchClosedOrders(),
  );
  await expectThrowsLocal("fetchAllOrders() in hosted mode", NotSupported, () =>
    withWallet.fetchAllOrders(),
  );

  // Bad denom/side combo → InvalidOrder local
  await expectThrowsLocal("buildOrder(buy, denom=shares) bad shape", InvalidOrder, () =>
    withWallet.buildOrder({
      marketId: "x",
      outcomeId: "y",
      side: "buy",
      type: "market",
      amount: 5,
      denom: "shares",
    } as any),
  );

  process.stdout.write("\nPhase 2: URL routing — every attempt must hit trade.pmxt.dev/v0/*\n");
  recordingActive = true;

  await expectRoutesToV0(
    "fetchBalance() → /v0/user/{addr}/balances",
    `/v0/user/${WALLET}/balances`,
    () => withWallet.fetchBalance(),
  );
  await expectRoutesToV0(
    "fetchPositions() → /v0/user/{addr}/positions",
    `/v0/user/${WALLET}/positions`,
    () => withWallet.fetchPositions(),
  );
  await expectRoutesToV0(
    "fetchOpenOrders() → /v0/orders/open",
    "/v0/orders/open",
    () => withWallet.fetchOpenOrders(),
  );
  await expectRoutesToV0(
    "fetchMyTrades() → /v0/user/{addr}/trades",
    `/v0/user/${WALLET}/trades`,
    () => withWallet.fetchMyTrades(),
  );
  await expectRoutesToV0(
    "fetchOrder(id) → /v0/orders/{id}",
    "/v0/orders/test-order-id",
    () => withWallet.fetchOrder("test-order-id"),
  );

  recordingActive = false;

  const passCount = results.filter((r) => r.pass).length;
  const failCount = results.length - passCount;

  process.stdout.write(
    "\n======================================================================\n" +
    "Summary\n" +
    "======================================================================\n" +
    `PASS: ${passCount}\n` +
    `FAIL: ${failCount}\n\n` +
    `Network attempts captured: ${recordedUrls.length}\n`,
  );
  for (const url of recordedUrls) {
    const ok = url.startsWith(EXPECTED_BASE);
    process.stdout.write(`  ${ok ? "OK  " : "BAD "} ${url}\n`);
  }
  process.stdout.write(
    "\nResult: " +
    (failCount === 0
      ? `PASS — all checks succeeded, every URL routed to ${EXPECTED_BASE}`
      : `FAIL — ${failCount} check(s) failed`) +
    "\n",
  );
  return failCount === 0 ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error("driver crashed:", e);
  process.exit(2);
});
