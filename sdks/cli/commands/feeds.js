"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const core_1 = require("@oclif/core");
const streaming_js_1 = require("../cli/streaming.js");
class Feeds extends core_1.Command {
    static description = "List available data feeds";
    static flags = {
        ...streaming_js_1.feedHttpFlags,
    };
    async run() {
        const { flags } = await this.parse(Feeds);
        const credentials = (0, streaming_js_1.resolveCliCredentials)(flags, { targetKind: "feed" });
        const data = await (0, streaming_js_1.fetchPmxtData)("/api/feeds", credentials);
        (0, streaming_js_1.writeJson)(data);
    }
}
exports.default = Feeds;
