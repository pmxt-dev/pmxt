import { orderFromV0 } from "../pmxt/hosted-mappers";

describe("hosted order mappers", () => {
  it("maps hosted v0 order provenance and fill metadata", () => {
    const order = orderFromV0({
      id: "ord_123",
      market_id: "market_1",
      outcome_id: "outcome_yes",
      side: "buy",
      type: "limit",
      amount: "10",
      status: "filled",
      filled: "9.5",
      filled_shares: "19",
      remaining: "0.5",
      fee: "0.12",
      fee_rate_bps: "100",
      price: "0.5",
      timestamp: "2026-06-17T06:00:00Z",
      tx_hash: "0xabc123",
      chain: "polygon",
      block_number: "12345678",
    });

    expect(order.filledShares).toBe(19);
    expect(order.feeRateBps).toBe(100);
    expect(order.txHash).toBe("0xabc123");
    expect(order.chain).toBe("polygon");
    expect(order.blockNumber).toBe(12345678);
  });
});
