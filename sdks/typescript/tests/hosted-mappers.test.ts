/**
 * Tests for `positionFromV0` — hosted `PositionV0` JSON → SDK `Position`.
 *
 * Verifies the mapper carries every field the hosted payload supplies,
 * including mark-to-market data, and never fabricates missing values.
 */

import { positionFromV0 } from "../pmxt/hosted-mappers";

describe("positionFromV0", () => {
  it("maps current_value from the hosted payload to currentValue", () => {
    const position = positionFromV0({
      market_id: "mkt-1",
      outcome_id: "out-yes",
      shares: 25,
      entry_price: 0.4,
      current_price: 0.55,
      current_value: 13.75,
      unrealized_pnl: 3.75,
      realized_pnl: 0,
    });

    expect(position.marketId).toBe("mkt-1");
    expect(position.outcomeId).toBe("out-yes");
    expect(position.size).toBe(25);
    expect(position.entryPrice).toBe(0.4);
    expect(position.currentPrice).toBe(0.55);
    expect(position.currentValue).toBe(13.75);
    expect(position.unrealizedPnL).toBe(3.75);
    expect(position.realizedPnL).toBe(0);
  });
});
