"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@oclif/core");
const base_command_js_1 = require("../../cli/base-command.js");
const params_js_1 = require("../../cli/params.js");
class EnterpriseSql extends base_command_js_1.PmxtCommand {
    static description = "Run a read-only Enterprise SQL query.";
    static aliases = ["sql", "v0-sql"];
    static args = { query: core_1.Args.string({ description: "SQL query. Prefix with @ to read a file.", required: false }) };
    static flags = { ...base_command_js_1.enterpriseFlags, query: core_1.Flags.string({ description: "SQL query. Prefix with @ to read a file." }) };
    async run() {
        const { args, flags } = await this.parse(EnterpriseSql);
        const query = flags.query ?? args.query;
        if (!query)
            throw new Error("Provide a SQL query as an argument or --query.");
        const data = await this.runEnterpriseSql((0, params_js_1.readText)(String(query), "query"), flags);
        this.output(data, flags, "rows");
    }
}
exports.default = EnterpriseSql;
