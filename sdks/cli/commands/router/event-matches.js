"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@oclif/core");
const base_command_js_1 = require("../../cli/base-command.js");
const params_js_1 = require("../../cli/params.js");
function isInvalidLookupValue(value) {
    return typeof value === "string" && /^(undefined|null)$/i.test(value.trim());
}
function assertValidLookupParams(params) {
    for (const key of ["eventId", "slug"]) {
        if (isInvalidLookupValue(params[key]))
            throw new Error(`--${key === "eventId" ? "event-id" : key} cannot be ${JSON.stringify(params[key])}. Pass a real identifier or omit it for browse mode.`);
    }
}
function compactEventInput(params) {
    const event = params.event;
    if (!event || typeof event !== "object" || Array.isArray(event))
        return params;
    const next = { ...params };
    if (!next.eventId && !next.slug) {
        if (typeof event.slug === "string" && event.slug.length > 0) {
            next.slug = event.slug;
        }
        else if (typeof event.id === "string" && event.id.length > 0) {
            next.eventId = event.id;
        }
        else if (typeof event.eventId === "string" && event.eventId.length > 0) {
            next.eventId = event.eventId;
        }
    }
    delete next.event;
    return next;
}
class RouterEventMatches extends base_command_js_1.PmxtCommand {
    static description = "Find the same or related event on other venues.";
    static aliases = ["fetch-event-matches", "event-matches"];
    static flags = {
        ...base_command_js_1.routerFlags,
        query: core_1.Flags.string({ description: "Search query." }),
        category: core_1.Flags.string({ description: "Category filter." }),
        "event-id": core_1.Flags.string({ description: "Source event ID." }),
        slug: core_1.Flags.string({ description: "Source event slug." }),
        relation: core_1.Flags.option({ options: ["identity", "subset", "superset", "overlap", "disjoint"], description: "Relation filter." })(),
        "min-confidence": (0, base_command_js_1.numberFlag)({ description: "Minimum confidence." }),
        limit: core_1.Flags.integer({ description: "Maximum number of matches." }),
        "include-prices": core_1.Flags.boolean({ description: "Include live prices." }),
        "event-json": core_1.Flags.string({ description: "UnifiedEvent JSON object. Prefix with @ to read a file." }),
        "params-json": core_1.Flags.string({ description: "Additional JSON object params. Prefix with @ to read a file." }),
    };
    async run() {
        const { flags } = await this.parse(RouterEventMatches);
        const params = compactEventInput((0, params_js_1.mergeJsonParams)(flags, "params-json", (0, params_js_1.buildParams)(flags, {
            query: "query", category: "category", "event-id": "eventId", slug: "slug",
            relation: "relation", "min-confidence": "minConfidence", limit: "limit", "include-prices": "includePrices",
        }, { event: (0, params_js_1.parseJsonObject)(flags["event-json"], "--event-json") })));
        assertValidLookupParams(params);
        const data = await this.runRouter("fetchEventMatches", (0, params_js_1.argsWithOptionalObject)(params), flags);
        this.output(data, flags, "matches");
    }
}
exports.default = RouterEventMatches;
