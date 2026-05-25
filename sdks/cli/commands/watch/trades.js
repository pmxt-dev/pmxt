"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const core_1 = require("@oclif/core");
const streaming_js_1 = require("../../cli/streaming.js");
class WatchTrades extends core_1.Command {
    static description = "Stream watchTrades as JSONL";
    static args = {
        exchange: core_1.Args.string({ description: "Prediction market exchange", required: true }),
        outcomeId: core_1.Args.string({ description: "Outcome ID to watch", required: true }),
    };
    static flags = {
        ...streaming_js_1.pmxtCredentialFlags,
        ...streaming_js_1.exchangeCredentialFlags,
        ...streaming_js_1.streamControlFlags,
        address: core_1.Flags.string({
            description: "Public wallet address",
        }),
        limit: core_1.Flags.integer({
            description: "Maximum number of trades",
        }),
        since: core_1.Flags.integer({
            description: "Unix timestamp in milliseconds",
        }),
    };
    async run() {
        const { args, flags } = await this.parse(WatchTrades);
        const credentials = (0, streaming_js_1.resolveCliCredentials)(flags, { targetKind: "exchange", targetName: args.exchange });
        const methodArgs = [args.outcomeId];
        if (flags.address !== undefined || flags.since !== undefined || flags.limit !== undefined) {
            methodArgs.push(flags.address);
        }
        if (flags.since !== undefined || flags.limit !== undefined) {
            methodArgs.push(flags.since);
        }
        if (flags.limit !== undefined) {
            methodArgs.push(flags.limit);
        }
        await (0, streaming_js_1.streamJsonl)({
            args: methodArgs,
            credentials,
            maxMessages: flags["max-messages"],
            method: "watchTrades",
            target: { exchange: args.exchange },
            timeoutMs: flags["timeout-ms"],
        });
    }
}
exports.default = WatchTrades;
