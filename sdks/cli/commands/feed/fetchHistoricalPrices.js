"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const core_1 = require("@oclif/core");
const streaming_js_1 = require("../../cli/streaming.js");
class FeedFetchHistoricalPrices extends core_1.Command {
    static description = "Call feed fetchHistoricalPrices";
    static args = {
        feed: core_1.Args.string({ description: "Data feed provider", required: true }),
        symbol: core_1.Args.string({ description: "Trading pair or oracle pair", required: true }),
    };
    static flags = {
        ...streaming_js_1.feedHttpFlags,
        "from-timestamp": core_1.Flags.integer({
            description: "Range start timestamp in milliseconds",
        }),
        "max-size": core_1.Flags.integer({
            description: "Maximum number of price records",
        }),
        order: core_1.Flags.string({
            description: "Sort order: asc or desc",
        }),
        "until-timestamp": core_1.Flags.integer({
            description: "Range end timestamp in milliseconds",
        }),
    };
    async run() {
        const { args, flags } = await this.parse(FeedFetchHistoricalPrices);
        const credentials = (0, streaming_js_1.resolveCliCredentials)(flags, { targetKind: "feed", targetName: args.feed });
        const data = await (0, streaming_js_1.fetchPmxtData)(`/api/feeds/${encodeURIComponent(args.feed)}/fetchHistoricalPrices`, credentials, {
            fromTimestamp: flags["from-timestamp"],
            maxSize: flags["max-size"],
            order: flags.order,
            symbol: args.symbol,
            untilTimestamp: flags["until-timestamp"],
        });
        (0, streaming_js_1.writeJson)(data);
    }
}
exports.default = FeedFetchHistoricalPrices;
