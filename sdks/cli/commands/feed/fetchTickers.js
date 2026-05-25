"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const core_1 = require("@oclif/core");
const streaming_js_1 = require("../../cli/streaming.js");
class FeedFetchTickers extends core_1.Command {
    static description = "Call feed fetchTickers";
    static args = {
        feed: core_1.Args.string({ description: "Data feed provider", required: true }),
    };
    static flags = {
        ...streaming_js_1.feedHttpFlags,
        symbols: core_1.Flags.string({
            description: "Comma-separated symbols to fetch",
        }),
    };
    async run() {
        const { args, flags } = await this.parse(FeedFetchTickers);
        const credentials = (0, streaming_js_1.resolveCliCredentials)(flags, { targetKind: "feed", targetName: args.feed });
        const symbols = (0, streaming_js_1.parseCommaList)(flags.symbols);
        const data = await (0, streaming_js_1.fetchPmxtData)(`/api/feeds/${encodeURIComponent(args.feed)}/fetchTickers`, credentials, { symbols: symbols?.join(",") });
        (0, streaming_js_1.writeJson)(data);
    }
}
exports.default = FeedFetchTickers;
