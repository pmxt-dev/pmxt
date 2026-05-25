"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventFlags = void 0;
exports.buildEventParams = buildEventParams;
const core_1 = require("@oclif/core");
const base_command_js_1 = require("../cli/base-command.js");
const params_js_1 = require("../cli/params.js");
exports.eventFlags = {
    query: core_1.Flags.string({ description: "Search query." }), slug: core_1.Flags.string({ description: "Event slug." }), "event-id": core_1.Flags.string({ description: "Event ID." }),
    limit: core_1.Flags.integer({ description: "Maximum number of results." }), cursor: core_1.Flags.string({ description: "Cursor for venues that support it." }), offset: core_1.Flags.integer({ description: "Pagination offset." }),
    category: core_1.Flags.string({ description: "Event category." }), tags: core_1.Flags.string({ description: "Comma-separated tags." }),
    sort: core_1.Flags.option({ options: ["volume", "liquidity", "newest"], description: "Sort order." })(),
    status: core_1.Flags.option({ options: ["active", "inactive", "closed", "all"], description: "Event status." })(),
    "search-in": core_1.Flags.option({ options: ["title", "description", "both"], description: "Fields to search." })(),
    "filter-json": core_1.Flags.string({ description: "Event filter JSON object. Prefix with @ to read a file." }),
    "params-json": core_1.Flags.string({ description: "Additional JSON object params. Prefix with @ to read a file." }),
};
function buildEventParams(flags) {
    return (0, params_js_1.mergeJsonParams)(flags, "params-json", (0, params_js_1.buildParams)(flags, {
        query: "query", slug: "slug", "event-id": "eventId", limit: "limit", cursor: "cursor", offset: "offset",
        category: "category", sort: "sort", status: "status", "search-in": "searchIn",
    }, { tags: (0, params_js_1.parseCsv)(flags.tags), filter: (0, params_js_1.parseJsonObject)(flags["filter-json"], "--filter-json") }));
}
class Events extends base_command_js_1.PmxtCommand {
    static description = "Search and list events.";
    static aliases = ["fetch-events"];
    static flags = { ...base_command_js_1.venueFlags, ...exports.eventFlags };
    async run() {
        const { flags } = await this.parse(Events);
        const data = await this.runVenue("fetchEvents", (0, params_js_1.argsWithOptionalObject)(buildEventParams(flags)), flags);
        this.output(data, flags, "events");
    }
}
exports.default = Events;
