import { Polymarket } from "../pmxt/client";

function makeClientWithWs(capturedArgs: unknown[][]): Polymarket {
  const client = new Polymarket({ autoStartServer: false }) as any;
  client.getOrCreateWs = async () => ({
    subscribeBatch: async (_exchange: unknown, _method: unknown, args: unknown[]) => {
      capturedArgs.push(args as unknown[]);
      return { "outcome-1": { bids: [], asks: [] } };
    },
  });
  return client;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("watchOrderBooks deprecated ids compatibility", () => {
  it("accepts an ids object as a backwards-compatible alias", async () => {
    const capturedArgs: unknown[][] = [];
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = makeClientWithWs(capturedArgs);

    await client.watchOrderBooks({ ids: ["outcome-1"] });

    expect(warn).toHaveBeenCalledWith("Parameter 'ids' is deprecated, use 'outcomeIds' instead.");
    expect(capturedArgs[0]).toEqual([["outcome-1"]]);
  });

  it("accepts params.ids when outcomeIds is omitted and strips it from sidecar params", async () => {
    const capturedArgs: unknown[][] = [];
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = makeClientWithWs(capturedArgs);

    await client.watchOrderBooks(undefined, undefined, { ids: ["outcome-1"], foo: "bar" });

    expect(warn).toHaveBeenCalledWith("Parameter 'ids' is deprecated, use 'outcomeIds' instead.");
    expect(capturedArgs[0]).toEqual([["outcome-1"], undefined, { foo: "bar" }]);
  });
});
