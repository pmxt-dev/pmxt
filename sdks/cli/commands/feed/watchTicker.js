"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const core_1 = require("@oclif/core");
const streaming_js_1 = require("../../cli/streaming.js");
class FeedWatchTicker extends core_1.Command {
    static description = "Stream feed watchTicker as JSONL";
    static args = {
        feed: core_1.Args.string({ description: "Data feed provider", required: true }),
        symbol: core_1.Args.string({ description: "Trading pair to stream", required: true }),
    };
    static flags = {
        ...streaming_js_1.pmxtCredentialFlags,
    };
    async run() {
        const { args, flags } = await this.parse(FeedWatchTicker);
        const credentials = (0, streaming_js_1.resolveCliCredentials)(flags, { targetKind: "feed", targetName: args.feed });
        await (0, streaming_js_1.streamJsonl)({
            args: [args.symbol],
            credentials,
            method: "watchTicker",
            target: { feed: args.feed },
        });
    }
}
exports.default = FeedWatchTicker;
