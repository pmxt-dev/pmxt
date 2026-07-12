import { _tradingRequest } from "../pmxt/hosted-routing";
import { HostedTradingError } from "../pmxt/hosted-errors";

const client = { pmxtApiKey: "test_pmxt_key", exchangeName: "polymarket" };

afterEach(() => {
  jest.restoreAllMocks();
});

function installFetchResponse(payload: unknown, status = 200): jest.SpyInstance {
  return jest.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("_tradingRequest embedded error envelopes", () => {
  it("raises a hosted error for 2xx responses with success=false", async () => {
    installFetchResponse({ success: false, error: "upstream rejected order" }, 200);

    try {
      await _tradingRequest(client, { method: "GET", path: "/v0/user/me/balances" });
    } catch (err) {
      expect(err).toBeInstanceOf(HostedTradingError);
      expect((err as HostedTradingError).status).toBe(200);
      expect((err as HostedTradingError).detail).toBe("upstream rejected order");
      return;
    }

    throw new Error("expected _tradingRequest to raise HostedTradingError");
  });
});
