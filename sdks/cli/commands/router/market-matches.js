"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketMatchFlags = void 0;
exports.buildMarketMatchParams = buildMarketMatchParams;
const core_1 = require("@oclif/core");
const base_command_js_1 = require("../../cli/base-command.js");
const params_js_1 = require("../../cli/params.js");
function isInvalidLookupValue(value) {
    return typeof value === "string" && /^(undefined|null)$/i.test(value.trim());
}
function assertValidLookupParams(params) {
    for (const key of ["marketId", "slug", "url"]) {
        if (isInvalidLookupValue(params[key]))
            throw new Error(`--${key === "marketId" ? "market-id" : key} cannot be ${JSON.stringify(params[key])}. Pass a real identifier or omit it for browse mode.`);
    }
}
function compactMarketInput(params) {
    const market = params.market;
    if (!market || typeof market !== "object" || Array.isArray(market))
        return params;
    const next = { ...params };
    if (!next.marketId && !next.slug && !next.url) {
        if (typeof market.slug === "string" && market.slug.length > 0) {
            next.slug = market.slug;
        }
        else if (typeof market.marketId === "string" && market.marketId.length > 0) {
            next.marketId = market.marketId;
        }
        else if (typeof market.id === "string" && market.id.length > 0) {
            next.marketId = market.id;
        }
        else if (typeof market.url === "string" && market.url.length > 0) {
            next.url = market.url;
        }
    }
    delete next.market;
    return next;
}
exports.marketMatchFlags = {
    query: core_1.Flags.string({ description: "Search query." }),
    category: core_1.Flags.string({ description: "Category filter." }),
    "market-id": core_1.Flags.string({ description: "Source market ID." }),
    slug: core_1.Flags.string({ description: "Source market slug." }),
    url: core_1.Flags.string({ description: "Source market URL." }),
    relation: core_1.Flags.option({ options: ["identity", "subset", "superset", "overlap", "disjoint"], description: "Relation filter." })(),
    "min-confidence": (0, base_command_js_1.numberFlag)({ description: "Minimum confidence." }),
    limit: core_1.Flags.integer({ description: "Maximum number of matches." }),
    "include-prices": core_1.Flags.boolean({ description: "Include live prices." }),
    "market-json": core_1.Flags.string({ description: "UnifiedMarket JSON object. Prefix with @ to read a file." }),
    "params-json": core_1.Flags.string({ description: "Additional JSON object params. Prefix with @ to read a file." }),
};
function buildMarketMatchParams(flags) {
    const params = compactMarketInput((0, params_js_1.mergeJsonParams)(flags, "params-json", (0, params_js_1.buildParams)(flags, {
        query: "query", category: "category", "market-id": "marketId", slug: "slug", url: "url",
        relation: "relation", "min-confidence": "minConfidence", limit: "limit", "include-prices": "includePrices",
    }, { market: (0, params_js_1.parseJsonObject)(flags["market-json"], "--market-json") })));
    assertValidLookupParams(params);
    return params;
}
class RouterMarketMatches extends base_command_js_1.PmxtCommand {
    static description = "Find markets on other venues that correspond to a given market.";
    static aliases = ["fetch-market-matches", "market-matches"];
    static flags = { ...base_command_js_1.routerFlags, ...exports.marketMatchFlags };
    async run() {
        const { flags } = await this.parse(RouterMarketMatches);
        const data = await this.runRouter("fetchMarketMatches", (0, params_js_1.argsWithOptionalObject)(buildMarketMatchParams(flags)), flags);
        this.output(data, flags, "matches");
    }
}
exports.default = RouterMarketMatches;
