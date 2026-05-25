"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const base_command_js_1 = require("../../cli/base-command.js");
const create_js_1 = require("./create.js");
const create_js_2 = __importDefault(require("./create.js"));
class OrderBuild extends base_command_js_1.PmxtCommand {
    static description = "Build an order payload without submitting it.";
    static aliases = ["build-order"];
    static flags = create_js_2.default.flags;
    async run() {
        const { flags } = await this.parse(OrderBuild);
        const data = await this.runVenue("buildOrder", [(0, create_js_1.buildOrderParams)(flags)], flags);
        this.output(data, flags, "built-order");
    }
}
exports.default = OrderBuild;
