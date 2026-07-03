import { Polymarket, Probable } from "../pmxt/client";

interface CapturedFetch {
  url: string;
  init?: RequestInit;
}

function installFetchSpy(handler: (req: CapturedFetch) => Response): jest.SpyInstance {
  const captured: CapturedFetch[] = [];
  const spy = jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : (input as URL | Request).toString();
    const rec: CapturedFetch = { url, init };
    captured.push(rec);
    return handler(rec);
  });
  (spy as unknown as { captured: CapturedFetch[] }).captured = captured;
  return spy;
}

function captured(spy: jest.SpyInstance): CapturedFetch[] {
  return (spy as unknown as { captured: CapturedFetch[] }).captured;
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("event-specific SDK methods", () => {
  it("preWarmMarket dispatches the documented sidecar method", async () => {
    const spy = installFetchSpy(() => jsonResponse({ success: true, data: null }));
    const api = new Polymarket({ baseUrl: "http://sidecar.test", autoStartServer: false });

    await api.preWarmMarket("12345");

    const reqs = captured(spy);
    expect(reqs).toHaveLength(1);
    expect(reqs[0].url).toBe("http://sidecar.test/api/polymarket/preWarmMarket");
    expect(reqs[0].init?.method).toBe("POST");
    expect(JSON.parse(reqs[0].init?.body as string)).toEqual({
      args: ["12345"],
    });
  });

  it("getEventById returns null without conversion when sidecar returns null", async () => {
    installFetchSpy(() => jsonResponse({ success: true, data: null }));
    const api = new Probable({ baseUrl: "http://sidecar.test", autoStartServer: false });

    await expect(api.getEventById("180")).resolves.toBeNull();
  });

  it("getEventBySlug converts returned event markets", async () => {
    const spy = installFetchSpy(() => jsonResponse({
      success: true,
      data: {
        id: "180",
        title: "Example event",
        markets: [
          { id: "m1", title: "Will it happen?", outcomes: [] },
        ],
      },
    }));
    const api = new Probable({ baseUrl: "http://sidecar.test", autoStartServer: false });

    const event = await api.getEventBySlug("example-event");

    expect(event?.title).toBe("Example event");
    expect(event?.markets).toHaveLength(1);
    expect(captured(spy)[0].url).toBe("http://sidecar.test/api/probable/getEventBySlug");
    expect(JSON.parse(captured(spy)[0].init?.body as string).args).toEqual(["example-event"]);
  });
});
