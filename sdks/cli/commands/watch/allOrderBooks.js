"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const core_1 = require("@oclif/core");
const streaming_js_1 = require("../../cli/streaming.js");
class WatchAllOrderBooks extends core_1.Command {
    static description = "Stream watchAllOrderBooks as JSONL";
    static flags = {
        ...streaming_js_1.pmxtCredentialFlags,
        ...streaming_js_1.exchangeCredentialFlags,
        ...streaming_js_1.streamControlFlags,
        exchange: core_1.Flags.string({
            default: "router",
            description: "Prediction market exchange target",
        }),
        venues: core_1.Flags.string({
            description: "Comma-separated venue filter",
        }),
    };
    async run() {
        const { flags } = await this.parse(WatchAllOrderBooks);
        const credentials = (0, streaming_js_1.resolveCliCredentials)(flags, { targetKind: "exchange", targetName: flags.exchange });
        const venues = (0, streaming_js_1.parseCommaList)(flags.venues);
        await (0, streaming_js_1.streamJsonl)({
            args: venues ? [venues] : [],
            credentials,
            maxMessages: flags["max-messages"],
            method: "watchAllOrderBooks",
            target: { exchange: flags.exchange },
            timeoutMs: flags["timeout-ms"],
        });
    }
}
exports.default = WatchAllOrderBooks;
