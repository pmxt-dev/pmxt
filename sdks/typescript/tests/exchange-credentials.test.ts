import { Exchange, ExchangeOptions } from "../pmxt/client";

class TestExchange extends Exchange {
  public exposedCredentials() {
    return this.getCredentials();
  }
}

describe("exchange credentials", () => {
  it("accepts and forwards apiSecret with sidecar credentials", () => {
    const options = {
      apiKey: "api-key",
      apiSecret: "api-secret",
      privateKey: "private-key",
      autoStartServer: false,
    } satisfies ExchangeOptions;

    const exchange = new TestExchange("polymarket", options);

    expect(exchange.exposedCredentials()).toMatchObject({
      apiKey: "api-key",
      apiSecret: "api-secret",
      privateKey: "private-key",
    });
  });
});
