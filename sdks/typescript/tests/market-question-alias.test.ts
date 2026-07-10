import { readFileSync } from "fs";
import { join } from "path";

function readSdkFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("UnifiedMarket question alias", () => {
  it("declares question on the TypeScript public type", () => {
    const models = readSdkFile("pmxt/models.ts");

    expect(models).toContain("readonly question?: string");
    expect(models).toContain("Matches the Python SDK's `market.question` property");
  });

  it("adds a non-enumerable question alias in Exchange market conversion", () => {
    const client = readSdkFile("pmxt/client.ts");

    expect(client).toContain("Object.defineProperty(market, 'question'");
    expect(client).toContain("get() { return this.title; }");
    expect(client).toContain("enumerable: false");
  });

  it("adds a non-enumerable question alias in Router market conversion", () => {
    const router = readSdkFile("pmxt/router.ts");

    expect(router).toContain("function withQuestionAlias<T extends UnifiedMarket>(market: T): T");
    expect(router).toContain("Object.defineProperty(market, 'question'");
    expect(router).toContain("return withQuestionAlias({");
    expect(router).toContain("const result: MatchResult = {");
    expect(router).toContain("return withQuestionAlias(result);");
    expect(router).toContain("enumerable: false");
  });
});
