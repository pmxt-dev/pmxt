"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const core_1 = require("@oclif/core");
const streaming_js_1 = require("../../cli/streaming.js");
class FeedFetchOrderBook extends core_1.Command {
    static description = "Call feed fetchOrderBook";
    static args = {
        feed: core_1.Args.string({ description: "Data feed provider", required: true }),
        symbol: core_1.Args.string({ description: "Trading pair", required: true }),
    };
    static flags = {
        ...streaming_js_1.feedHttpFlags,
        limit: core_1.Flags.integer({
            description: "Order book depth",
        }),
    };
    async run() {
        const { args, flags } = await this.parse(FeedFetchOrderBook);
        const credentials = (0, streaming_js_1.resolveCliCredentials)(flags, { targetKind: "feed", targetName: args.feed });
        const data = await (0, streaming_js_1.fetchPmxtData)(`/api/feeds/${encodeURIComponent(args.feed)}/fetchOrderBook`, credentials, { limit: flags.limit, symbol: args.symbol });
        (0, streaming_js_1.writeJson)(data);
    }
}
exports.default = FeedFetchOrderBook;
