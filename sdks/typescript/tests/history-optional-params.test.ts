import { Polymarket } from "../pmxt/client";
import { LOCAL_URL } from "../pmxt/constants";

function makePolymarket(): Polymarket {
  return new Polymarket({ autoStartServer: false, baseUrl: LOCAL_URL });
}

describe("optional history params", () => {
  it("fetchOHLCV accepts only an outcome ID", async () => {
    const api = makePolymarket();
    const read = jest
      .spyOn(api as any, "sidecarReadRequest")
      .mockResolvedValue({ success: true, data: [] });

    await expect(api.fetchOHLCV("outcome-1")).resolves.toEqual([]);
    expect(read).toHaveBeenCalledWith(
      "fetchOHLCV",
      { outcomeId: "outcome-1" },
      ["outcome-1", {}],
    );
  });

  it("fetchTrades accepts only an outcome ID", async () => {
    const api = makePolymarket();
    const read = jest
      .spyOn(api as any, "sidecarReadRequest")
      .mockResolvedValue({ success: true, data: [] });

    await expect(api.fetchTrades("outcome-1")).resolves.toEqual([]);
    expect(read).toHaveBeenCalledWith(
      "fetchTrades",
      { outcomeId: "outcome-1" },
      ["outcome-1", {}],
    );
  });
});
