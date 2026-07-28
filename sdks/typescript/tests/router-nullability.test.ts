import { Router } from "../pmxt/router";
import type { MatchResult, PriceComparison } from "../pmxt/models";

const BASE_URL = "https://api.example.test";

type NullableMatchFields = {
  reasoning: string | null;
  bestBid: number | null;
  bestAsk: number | null;
};

type Equal<Left, Right> = (<T>() => T extends Left ? 1 : 2) extends (
  <T>() => T extends Right ? 1 : 2
)
  ? true
  : false;

type Assert<T extends true> = T;

type _MatchResultKeepsFieldsRequiredAndNullable = Assert<
  Equal<Pick<MatchResult, keyof NullableMatchFields>, NullableMatchFields>
>;
type _PriceComparisonKeepsFieldsRequiredAndNullable = Assert<
  Equal<Pick<PriceComparison, keyof NullableMatchFields>, NullableMatchFields>
>;

const rawMarket = {
  marketId: "market-1",
  title: "Will the contract stay nullable?",
  outcomes: [],
};

function makeRouter(): Router {
  return new Router({ baseUrl: BASE_URL, autoStartServer: false });
}

function installResponse(data: unknown): jest.SpyInstance {
  return jest.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function expectNullMatchFields(value: NullableMatchFields): void {
  expect(value).toHaveProperty("reasoning", null);
  expect(value).toHaveProperty("bestBid", null);
  expect(value).toHaveProperty("bestAsk", null);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("router match model nullability", () => {
  it("normalizes missing market match fields to null", async () => {
    installResponse([
      { market: rawMarket, relation: "identity", confidence: 0.9 },
      {
        market: rawMarket,
        relation: "identity",
        confidence: 0.8,
        reasoning: "same outcome",
        bestBid: 0,
        bestAsk: 0,
      },
    ]);

    const [missing, populated] = await makeRouter().fetchMarketMatches({ marketId: "source-market" });

    expectNullMatchFields(missing);
    expect(populated).toMatchObject({ reasoning: "same outcome", bestBid: 0, bestAsk: 0 });
  });

  const priceMethods: Array<[
    string,
    (router: Router) => Promise<PriceComparison[]>,
  ]> = [
    ["compareMarketPrices", (router) => router.compareMarketPrices({ marketId: "source-market" })],
    ["fetchHedges", (router) => router.fetchHedges({ marketId: "source-market" })],
  ];

  it.each(priceMethods)("normalizes missing price fields returned by %s", async (_name, invoke) => {
    installResponse([
      { market: rawMarket, relation: "identity", confidence: 0.9, venue: "test" },
      {
        market: rawMarket,
        relation: "identity",
        confidence: 0.8,
        reasoning: "same outcome",
        bestBid: 0,
        bestAsk: 0,
        venue: "test",
      },
    ]);

    const [missing, populated] = await invoke(makeRouter());

    expectNullMatchFields(missing);
    expect(populated).toMatchObject({ reasoning: "same outcome", bestBid: 0, bestAsk: 0 });
  });
});
