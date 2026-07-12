import { Polymarket } from "../pmxt/client";
import { ValidationError } from "../pmxt/errors";
import { HOSTED_TRADING_BASE_URL } from "../pmxt/hosted-routing";

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
    const rec = { url, init };
    captured.push(rec);
    return handler(rec);
  });
  (spy as unknown as { captured: CapturedFetch[] }).captured = captured;
  return spy;
}

function captured(spy: jest.SpyInstance): CapturedFetch[] {
  return (spy as unknown as { captured: CapturedFetch[] }).captured;
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makePolymarket(): Polymarket {
  return new Polymarket({
    pmxtApiKey: PMXT_API_KEY,
    walletAddress: WALLET_ADDRESS,
    autoStartServer: false,
  });
}

function parseBody(req: CapturedFetch): Record<string, unknown> {
  return JSON.parse(String(req.init?.body ?? "{}"));
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("hosted escrow helper", () => {
  it("builds approval payloads with wallet context and omitted optional amount", async () => {
    const spy = installFetchSpy(() => jsonResponse({ tx: "0xapproval" }));
    const api = makePolymarket();

    await api.escrow!.approveTx("USDC");

    const reqs = captured(spy);
    expect(reqs).toHaveLength(1);
    expect(reqs[0].url).toBe(`${HOSTED_TRADING_BASE_URL}/v0/escrow/approve`);
    expect(reqs[0].init?.method).toBe("POST");
    expect(parseBody(reqs[0])).toEqual({
      token: "usdc",
      user_address: WALLET_ADDRESS,
    });
  });

  it("builds deposit and withdraw payloads like the Python helper", async () => {
    const spy = installFetchSpy(() => jsonResponse({ tx: "0xescrow" }));
    const api = makePolymarket();

    await api.escrow!.depositTx("12.345678");
    await api.escrow!.withdrawTx("request", "1.25");
    await api.escrow!.withdrawTx("claim");

    const reqs = captured(spy);
    expect(reqs).toHaveLength(3);
    expect(parseBody(reqs[0])).toEqual({
      token: "usdc",
      amount: "12.345678",
      user_address: WALLET_ADDRESS,
    });
    expect(parseBody(reqs[1])).toEqual({
      action: "request",
      token: "usdc",
      amount: "1.25",
      user_address: WALLET_ADDRESS,
    });
    expect(parseBody(reqs[2])).toEqual({
      action: "claim",
      token: "usdc",
      user_address: WALLET_ADDRESS,
    });
  });

  it("validates escrow inputs locally before dispatch", async () => {
    const spy = installFetchSpy(() => jsonResponse({}));
    const api = makePolymarket();

    await expect(api.escrow!.approveTx("bad-token")).rejects.toBeInstanceOf(ValidationError);
    await expect(api.escrow!.approveTx("usdc", -1n)).rejects.toBeInstanceOf(ValidationError);
    await expect(api.escrow!.depositTx("0")).rejects.toBeInstanceOf(ValidationError);
    await expect(api.escrow!.depositTx("1.0000001")).rejects.toBeInstanceOf(ValidationError);
    await expect(api.escrow!.withdrawTx("request")).rejects.toBeInstanceOf(ValidationError);
    await expect(api.escrow!.withdrawTx("claim", "1")).rejects.toBeInstanceOf(ValidationError);
    await expect(api.escrow!.withdrawTx("bad" as any)).rejects.toBeInstanceOf(ValidationError);
    await expect(api.escrow!.withdrawals({ include: " " })).rejects.toBeInstanceOf(ValidationError);
    expect(captured(spy)).toHaveLength(0);
  });
});
