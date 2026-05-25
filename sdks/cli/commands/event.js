"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const base_command_js_1 = require("../cli/base-command.js");
const params_js_1 = require("../cli/params.js");
const events_js_1 = require("./events.js");
class Event extends base_command_js_1.PmxtCommand {
    static description = "Fetch a single event by lookup parameters.";
    static aliases = ["fetch-event"];
    static flags = { ...base_command_js_1.venueFlags, ...events_js_1.eventFlags };
    async run() {
        const { flags } = await this.parse(Event);
        const data = await this.runVenue("fetchEvent", (0, params_js_1.argsWithOptionalObject)((0, events_js_1.buildEventParams)(flags)), flags);
        this.output(data, flags, "event");
    }
}
exports.default = Event;
