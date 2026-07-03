/**
 * Dispatch wiring tests for the hosted-mode public client surface.
 *
 * These tests verify that constructing `new Polymarket({ pmxtApiKey, ... })`
 * routes each public SDK method through `trade.pmxt.dev/v0/*`. They mock
 * `global.fetch` so the SDK's real request construction code path is
 * exercised end-to-end without any network call.
 *
 * Signing validators (typed_data schema, economic match, signature recovery)
 * are bypassed via `jest.mock` because they are covered exhaustively
 * elsewhere. The point of this file is to prove the
 * public-method → hosted-helper → URL plumbing.
 */

// Bypass the signing validators so write-method tests can focus on URL routing.
jest.mock("../pmxt/hosted-typed-data", () => ({
  validateTypedData: () => undefined,
  validateEconomics: () => undefined,
  verifySignature: (_td: unknown, sig: string) => sig,
}));

import { Polymarket } from "../pmxt/client";
import {
  HOSTED_TRADING_BASE_URL,
} from "../pmxt/hosted-routing";
import { NotSupported } from "../pmxt/errors";
import { MissingWalletAddress } from "../pmxt/hosted-errors";

const PMXT_API_KEY = "test_pmxt_key_xxx";
const WALLET_ADDRESS = "0x000000000000000000000000000000000000aBc1";

interface CapturedFetch {
  url: string;
  init?: RequestInit;
}

function installFetchSpy(handler: (req: CapturedFetch) => Response): jest.SpyInstance {
  const captured: CapturedFetch[] = [];
  const spy = jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : (input as URL | Request).toString();
    const rec: CapturedFetch = { url, init };
    captured.push(rec);
    return handler(rec);
  });
  // Stash captured array on the spy for assertions.
  (spy as unknown as { captured: CapturedFetch[] }).captured = captured;
  return spy;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makePolymarket(opts: { withWallet?: boolean; withSigner?: boolean } = {}): Polymarket {
  const { withWallet = true, withSigner = false } = opts;
  const options: Record<string, unknown> = {
    pmxtApiKey: PMXT_API_KEY,
    autoStartServer: false,
  };
  if (withWallet) options.walletAddress = WALLET_ADDRESS;
  if (withSigner) {
    // Mock signer satisfying the Signer interface — bytes will not pass real
    // recovery but the validator is mocked above.
    options.signer = {
      address: WALLET_ADDRESS,
      signTypedData: async () => "0x" + "ab".repeat(65),
    };
  }
  return new Polymarket(options);
}

function captured(spy: jest.SpyInstance): CapturedFetch[] {
  return (spy as unknown as { captured: CapturedFetch[] }).captured;
}

afterEach(() => {
  jest.restoreAllMocks();
});

// --------------------------------------------------------------------------
// Read-method dispatch
// --------------------------------------------------------------------------

describe("hosted read dispatch", () => {
  it("fetchBalance → GET /v0/user/{addr}/balances", async () => {
    const spy = installFetchSpy(() =>
      jsonResponse({ balances: [{ currency: "USDC", amount: 12.5 }] }),
    );
    const api = makePolymarket();
    const out = await api.fetchBalance();
    const reqs = captured(spy);
    expect(reqs).toHaveLength(1);
    expect(reqs[0].url.startsWith(HOSTED_TRADING_BASE_URL + "/v0/")).toBe(true);
    expect(reqs[0].url).toContain(`/v0/user/${WALLET_ADDRESS}/balances`);
    expect(reqs[0].init?.method).toBe("GET");
    const headers = reqs[0].init?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe(`Bearer ${PMXT_API_KEY}`);
    expect(out.length).toBeGreaterThan(0);
  });

  it("fetchPositions → GET /v0/user/{addr}/positions", async () => {
    const spy = installFetchSpy(() => jsonResponse({ positions: [] }));
    const api = makePolymarket();
    await api.fetchPositions();
    const reqs = captured(spy);
    expect(reqs[0].url).toContain(`/v0/user/${WALLET_ADDRESS}/positions`);
    expect(reqs[0].init?.method).toBe("GET");
  });

  it("fetchOpenOrders → GET /v0/orders/open with address query", async () => {
    const spy = installFetchSpy(() => jsonResponse({ orders: [] }));
    const api = makePolymarket();
    await api.fetchOpenOrders();
    const reqs = captured(spy);
    expect(reqs[0].url).toContain("/v0/orders/open");
    expect(reqs[0].url.toLowerCase()).toContain(WALLET_ADDRESS.toLowerCase());
    expect(reqs[0].init?.method).toBe("GET");
  });

  it("fetchMyTrades → GET /v0/user/{addr}/trades", async () => {
    const spy = installFetchSpy(() => jsonResponse({ trades: [] }));
    const api = makePolymarket();
    await api.fetchMyTrades();
    const reqs = captured(spy);
    expect(reqs[0].url).toContain(`/v0/user/${WALLET_ADDRESS}/trades`);
    expect(reqs[0].init?.method).toBe("GET");
  });

  it("fetchOrder → GET /v0/orders/{id}", async () => {
    const spy = installFetchSpy(() => jsonResponse({ order: { id: "abc", status: "open" } }));
    const api = makePolymarket();
    await api.fetchOrder("abc");
    const reqs = captured(spy);
    expect(reqs[0].url).toContain("/v0/orders/abc");
    expect(reqs[0].init?.method).toBe("GET");
  });
});

// --------------------------------------------------------------------------
// Missing wallet — local raise before any network call
// --------------------------------------------------------------------------

describe("hosted read methods raise MissingWalletAddress locally", () => {
  it.each([
    ["fetchBalance", (api: Polymarket) => api.fetchBalance()],
    ["fetchPositions", (api: Polymarket) => api.fetchPositions()],
    ["fetchOpenOrders", (api: Polymarket) => api.fetchOpenOrders()],
    ["fetchMyTrades", (api: Polymarket) => api.fetchMyTrades()],
  ])("%s raises locally when no walletAddress", async (_label, invoke) => {
    const spy = installFetchSpy(() => jsonResponse({}));
    const api = makePolymarket({ withWallet: false });
    await expect(invoke(api)).rejects.toBeInstanceOf(MissingWalletAddress);
    expect(captured(spy)).toHaveLength(0);
  });
});

// --------------------------------------------------------------------------
// NotSupported dispatch (no network)
// --------------------------------------------------------------------------

describe("hosted NotSupported", () => {
  it("fetchClosedOrders raises NotSupported without touching network", async () => {
    const spy = installFetchSpy(() => jsonResponse({}));
    const api = makePolymarket();
    await expect(api.fetchClosedOrders()).rejects.toBeInstanceOf(NotSupported);
    expect(captured(spy)).toHaveLength(0);
  });

  it("fetchAllOrders raises NotSupported without touching network", async () => {
    const spy = installFetchSpy(() => jsonResponse({}));
    const api = makePolymarket();
    await expect(api.fetchAllOrders()).rejects.toBeInstanceOf(NotSupported);
    expect(captured(spy)).toHaveLength(0);
  });
});

// --------------------------------------------------------------------------
// Write-method dispatch — buildOrder, createOrder, submitOrder, cancelOrder
// --------------------------------------------------------------------------

function buildResponsePayload(side: "buy" | "sell" = "buy"): Record<string, unknown> {
  return {
    built_order_id: "built-xyz",
    side,
    typed_data: {
      primaryType: "Order",
      domain: {
        name: "Polymarket CTF Exchange",
        version: "1",
        chainId: 137,
        verifyingContract: "0x" + "1".repeat(40),
      },
      types: {
        EIP712Domain: [],
        Order: [{ name: "maker", type: "address" }],
      },
      message: { maker: WALLET_ADDRESS },
    },
    quote: {
      best_price: 0.5,
      expected_avg_price: 0.5,
      expected_slippage_pct: 0,
      estimated_cost_or_proceeds: 5,
      fillable: true,
      liquidity: 100,
      fee_amount: 0,
      tick_size: "0.01",
    },
    resolved: {
      venue: "polymarket",
      token_id: "12345",
      neg_risk: false,
      tick_size: 0.01,
    },
  };
}

describe("hosted write dispatch", () => {
  it("buildOrder raises MissingWalletAddress locally when walletAddress is unset", async () => {
    const spy = installFetchSpy(() => jsonResponse(buildResponsePayload("buy")));
    const api = makePolymarket({ withWallet: false, withSigner: true });
    await expect(api.buildOrder({
      marketId: "11111111-1111-4111-8111-111111111111",
      outcomeId: "22222222-2222-4222-8222-222222222222",
      side: "buy",
      type: "market",
      amount: 5,
      denom: "usdc",
    } as any)).rejects.toBeInstanceOf(MissingWalletAddress);
    expect(captured(spy)).toHaveLength(0);
  });

  it("buildOrder → POST /v0/trade/build-order", async () => {
    const spy = installFetchSpy(() => jsonResponse(buildResponsePayload("buy")));
    const api = makePolymarket({ withSigner: true });
    await api.buildOrder({
      marketId: "11111111-1111-4111-8111-111111111111",
      outcomeId: "22222222-2222-4222-8222-222222222222",
      side: "buy",
      type: "market",
      amount: 5,
      denom: "usdc",
    } as any);
    const reqs = captured(spy);
    expect(reqs[0].url).toContain("/v0/trade/build-order");
    expect(reqs[0].init?.method).toBe("POST");
  });

  it("createOrder → POST build then POST submit", async () => {
    let call = 0;
    const spy = installFetchSpy(() => {
      call += 1;
      if (call === 1) return jsonResponse(buildResponsePayload("buy"));
      // submit returns an Order shape
      return jsonResponse({
        id: "order-1",
        status: "filled",
        filled: 5,
        remaining: 0,
        side: "buy",
      });
    });
    const api = makePolymarket({ withSigner: true });
    await api.createOrder({
      marketId: "11111111-1111-4111-8111-111111111111",
      outcomeId: "22222222-2222-4222-8222-222222222222",
      side: "buy",
      type: "market",
      amount: 5,
      denom: "usdc",
    } as any);
    const reqs = captured(spy);
    expect(reqs).toHaveLength(2);
    expect(reqs[0].url).toContain("/v0/trade/build-order");
    expect(reqs[1].url).toContain("/v0/trade/submit-order");
    expect(reqs[0].init?.method).toBe("POST");
    expect(reqs[1].init?.method).toBe("POST");
  });

  it("buildOrder without marketId omits market_id from the wire body", async () => {
    const spy = installFetchSpy(() => jsonResponse(buildResponsePayload("buy")));
    const api = makePolymarket({ withSigner: true });
    await api.buildOrder({
      outcomeId: "22222222-2222-4222-8222-222222222222",
      side: "buy",
      type: "market",
      amount: 5,
      denom: "usdc",
    } as any);
    const reqs = captured(spy);
    expect(reqs).toHaveLength(1);
    const body = JSON.parse((reqs[0].init?.body as string) ?? "{}");
    expect(body.outcome_id).toBe("22222222-2222-4222-8222-222222222222");
    // Critical: the key must be absent (not null, not empty string) so the
    // backend can fall back to deriving market_id from outcome_id.
    expect("market_id" in body).toBe(false);
  });

  it("createOrder without marketId omits market_id from the build body", async () => {
    let call = 0;
    const spy = installFetchSpy(() => {
      call += 1;
      if (call === 1) return jsonResponse(buildResponsePayload("buy"));
      return jsonResponse({
        id: "order-1",
        status: "filled",
        filled: 5,
        remaining: 0,
        side: "buy",
      });
    });
    const api = makePolymarket({ withSigner: true });
    await api.createOrder({
      outcomeId: "22222222-2222-4222-8222-222222222222",
      side: "buy",
      type: "market",
      amount: 5,
      denom: "usdc",
    } as any);
    const reqs = captured(spy);
    expect(reqs).toHaveLength(2);
    const buildBody = JSON.parse((reqs[0].init?.body as string) ?? "{}");
    expect(buildBody.outcome_id).toBe("22222222-2222-4222-8222-222222222222");
    expect("market_id" in buildBody).toBe(false);
  });

  it("buildOrder with both ids still sends market_id (backcompat)", async () => {
    const spy = installFetchSpy(() => jsonResponse(buildResponsePayload("buy")));
    const api = makePolymarket({ withSigner: true });
    await api.buildOrder({
      marketId: "11111111-1111-4111-8111-111111111111",
      outcomeId: "22222222-2222-4222-8222-222222222222",
      side: "buy",
      type: "market",
      amount: 5,
      denom: "usdc",
    } as any);
    const reqs = captured(spy);
    const body = JSON.parse((reqs[0].init?.body as string) ?? "{}");
    expect(body.market_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(body.outcome_id).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("buildOrder with venue-native outcomeId sends (venue, venue_outcome_id)", async () => {
    const spy = installFetchSpy(() => jsonResponse(buildResponsePayload("buy")));
    const api = makePolymarket({ withSigner: true });
    await api.buildOrder({
      outcomeId:
        "0xc704f74e2f9dfae70f770cb253ffadde10768eeab41233098bf5ac67995a94b5",
      side: "buy",
      type: "market",
      amount: 5,
      denom: "usdc",
    } as any);
    const reqs = captured(spy);
    const body = JSON.parse((reqs[0].init?.body as string) ?? "{}");
    expect(body.venue).toBe("polymarket");
    expect(body.venue_outcome_id).toBe(
      "0xc704f74e2f9dfae70f770cb253ffadde10768eeab41233098bf5ac67995a94b5",
    );
    expect("outcome_id" in body).toBe(false);
    expect("market_id" in body).toBe(false);
  });

  it("cancelOrder → POST cancel/build then POST cancel", async () => {
    let call = 0;
    const spy = installFetchSpy(() => {
      call += 1;
      if (call === 1) {
        return jsonResponse({
          cancel_id: "cancel-xyz",
          typed_data: {
            primaryType: "Cancel",
            domain: {
              name: "Polymarket CTF Exchange",
              version: "1",
              chainId: 137,
              verifyingContract: "0x" + "1".repeat(40),
            },
            types: { EIP712Domain: [], Cancel: [{ name: "orderId", type: "string" }] },
            message: { orderId: "abc" },
          },
          deadline: 9999999999,
        });
      }
      return jsonResponse({ id: "abc", status: "cancelled" });
    });
    const api = makePolymarket({ withSigner: true });
    await api.cancelOrder("abc");
    const reqs = captured(spy);
    expect(reqs).toHaveLength(2);
    expect(reqs[0].url).toContain("/v0/orders/cancel/build");
    expect(reqs[1].url).toContain("/v0/orders/cancel");
  });
});
