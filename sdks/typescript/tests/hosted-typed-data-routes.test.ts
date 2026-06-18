import { validateEconomics } from "../pmxt/hosted-typed-data";

describe("hosted typed-data route registry", () => {
  it.each([
    "cancel_limitless_polygon",
    "cancel_limitless_base_pull",
  ])("recognizes %s as a cancel route", (route) => {
    expect(() => validateEconomics({ message: {} } as any, route, {}, {})).not.toThrow();
  });
});
