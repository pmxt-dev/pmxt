import { Router } from "../pmxt/router";
import { MarketList } from "../pmxt/models";

const PMXT_API_KEY = "test_pmxt_key_xxx";
const BASE_URL = "https://api.example.test";

function installFetchSpy(handler: () => Response): void {
  jest.spyOn(global, "fetch").mockImplementation(async () => handler());
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

const RAW_EVENT = {
  id: "evt-1",
  title: "US Election",
  slug: "us-election",
  markets: [
    {
      marketId: "mkt-1",
      title: "Trump wins",
      slug: "trump-wins",
    },
  ],
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe("Router event markets are MarketList", () => {
  it("fetchEventMatches returns MarketList for both markets surfaces so .match() works", async () => {
    installFetchSpy(() =>
      jsonResponse({
        success: true,
        data: [
          {
            event: RAW_EVENT,
            marketMatches: [],
          },
        ],
      }),
    );

    const router = makeRouter();
    const results = await router.fetchEventMatches({ query: "election" });

    expect(results).toHaveLength(1);
    // UnifiedEvent.markets is declared as MarketList; callers rely on .match().
    expect(results[0].markets).toBeInstanceOf(MarketList);
    expect(results[0].event.markets).toBeInstanceOf(MarketList);
    const matched = results[0].markets.match("Trump");
    expect(matched.marketId).toBe("mkt-1");
  });

  it("fetchMatchedEventClusters returns MarketList for clustered events", async () => {
    installFetchSpy(() =>
      jsonResponse([
        {
          clusterId: "c1",
          events: [RAW_EVENT],
        },
      ]),
    );

    const router = makeRouter();
    const clusters = await router.fetchMatchedEventClusters({ query: "election" });

    expect(clusters).toHaveLength(1);
    expect(clusters[0].events[0].markets).toBeInstanceOf(MarketList);
    const matched = clusters[0].events[0].markets.match("Trump");
    expect(matched.marketId).toBe("mkt-1");
  });
});
