import type { MarketFilterCriteria, OutcomeType } from "../pmxt/models";

describe("OutcomeType", () => {
  it("is exported for reuse in market filters", () => {
    const outcome: OutcomeType = "yes";
    const criteria: MarketFilterCriteria = {
      price: { outcome },
      priceChange24h: { outcome },
    };

    expect(criteria.price?.outcome).toBe("yes");
    expect(criteria.priceChange24h?.outcome).toBe("yes");
  });
});
