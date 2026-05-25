"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@oclif/core");
const base_command_js_1 = require("../cli/base-command.js");
class Positions extends base_command_js_1.PmxtCommand {
    static description = "Fetch current user positions.";
    static aliases = ["fetch-positions"];
    static flags = { ...base_command_js_1.venueFlags, address: core_1.Flags.string({ description: "Optional public wallet address." }) };
    async run() {
        const { flags } = await this.parse(Positions);
        const data = await this.runVenue("fetchPositions", flags.address ? [flags.address] : [], flags);
        this.output(data, flags, "positions");
    }
}
exports.default = Positions;
