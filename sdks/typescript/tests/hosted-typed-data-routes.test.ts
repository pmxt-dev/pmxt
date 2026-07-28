import { validateEconomics } from "../pmxt/hosted-typed-data";

const LIMITLESS_ORDER_ROUTES = [
  "limitless_buy",
  "limitless_sell_polygon",
  "limitless_sell_base_pull",
];

describe("hosted typed-data route registry", () => {
  it.each([
    "cancel_limitless_polygon",
    "cancel_limitless_base_pull",
  ])("recognizes %s as a cancel route", (route) => {
    expect(() => validateEconomics({ message: {} } as any, route, {}, {})).not.toThrow();
  });

  it.each(LIMITLESS_ORDER_ROUTES)("validates tokenId economics for %s", (route) => {
    expect(() =>
      validateEconomics(
        { message: { tokenId: "actual-token" } } as any,
        route,
        {},
        { resolved: { token_id: "expected-token" } },
      ),
    ).toThrow(/tokenId expected expected-token got actual-token/);
  });
});
