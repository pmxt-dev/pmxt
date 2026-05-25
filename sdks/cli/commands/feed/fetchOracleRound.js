"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const core_1 = require("@oclif/core");
const streaming_js_1 = require("../../cli/streaming.js");
class FeedFetchOracleRound extends core_1.Command {
    static description = "Call feed fetchOracleRound";
    static args = {
        feed: core_1.Args.string({ description: "Data feed provider", required: true }),
        oracleFeed: core_1.Args.string({ description: "Oracle pair", required: true }),
    };
    static flags = {
        ...streaming_js_1.feedHttpFlags,
    };
    async run() {
        const { args, flags } = await this.parse(FeedFetchOracleRound);
        const credentials = (0, streaming_js_1.resolveCliCredentials)(flags, { targetKind: "feed", targetName: args.feed });
        const data = await (0, streaming_js_1.fetchPmxtData)(`/api/feeds/${encodeURIComponent(args.feed)}/fetchOracleRound`, credentials, { feed: args.oracleFeed });
        (0, streaming_js_1.writeJson)(data);
    }
}
exports.default = FeedFetchOracleRound;
