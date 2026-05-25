"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.marketFlags = void 0;
exports.buildMarketParams = buildMarketParams;
const core_1 = require("@oclif/core");
const base_command_js_1 = require("../cli/base-command.js");
const params_js_1 = require("../cli/params.js");
exports.marketFlags = {
    query: core_1.Flags.string({ description: "Search query." }),
    slug: core_1.Flags.string({ description: "Market slug or ticker." }),
    "market-id": core_1.Flags.string({ description: "Market ID." }),
    "outcome-id": core_1.Flags.string({ description: "Outcome ID." }),
    "event-id": core_1.Flags.string({ description: "Event ID." }),
    limit: core_1.Flags.integer({ description: "Maximum number of results." }),
    offset: core_1.Flags.integer({ description: "Pagination offset." }),
    page: core_1.Flags.integer({ description: "Venue-specific page number." }),
    "similarity-threshold": (0, base_command_js_1.numberFlag)({ description: "Semantic search similarity threshold." }),
    category: core_1.Flags.string({ description: "Market category." }),
    tags: core_1.Flags.string({ description: "Comma-separated tags." }),
    sort: core_1.Flags.option({ options: ["volume", "liquidity", "newest"], description: "Sort order." })(),
    status: core_1.Flags.option({ options: ["active", "inactive", "closed", "all"], description: "Market status." })(),
    "search-in": core_1.Flags.option({ options: ["title", "description", "both"], description: "Fields to search." })(),
    "params-json": core_1.Flags.string({ description: "Additional JSON object params. Prefix with @ to read a file." }),
};
function buildMarketParams(flags) {
    return (0, params_js_1.mergeJsonParams)(flags, "params-json", (0, params_js_1.buildParams)(flags, {
        query: "query", slug: "slug", "market-id": "marketId", "outcome-id": "outcomeId",
        "event-id": "eventId", limit: "limit", offset: "offset", page: "page",
        "similarity-threshold": "similarityThreshold", category: "category", sort: "sort",
        status: "status", "search-in": "searchIn",
    }, { tags: (0, params_js_1.parseCsv)(flags.tags) }));
}
class Markets extends base_command_js_1.PmxtCommand {
    static description = "Search and list markets.";
    static aliases = ["fetch-markets"];
    static flags = { ...base_command_js_1.venueFlags, ...exports.marketFlags };
    async run() {
        const { flags } = await this.parse(Markets);
        const data = await this.runVenue("fetchMarkets", (0, params_js_1.argsWithOptionalObject)(buildMarketParams(flags)), flags);
        this.output(data, flags, "markets");
    }
}
exports.default = Markets;
