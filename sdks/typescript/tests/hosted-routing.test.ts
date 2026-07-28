import { HOSTED_METHOD_ROUTES } from "../pmxt/hosted-routing";

describe("hosted routing table", () => {
  it("routes order book reads through the hosted catalog API", () => {
    expect(HOSTED_METHOD_ROUTES.get("fetchOrderBook")).toMatchObject({
      method: "POST",
      path: "/api/{venue}/fetchOrderBook",
      base: "catalog",
    });
    expect(HOSTED_METHOD_ROUTES.get("fetchOrderBooks")).toMatchObject({
      method: "POST",
      path: "/api/{venue}/fetchOrderBooks",
      base: "catalog",
    });
  });
});
