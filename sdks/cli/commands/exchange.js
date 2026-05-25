"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@oclif/core");

const HELP_TEXT = [
    "Exchange-scoped commands",
    "",
    "Use an exchange id before the command when the CLI router supports scoped exchange syntax:",
    "",
    "  pmxt <exchange> markets --query Trump",
    "  pmxt <exchange> fetchMarkets --query Trump",
    "  pmxt <exchange> orderbook <outcome-id> --limit 20",
    "  pmxt <exchange> trades <outcome-id> --limit 25",
    "  pmxt <exchange> auth set-exchange --private-key 0x...",
    "  pmxt <exchange> auth status",
    "",
    "Equivalent flag form works for venue commands:",
    "",
    "  pmxt markets --exchange <exchange> --query Trump",
    "  pmxt orderbook <outcome-id> --exchange <exchange> --limit 20",
    "  pmxt trades <outcome-id> --exchange <exchange> --limit 25",
    "  pmxt auth set-exchange <exchange> --private-key 0x...",
    "",
    "Run any command with --help for full flags and arguments.",
].join("\n");

class Exchange extends core_1.Command {
    static strict = false;
    static summary = "Show exchange-scoped command examples.";
    static description = HELP_TEXT;
    static flags = {
        exchange: core_1.Flags.string({ description: "Exchange id, e.g. polymarket or kalshi." }),
    };
    static args = {
        exchangeArg: core_1.Args.string({
            required: false,
            description: "Exchange id, e.g. polymarket or kalshi.",
        }),
    };
    async run() {
        const { args, flags } = await this.parse(Exchange);
        const exchange = flags.exchange ?? args.exchangeArg ?? "<exchange>";
        this.log(HELP_TEXT.replaceAll("<exchange>", exchange));
    }
}
exports.default = Exchange;
