"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@oclif/core");
const base_command_js_1 = require("../../cli/base-command.js");
const params_js_1 = require("../../cli/params.js");
const RELATION_OPTIONS = ["identity", "subset", "superset", "overlap", "disjoint"];
const matchedFlags = {
    query: core_1.Flags.string({ description: "Keyword search across matched market titles." }),
    relations: core_1.Flags.string({ description: "Comma-separated relation filter. Valid values: identity, subset, superset, overlap, disjoint." }),
    relation: core_1.Flags.option({ options: RELATION_OPTIONS, description: "Single relation filter. Alias for --relations." })(),
    "min-difference": (0, base_command_js_1.numberFlag)({ description: "Minimum price difference to include (0.0-1.0)." }),
    category: core_1.Flags.string({ description: "Filter both sides of the match by category." }),
    limit: core_1.Flags.integer({ description: "Maximum number of matched pairs to return." }),
    "min-confidence": (0, base_command_js_1.numberFlag)({ description: "Minimum match confidence score (0.0-1.0)." }),
    "include-prices": core_1.Flags.boolean({ description: "Enrich markets with live order book prices." }),
    "params-json": core_1.Flags.string({ description: "Additional JSON object query params. Prefix with @ to read a file." }),
};
function buildMatchedParams(flags) {
    const params = (0, params_js_1.buildParams)(flags, {
        query: "query",
        relations: "relations",
        "min-difference": "minDifference",
        category: "category",
        limit: "limit",
        "min-confidence": "minConfidence",
        "include-prices": "includePrices",
    });
    if (!params.relations && flags.relation)
        params.relations = flags.relation;
    return (0, params_js_1.mergeJsonParams)(flags, "params-json", params);
}
class EnterpriseMatchedMarkets extends base_command_js_1.PmxtCommand {
    static description = "Discover matched markets across venues.";
    static aliases = ["matched-markets", "v0-matched-markets"];
    static flags = { ...base_command_js_1.enterpriseFlags, ...matchedFlags };
    async run() {
        const { flags } = await this.parse(EnterpriseMatchedMarkets);
        const data = await this.runEnterpriseGet("/v0/matched-markets", buildMatchedParams(flags), flags);
        this.output(data, flags, "matched markets");
    }
}
exports.default = EnterpriseMatchedMarkets;
