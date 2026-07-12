/**
 * Tests for `raiseFromResponse` — upstream HTTP error → SDK error subclass.
 *
 * Each test simulates a `Response` returned by `fetch` for a hosted-mode call
 * and verifies the raised error is the right `HostedTradingError` subclass.
 * Also verifies the `isHostedError()` helper recognises every hosted error.
 */

import {
  HostedTradingError,
  InvalidApiKey,
  InsufficientEscrowBalance,
  OrderSizeTooSmall,
  OutcomeNotFound,
  CatalogUnavailable,
  BuiltOrderExpired,
  InvalidSignature,
  NoLiquidity,
  MissingWalletAddress,
  isHostedError,
  raiseFromResponse,
} from "../pmxt/hosted-errors";

function makeResponse(status: number, body: unknown): Response {
  const isJson = typeof body === "object";
  return new Response(
    isJson ? JSON.stringify(body) : String(body),
    {
      status,
      headers: isJson ? { "Content-Type": "application/json" } : {},
    },
  );
}

async function expectRaises<T extends new (...args: any[]) => Error>(
  ctor: T,
  fn: () => Promise<unknown>,
): Promise<InstanceType<T>> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof ctor) return e as InstanceType<T>;
    throw new Error(`expected ${ctor.name}, got ${(e as Error).constructor.name}: ${(e as Error).message}`);
  }
  throw new Error(`expected ${ctor.name} but no error was thrown`);
}

describe("raiseFromResponse status mapping", () => {
  it("401 → InvalidApiKey", async () => {
    const r = makeResponse(401, { detail: "invalid api key" });
    const err = await expectRaises(InvalidApiKey, () => raiseFromResponse(r));
    expect(err.detail).toContain("invalid api key");
  });

  it("422 with 'below the minimum' → OrderSizeTooSmall", async () => {
    const r = makeResponse(422, { detail: "amount below the minimum allowed" });
    await expectRaises(OrderSizeTooSmall, () => raiseFromResponse(r));
  });

  it("422 with 'Invalid signature' → InvalidSignature", async () => {
    const r = makeResponse(422, { detail: "Invalid signature recovered" });
    await expectRaises(InvalidSignature, () => raiseFromResponse(r));
  });

  it("403 'Insufficient escrow balance' → InsufficientEscrowBalance", async () => {
    const r = makeResponse(403, { detail: "Insufficient escrow balance for trade" });
    await expectRaises(InsufficientEscrowBalance, () => raiseFromResponse(r));
  });

  it("404 'catalog: no outcome' → OutcomeNotFound", async () => {
    const r = makeResponse(404, { detail: "catalog: no outcome with that id" });
    await expectRaises(OutcomeNotFound, () => raiseFromResponse(r));
  });

  it("503 'catalog:' prefix → CatalogUnavailable", async () => {
    const r = makeResponse(503, { detail: "catalog: temporarily unavailable" });
    await expectRaises(CatalogUnavailable, () => raiseFromResponse(r));
  });

  it("410 'built_order_id expired' → BuiltOrderExpired", async () => {
    const r = makeResponse(410, { detail: "built_order_id expired" });
    await expectRaises(BuiltOrderExpired, () => raiseFromResponse(r));
  });

  it("410 'cancel_id expired' → BuiltOrderExpired", async () => {
    const r = makeResponse(410, { detail: "cancel_id expired" });
    await expectRaises(BuiltOrderExpired, () => raiseFromResponse(r));
  });

  it("422 'book has no resting asks' → NoLiquidity", async () => {
    const r = makeResponse(422, { detail: "book has no resting asks" });
    await expectRaises(NoLiquidity, () => raiseFromResponse(r));
  });

  it("500 with unrecognised detail → HostedTradingError fallback", async () => {
    const r = makeResponse(500, { detail: "internal server error" });
    const err = await expectRaises(HostedTradingError, () => raiseFromResponse(r));
    expect(err.status).toBe(500);
  });
});

describe("isHostedError flag", () => {
  it.each([
    ["HostedTradingError", new HostedTradingError(500, "x")],
    ["InvalidApiKey", new InvalidApiKey(401, "x")],
    ["InsufficientEscrowBalance", new InsufficientEscrowBalance(403, "x")],
    ["OrderSizeTooSmall", new OrderSizeTooSmall(422, "x")],
    ["OutcomeNotFound", new OutcomeNotFound(404, "x")],
    ["CatalogUnavailable", new CatalogUnavailable(503, "x")],
    ["BuiltOrderExpired", new BuiltOrderExpired(410, "x")],
    ["InvalidSignature", new InvalidSignature(422, "x")],
    ["NoLiquidity", new NoLiquidity(422, "x")],
  ])("%s carries isHostedError=true", (_label, err) => {
    expect(isHostedError(err)).toBe(true);
  });

  it.each([
    ["HostedTradingError", new HostedTradingError(500, "x")],
    ["InvalidApiKey", new InvalidApiKey(401, "x")],
    ["InsufficientEscrowBalance", new InsufficientEscrowBalance(403, "x")],
    ["OrderSizeTooSmall", new OrderSizeTooSmall(422, "x")],
    ["OutcomeNotFound", new OutcomeNotFound(404, "x")],
    ["CatalogUnavailable", new CatalogUnavailable(503, "x")],
    ["BuiltOrderExpired", new BuiltOrderExpired(410, "x")],
    ["InvalidSignature", new InvalidSignature(422, "x")],
    ["NoLiquidity", new NoLiquidity(422, "x")],
  ])("%s is catchable as HostedTradingError", (_label, err) => {
    expect(err).toBeInstanceOf(HostedTradingError);
  });

  it("MissingWalletAddress is NOT a hosted error (local-only)", () => {
    expect(isHostedError(new MissingWalletAddress("x"))).toBe(false);
  });

  it("plain Error is not a hosted error", () => {
    expect(isHostedError(new Error("x"))).toBe(false);
  });
});
