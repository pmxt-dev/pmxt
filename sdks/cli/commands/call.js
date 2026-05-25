"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@oclif/core");
const base_command_js_1 = require("../cli/base-command.js");
const params_js_1 = require("../cli/params.js");
class Call extends base_command_js_1.PmxtCommand {
    static description = "Call an allowlisted PMXT API Reference method by name.";
    static args = { method: core_1.Args.string({ description: "API Reference method name, for example fetchMarkets or router.fetchMarketMatches.", required: true }) };
    static flags = { ...base_command_js_1.callFlags, "args-json": core_1.Flags.string({ description: "JSON array of positional method args. Prefix with @ to read a file." }), "params-json": core_1.Flags.string({ description: "Convenience JSON object sent as the single positional arg. Prefix with @ to read a file." }) };
    async run() {
        const { args, flags } = await this.parse(Call);
        const methodArgs = flags["args-json"] !== undefined
            ? (0, params_js_1.parseJsonValue)(flags["args-json"], "--args-json")
            : flags["params-json"] !== undefined ? [(0, params_js_1.parseJsonValue)(flags["params-json"], "--params-json")] : [];
        if (!Array.isArray(methodArgs))
            throw new Error("--args-json must be a JSON array");
        const data = await this.runAllowed(args.method, methodArgs, flags);
        this.output(data, flags, "result");
    }
}
exports.default = Call;
