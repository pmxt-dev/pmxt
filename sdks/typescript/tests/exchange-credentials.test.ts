import { Exchange, ExchangeOptions, SuiBets } from "../pmxt/client";

class TestExchange extends Exchange {
  public exposedCredentials() {
    return this.getCredentials();
  }
}

class TestSuiBets extends SuiBets {
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

  it("SuiBets forwards apiBaseUrl as the baseUrl credential", () => {
    const exchange = new TestSuiBets({
      walletAddress: "0x" + "ab".repeat(32),
      apiBaseUrl: "https://suibets.example",
      autoStartServer: false,
    });

    expect(exchange.exposedCredentials()).toMatchObject({
      walletAddress: "0x" + "ab".repeat(32),
      baseUrl: "https://suibets.example",
    });
  });

  it("SuiBets apiBaseUrl alone produces credentials", () => {
    const exchange = new TestSuiBets({
      apiBaseUrl: "https://suibets.example",
      autoStartServer: false,
    });

    expect(exchange.exposedCredentials()).toMatchObject({
      baseUrl: "https://suibets.example",
    });
  });
});
