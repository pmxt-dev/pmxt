"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@oclif/core");
const base_command_js_1 = require("../cli/base-command.js");
class Balance extends base_command_js_1.PmxtCommand {
    static description = "Fetch account balances.";
    static aliases = ["fetch-balance"];
    static flags = { ...base_command_js_1.venueFlags, address: core_1.Flags.string({ description: "Optional public wallet address." }) };
    async run() {
        const { flags } = await this.parse(Balance);
        const data = await this.runVenue("fetchBalance", flags.address ? [flags.address] : [], flags);
        this.output(data, flags, "balance");
    }
}
exports.default = Balance;
