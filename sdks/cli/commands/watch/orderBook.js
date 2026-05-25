"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const core_1 = require("@oclif/core");
const streaming_js_1 = require("../../cli/streaming.js");
class WatchOrderBook extends core_1.Command {
    static description = "Stream watchOrderBook as JSONL";
    static args = {
        exchange: core_1.Args.string({ description: "Prediction market exchange", required: true }),
        outcomeId: core_1.Args.string({ description: "Outcome ID to watch", required: true }),
    };
    static flags = {
        ...streaming_js_1.pmxtCredentialFlags,
        ...streaming_js_1.exchangeCredentialFlags,
        ...streaming_js_1.streamControlFlags,
        limit: core_1.Flags.integer({
            description: "Order book depth",
        }),
        params: core_1.Flags.string({
            description: "Exchange-specific params as a JSON object",
        }),
    };
    async run() {
        const { args, flags } = await this.parse(WatchOrderBook);
        const credentials = (0, streaming_js_1.resolveCliCredentials)(flags, { targetKind: "exchange", targetName: args.exchange });
        const params = (0, streaming_js_1.parseJsonObject)(flags.params);
        const methodArgs = [args.outcomeId];
        if (flags.limit !== undefined)
            methodArgs.push(flags.limit);
        if (Object.keys(params).length > 0) {
            if (flags.limit === undefined)
                methodArgs.push(undefined);
            methodArgs.push(params);
        }
        await (0, streaming_js_1.streamJsonl)({
            args: methodArgs,
            credentials,
            maxMessages: flags["max-messages"],
            method: "watchOrderBook",
            target: { exchange: args.exchange },
            timeoutMs: flags["timeout-ms"],
        });
    }
}
exports.default = WatchOrderBook;
