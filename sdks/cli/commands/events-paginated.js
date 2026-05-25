"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@oclif/core");
const base_command_js_1 = require("../cli/base-command.js");
const params_js_1 = require("../cli/params.js");
class EventsPaginated extends base_command_js_1.PmxtCommand {
    static description = "Fetch events with cursor-based pagination.";
    static aliases = ["fetch-events-paginated"];
    static flags = { ...base_command_js_1.venueFlags, limit: core_1.Flags.integer({ description: "Page size." }), cursor: core_1.Flags.string({ description: "Cursor returned by the previous page." }), "filter-json": core_1.Flags.string({ description: "Event filter JSON object. Prefix with @ to read a file." }), "params-json": core_1.Flags.string({ description: "Additional JSON object params. Prefix with @ to read a file." }) };
    async run() {
        const { flags } = await this.parse(EventsPaginated);
        const params = (0, params_js_1.mergeJsonParams)(flags, "params-json", (0, params_js_1.buildParams)(flags, { limit: "limit", cursor: "cursor" }, { filter: (0, params_js_1.parseJsonObject)(flags["filter-json"], "--filter-json") }));
        const data = await this.runVenue("fetchEventsPaginated", (0, params_js_1.argsWithOptionalObject)(params), flags);
        this.output(data, flags, "events");
    }
}
exports.default = EventsPaginated;
