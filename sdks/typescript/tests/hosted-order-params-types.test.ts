import type { Polymarket } from "../pmxt/client";
import type { CreateOrderParams, MarketOutcome } from "../pmxt/models";

type BuildOrderArgument = Parameters<Polymarket["buildOrder"]>[0];
type CreateOrderArgument = Parameters<Polymarket["createOrder"]>[0];

const yesOutcome = {
  marketId: "market-uuid",
  outcomeId: "outcome-uuid",
  label: "Yes",
  price: 0.55,
} satisfies MarketOutcome;

describe("hosted order parameter types", () => {
  it("allow hosted market-order fields without unsafe casts", () => {
    const params = {
      marketId: "market-uuid",
      outcomeId: "outcome-uuid",
      side: "buy",
      type: "market",
      amount: 5,
      denom: "usdc",
      slippage_pct: 30,
    } satisfies CreateOrderParams;

    expect(params.denom).toBe("usdc");
    expect(params.slippage_pct).toBe(30);
  });

  it("allow documented outcome shorthand without redundant ids", () => {
    const buildParams = {
      outcome: yesOutcome,
      side: "buy",
      type: "limit",
      amount: 10,
      price: 0.55,
    } satisfies BuildOrderArgument;

    const createParams = {
      outcome: yesOutcome,
      side: "buy",
      type: "limit",
      amount: 10,
      price: 0.55,
    } satisfies CreateOrderArgument;

    expect(buildParams.outcome).toBe(yesOutcome);
    expect(createParams.outcome).toBe(yesOutcome);
  });
});
