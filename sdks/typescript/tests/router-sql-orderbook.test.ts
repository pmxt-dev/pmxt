import { Router } from "../pmxt/router";
import type { MatchedMarketPair } from "../pmxt/models";

const PMXT_API_KEY = "test_pmxt_key_xxx";
const BASE_URL = "https://api.example.test";

interface CapturedFetch {
  url: string;
  init?: RequestInit;
}

function installFetchSpy(handler: (req: CapturedFetch) => Response): {
  spy: jest.SpyInstance;
  captured: CapturedFetch[];
} {
  const captured: CapturedFetch[] = [];
  const spy = jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : (input as URL | Request).toString();
    const rec = { url, init };
    captured.push(rec);
    return handler(rec);
  });
  return { spy, captured };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeRouter(): Router {
  return new Router({ pmxtApiKey: PMXT_API_KEY, baseUrl: BASE_URL, autoStartServer: false });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Router.sql", () => {
  it("POSTs { query } to /v0/sql with auth headers and parses the result", async () => {
    const { spy, captured } = installFetchSpy(() =>
      jsonResponse({
        data: [{ n: 1 }, { n: 2 }],
        meta: {
          columns: [{ name: "n", type: "UInt64" }],
          rows: 2,
          statistics: { elapsed: 0.01 },
        },
      }),
    );

    const router = makeRouter();
    const result = await router.sql("SELECT n FROM t");

    expect(spy).toHaveBeenCalledTimes(1);
    expect(captured[0].url).toBe(`${BASE_URL}/v0/sql`);
    expect(captured[0].init?.method).toBe("POST");
    expect(JSON.parse(captured[0].init?.body as string)).toEqual({ query: "SELECT n FROM t" });
    const headers = captured[0].init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    // Auth header present (api key wired through getAuthHeaders).
    expect(JSON.stringify(headers).toLowerCase()).toContain("pmxt");

    expect(result.data).toEqual([{ n: 1 }, { n: 2 }]);
    expect(result.meta.columns).toEqual([{ name: "n", type: "UInt64" }]);
    expect(result.meta.rows).toBe(2);
    expect(result.meta.statistics).toEqual({ elapsed: 0.01 });
  });

  it("defaults missing meta fields", async () => {
    installFetchSpy(() => jsonResponse({ data: [] }));
    const router = makeRouter();
    const result = await router.sql("SELECT 1");
    expect(result.data).toEqual([]);
    expect(result.meta).toEqual({ columns: [], rows: 0, statistics: {} });
  });

  it("throws on a non-ok response", async () => {
    installFetchSpy(() => jsonResponse({ error: "query_error", message: "bad" }, 400));
    const router = makeRouter();
    await expect(router.sql("DROP TABLE t")).rejects.toThrow("bad");
  });
});

describe("Router.fetchOrderBook", () => {
  it("calls the router order-book surface and returns a single merged book", async () => {
    const book = {
      bids: [{ price: 0.4, size: 100 }],
      asks: [{ price: 0.6, size: 50 }],
      timestamp: 123,
    };
    const { captured } = installFetchSpy(() => jsonResponse({ success: true, data: book }));

    const router = makeRouter();
    const result = await router.fetchOrderBook("outcome-123");

    expect(captured[0].url).toBe(`${BASE_URL}/api/router/fetchOrderBook`);
    expect(captured[0].init?.method).toBe("POST");
    expect(JSON.parse(captured[0].init?.body as string).args).toEqual(["outcome-123"]);
    expect(Array.isArray(result)).toBe(false);
    expect(result.bids[0].price).toBe(0.4);
    expect(result.asks[0].price).toBe(0.6);
  });
});

describe("Router matched-market pair methods", () => {
  const pairPayload = {
    marketA: {
      marketId: "market-a",
      title: "Market A",
      outcomes: [],
      volume24h: 10,
      liquidity: 20,
      url: "https://example.test/a",
      sourceExchange: "venue-a",
    },
    marketB: {
      marketId: "market-b",
      title: "Market B",
      outcomes: [],
      volume24h: 30,
      liquidity: 40,
      url: "https://example.test/b",
      sourceExchange: "venue-b",
    },
    priceDifference: 0.12,
    venueA: "venue-a",
    venueB: "venue-b",
    priceA: 0.44,
    priceB: 0.56,
    relation: "identity",
    confidence: 0.97,
    reasoning: "same resolution condition",
  };

  it("uses the typed Router override and converts nested markets", async () => {
    const { captured } = installFetchSpy(() =>
      jsonResponse({ success: true, data: [pairPayload] }),
    );
    const router = makeRouter();

    const result: MatchedMarketPair[] = await router.fetchMatchedMarkets({
      minDifference: 0.1,
      relations: ["identity"],
    });

    expect(Object.prototype.hasOwnProperty.call(Router.prototype, "fetchMatchedMarkets")).toBe(true);
    expect(captured[0].url).toBe(`${BASE_URL}/api/router/fetchMatchedMarkets`);
    expect(JSON.parse(captured[0].init?.body as string).args).toEqual([
      { minDifference: 0.1, relations: ["identity"] },
    ]);
    expect(result[0].marketA.marketId).toBe("market-a");
    expect(result[0].marketB.sourceExchange).toBe("venue-b");
    expect(result[0].priceDifference).toBe(0.12);
  });

  it("keeps fetchMatchedPrices as a typed alias", async () => {
    const { captured } = installFetchSpy(() =>
      jsonResponse({ success: true, data: [pairPayload] }),
    );
    const router = makeRouter();

    const result: MatchedMarketPair[] = await router.fetchMatchedPrices({ limit: 2 });

    expect(Object.prototype.hasOwnProperty.call(Router.prototype, "fetchMatchedPrices")).toBe(true);
    expect(captured[0].url).toBe(`${BASE_URL}/api/router/fetchMatchedMarkets`);
    expect(result[0].venueA).toBe("venue-a");
  });
});
