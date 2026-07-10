import { Polymarket } from "../pmxt/client";
import { ENV, LOCAL_URL } from "../pmxt/constants";

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
  (spy as unknown as { captured: CapturedFetch[] }).captured = captured;
  return spy;
}

function captured(spy: jest.SpyInstance): CapturedFetch[] {
  return (spy as unknown as { captured: CapturedFetch[] }).captured;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makePolymarket(): Polymarket {
  return new Polymarket({ autoStartServer: false, baseUrl: LOCAL_URL });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("sidecar order param forwarding", () => {
  it("does not follow sidecar lock when PMXT_BASE_URL is explicitly set", async () => {
    const previousBaseUrl = process.env[ENV.BASE_URL];
    process.env[ENV.BASE_URL] = LOCAL_URL;
    const spy = installFetchSpy(() =>
      jsonResponse({
        success: true,
        data: [],
      }),
    );

    try {
      const api = new Polymarket({ autoStartServer: false });
      (api as any).serverManager.getRunningPort = () => 4999;

      await api.fetchMarkets({ limit: 1 });

      const reqs = captured(spy);
      expect(reqs).toHaveLength(1);
      expect(reqs[0].url).toBe(`${LOCAL_URL}/api/polymarket/fetchMarkets`);
    } finally {
      if (previousBaseUrl === undefined) delete process.env[ENV.BASE_URL];
      else process.env[ENV.BASE_URL] = previousBaseUrl;
    }
  });

  it("buildOrder forwards tickSize, negRisk, and onBehalfOf", async () => {
    const spy = installFetchSpy(() =>
      jsonResponse({
        success: true,
        data: { id: "built-1" },
      }),
    );
    const api = makePolymarket();

    await api.buildOrder({
      marketId: "market-1",
      outcomeId: "outcome-1",
      side: "buy",
      type: "limit",
      amount: 10,
      price: 0.45,
      tickSize: 0.01,
      negRisk: false,
      onBehalfOf: 123,
    });

    const reqs = captured(spy);
    expect(reqs).toHaveLength(1);
    expect(reqs[0].url).toBe(`${LOCAL_URL}/api/polymarket/buildOrder`);
    const body = JSON.parse((reqs[0].init?.body as string) ?? "{}");
    expect(body.args[0]).toMatchObject({
      tickSize: 0.01,
      negRisk: false,
      onBehalfOf: 123,
    });
  });

  it("createOrder forwards tickSize, negRisk, and onBehalfOf", async () => {
    const spy = installFetchSpy(() =>
      jsonResponse({
        success: true,
        data: { id: "order-1", status: "open" },
      }),
    );
    const api = makePolymarket();

    await api.createOrder({
      marketId: "market-1",
      outcomeId: "outcome-1",
      side: "buy",
      type: "limit",
      amount: 10,
      price: 0.45,
      tickSize: 0.01,
      negRisk: false,
      onBehalfOf: 0,
    });

    const reqs = captured(spy);
    expect(reqs).toHaveLength(1);
    expect(reqs[0].url).toBe(`${LOCAL_URL}/api/polymarket/createOrder`);
    const body = JSON.parse((reqs[0].init?.body as string) ?? "{}");
    expect(body.args[0]).toMatchObject({
      tickSize: 0.01,
      negRisk: false,
      onBehalfOf: 0,
    });
  });
});
