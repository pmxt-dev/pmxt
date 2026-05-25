"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMMAND_ALIASES = exports.KNOWN_EXCHANGES = void 0;
exports.normalizeArgvAliases = normalizeArgvAliases;

exports.KNOWN_EXCHANGES = new Set([
    "baozi",
    "gemini-titan",
    "hyperliquid",
    "kalshi",
    "kalshi-demo",
    "limitless",
    "metaculus",
    "mock",
    "myriad",
    "opinion",
    "polymarket",
    "polymarket-us",
    "polymarket_us",
    "probable",
    "smarkets",
    "suibets",
]);

exports.COMMAND_ALIASES = new Map([
    ["balance", { command: "balance", injectExchangeFlag: true }],
    ["fetchBalance", { command: "balance", injectExchangeFlag: true }],
    ["fetch-balance", { command: "balance", injectExchangeFlag: true }],

    ["event", { command: "event", injectExchangeFlag: true }],
    ["fetchEvent", { command: "event", injectExchangeFlag: true }],
    ["fetch-event", { command: "event", injectExchangeFlag: true }],
    ["events", { command: "events", injectExchangeFlag: true }],
    ["fetchEvents", { command: "events", injectExchangeFlag: true }],
    ["fetch-events", { command: "events", injectExchangeFlag: true }],
    ["eventsPaginated", { command: "events-paginated", injectExchangeFlag: true }],
    ["events-paginated", { command: "events-paginated", injectExchangeFlag: true }],
    ["fetchEventsPaginated", { command: "events-paginated", injectExchangeFlag: true }],
    ["fetch-events-paginated", { command: "events-paginated", injectExchangeFlag: true }],

    ["market", { command: "market", injectExchangeFlag: true }],
    ["fetchMarket", { command: "market", injectExchangeFlag: true }],
    ["fetch-market", { command: "market", injectExchangeFlag: true }],
    ["markets", { command: "markets", injectExchangeFlag: true }],
    ["fetchMarkets", { command: "markets", injectExchangeFlag: true }],
    ["fetch-markets", { command: "markets", injectExchangeFlag: true }],
    ["marketsPaginated", { command: "markets-paginated", injectExchangeFlag: true }],
    ["markets-paginated", { command: "markets-paginated", injectExchangeFlag: true }],
    ["fetchMarketsPaginated", { command: "markets-paginated", injectExchangeFlag: true }],
    ["fetch-markets-paginated", { command: "markets-paginated", injectExchangeFlag: true }],

    ["orderbook", { command: "orderbook", injectExchangeFlag: true }],
    ["orderBook", { command: "orderbook", injectExchangeFlag: true }],
    ["order-book", { command: "orderbook", injectExchangeFlag: true }],
    ["fetchOrderBook", { command: "orderbook", injectExchangeFlag: true }],
    ["fetch-order-book", { command: "orderbook", injectExchangeFlag: true }],
    ["orderbooks", { command: "orderbooks", injectExchangeFlag: true }],
    ["orderBooks", { command: "orderbooks", injectExchangeFlag: true }],
    ["order-books", { command: "orderbooks", injectExchangeFlag: true }],
    ["fetchOrderBooks", { command: "orderbooks", injectExchangeFlag: true }],
    ["fetch-order-books", { command: "orderbooks", injectExchangeFlag: true }],

    ["trades", { command: "trades", injectExchangeFlag: true }],
    ["fetchTrades", { command: "trades", injectExchangeFlag: true }],
    ["fetch-trades", { command: "trades", injectExchangeFlag: true }],
    ["myTrades", { command: "orders:trades", injectExchangeFlag: true }],
    ["my-trades", { command: "orders:trades", injectExchangeFlag: true }],
    ["fetchMyTrades", { command: "orders:trades", injectExchangeFlag: true }],
    ["fetch-my-trades", { command: "orders:trades", injectExchangeFlag: true }],
    ["ohlcv", { command: "ohlcv", injectExchangeFlag: true }],
    ["fetchOHLCV", { command: "ohlcv", injectExchangeFlag: true }],
    ["fetch-ohlcv", { command: "ohlcv", injectExchangeFlag: true }],

    ["positions", { command: "positions", injectExchangeFlag: true }],
    ["fetchPositions", { command: "positions", injectExchangeFlag: true }],
    ["fetch-positions", { command: "positions", injectExchangeFlag: true }],
    ["openOrders", { command: "orders:open", injectExchangeFlag: true }],
    ["open-orders", { command: "orders:open", injectExchangeFlag: true }],
    ["fetchOpenOrders", { command: "orders:open", injectExchangeFlag: true }],
    ["fetch-open-orders", { command: "orders:open", injectExchangeFlag: true }],
    ["closedOrders", { command: "orders:closed", injectExchangeFlag: true }],
    ["closed-orders", { command: "orders:closed", injectExchangeFlag: true }],
    ["fetchClosedOrders", { command: "orders:closed", injectExchangeFlag: true }],
    ["fetch-closed-orders", { command: "orders:closed", injectExchangeFlag: true }],
    ["allOrders", { command: "orders:all", injectExchangeFlag: true }],
    ["all-orders", { command: "orders:all", injectExchangeFlag: true }],
    ["fetchAllOrders", { command: "orders:all", injectExchangeFlag: true }],
    ["fetch-all-orders", { command: "orders:all", injectExchangeFlag: true }],
    ["fetchOrder", { command: "order:get", injectExchangeFlag: true }],
    ["fetch-order", { command: "order:get", injectExchangeFlag: true }],
    ["getOrder", { command: "order:get", injectExchangeFlag: true }],
    ["buildOrder", { command: "order:build", injectExchangeFlag: true }],
    ["build-order", { command: "order:build", injectExchangeFlag: true }],
    ["createOrder", { command: "order:create", injectExchangeFlag: true }],
    ["create-order", { command: "order:create", injectExchangeFlag: true }],
    ["submitOrder", { command: "order:submit", injectExchangeFlag: true }],
    ["submit-order", { command: "order:submit", injectExchangeFlag: true }],
    ["cancelOrder", { command: "order:cancel", injectExchangeFlag: true }],
    ["cancel-order", { command: "order:cancel", injectExchangeFlag: true }],

    ["executionPrice", { command: "execution-price", injectExchangeFlag: true }],
    ["execution-price", { command: "execution-price", injectExchangeFlag: true }],
    ["getExecutionPrice", { command: "execution-price", injectExchangeFlag: true }],
    ["get-execution-price", { command: "execution-price", injectExchangeFlag: true }],
    ["executionPriceDetailed", { command: "execution-price-detailed", injectExchangeFlag: true }],
    ["execution-price-detailed", { command: "execution-price-detailed", injectExchangeFlag: true }],
    ["getExecutionPriceDetailed", { command: "execution-price-detailed", injectExchangeFlag: true }],
    ["get-execution-price-detailed", { command: "execution-price-detailed", injectExchangeFlag: true }],

    ["watchOrderBook", { command: "watch:orderBook", prependExchangeArg: true }],
    ["watch-order-book", { command: "watch:orderBook", prependExchangeArg: true }],
    ["watchOrderBooks", { command: "watch:orderBooks", prependExchangeArg: true }],
    ["watch-order-books", { command: "watch:orderBooks", prependExchangeArg: true }],
    ["watchAllOrderBooks", { command: "watch:allOrderBooks", prependExchangeArg: true }],
    ["watch-all-order-books", { command: "watch:allOrderBooks", prependExchangeArg: true }],
    ["watchTrades", { command: "watch:trades", prependExchangeArg: true }],
    ["watch-trades", { command: "watch:trades", prependExchangeArg: true }],

    ["marketMatches", { command: "router:market-matches" }],
    ["market-matches", { command: "router:market-matches" }],
    ["fetchMarketMatches", { command: "router:market-matches" }],
    ["fetch-market-matches", { command: "router:market-matches" }],
    ["eventMatches", { command: "router:event-matches" }],
    ["event-matches", { command: "router:event-matches" }],
    ["fetchEventMatches", { command: "router:event-matches" }],
    ["fetch-event-matches", { command: "router:event-matches" }],

    ["fetchMatchedMarkets", { command: "enterprise:matched-markets" }],
    ["fetch-matched-markets", { command: "enterprise:matched-markets" }],
    ["matchedMarkets", { command: "enterprise:matched-markets" }],
    ["matched-markets", { command: "enterprise:matched-markets" }],
    ["fetchMatchedPrices", { command: "enterprise:matched-prices" }],
    ["fetch-matched-prices", { command: "enterprise:matched-prices" }],
    ["matchedPrices", { command: "enterprise:matched-prices" }],
    ["matched-prices", { command: "enterprise:matched-prices" }],

    ["feedList", { command: "feeds" }],
    ["feeds", { command: "feeds" }],
    ["feedLoadMarkets", { command: "feed:loadMarkets" }],
    ["feedFetchTicker", { command: "feed:fetchTicker" }],
    ["feedFetchTickers", { command: "feed:fetchTickers" }],
    ["feedFetchOHLCV", { command: "feed:fetchOHLCV" }],
    ["feedFetchOrderBook", { command: "feed:fetchOrderBook" }],
    ["feedFetchOracleRound", { command: "feed:fetchOracleRound" }],
    ["feedFetchOracleHistory", { command: "feed:fetchOracleHistory" }],
    ["feedFetchHistoricalPrices", { command: "feed:fetchHistoricalPrices" }],
    ["feedWatchTicker", { command: "feed:watchTicker" }],
]);

const GROUP_ALIASES = new Map([
    ["order", new Map([
            ["build", "order:build"],
            ["buildOrder", "order:build"],
            ["create", "order:create"],
            ["createOrder", "order:create"],
            ["submit", "order:submit"],
            ["submitOrder", "order:submit"],
            ["cancel", "order:cancel"],
            ["cancelOrder", "order:cancel"],
            ["get", "order:get"],
            ["fetchOrder", "order:get"],
        ])],
    ["orders", new Map([
            ["all", "orders:all"],
            ["allOrders", "orders:all"],
            ["open", "orders:open"],
            ["openOrders", "orders:open"],
            ["closed", "orders:closed"],
            ["closedOrders", "orders:closed"],
            ["trades", "orders:trades"],
            ["myTrades", "orders:trades"],
            ["fetchMyTrades", "orders:trades"],
        ])],
    ["watch", new Map([
            ["orderBook", "watch:orderBook"],
            ["order-book", "watch:orderBook"],
            ["orderBooks", "watch:orderBooks"],
            ["order-books", "watch:orderBooks"],
            ["allOrderBooks", "watch:allOrderBooks"],
            ["all-order-books", "watch:allOrderBooks"],
            ["trades", "watch:trades"],
        ])],
    ["router", new Map([
            ["marketMatches", "router:market-matches"],
            ["market-matches", "router:market-matches"],
            ["fetchMarketMatches", "router:market-matches"],
            ["fetch-market-matches", "router:market-matches"],
            ["eventMatches", "router:event-matches"],
            ["event-matches", "router:event-matches"],
            ["fetchEventMatches", "router:event-matches"],
            ["fetch-event-matches", "router:event-matches"],
        ])],
    ["enterprise", new Map([
            ["matchedMarkets", "enterprise:matched-markets"],
            ["matched-markets", "enterprise:matched-markets"],
            ["fetchMatchedMarkets", "enterprise:matched-markets"],
            ["fetch-matched-markets", "enterprise:matched-markets"],
            ["matchedPrices", "enterprise:matched-prices"],
            ["matched-prices", "enterprise:matched-prices"],
            ["fetchMatchedPrices", "enterprise:matched-prices"],
            ["fetch-matched-prices", "enterprise:matched-prices"],
            ["sql", "enterprise:sql"],
        ])],
    ["feed", new Map([
            ["loadMarkets", "feed:loadMarkets"],
            ["load-markets", "feed:loadMarkets"],
            ["fetchTicker", "feed:fetchTicker"],
            ["fetch-ticker", "feed:fetchTicker"],
            ["fetchTickers", "feed:fetchTickers"],
            ["fetch-tickers", "feed:fetchTickers"],
            ["fetchOHLCV", "feed:fetchOHLCV"],
            ["fetch-ohlcv", "feed:fetchOHLCV"],
            ["fetchOrderBook", "feed:fetchOrderBook"],
            ["fetch-order-book", "feed:fetchOrderBook"],
            ["fetchOracleRound", "feed:fetchOracleRound"],
            ["fetch-oracle-round", "feed:fetchOracleRound"],
            ["fetchOracleHistory", "feed:fetchOracleHistory"],
            ["fetch-oracle-history", "feed:fetchOracleHistory"],
            ["fetchHistoricalPrices", "feed:fetchHistoricalPrices"],
            ["fetch-historical-prices", "feed:fetchHistoricalPrices"],
            ["watchTicker", "feed:watchTicker"],
            ["watch-ticker", "feed:watchTicker"],
        ])],
    ["server", new Map([
            ["health", "server:health"],
            ["logs", "server:logs"],
            ["restart", "server:restart"],
            ["start", "server:start"],
            ["status", "server:status"],
            ["stop", "server:stop"],
        ])],
]);

function hasExchangeFlag(args) {
    return args.some((arg) => arg === "--exchange" || arg === "-e" || arg.startsWith("--exchange="));
}

function helpRequested(args) {
    return args.length === 0 || args[0] === "--help" || args[0] === "-h";
}

function addExchangeFlag(args, exchange) {
    if (hasExchangeFlag(args)) {
        return args;
    }
    const [command, ...rest] = args;
    return [command, "--exchange", exchange, ...rest];
}

function normalizeExchange(exchange) {
    return exchange === "polymarket-us" ? "polymarket_us" : exchange;
}

function normalizeExchangeCommand(exchange, args) {
    const normalizedExchange = normalizeExchange(exchange);
    if (helpRequested(args)) {
        return ["exchange", "--exchange", normalizedExchange];
    }
    const [candidate, maybeSubcommand, ...rest] = args;
    const group = GROUP_ALIASES.get(candidate);
    if (group) {
        const command = group.get(maybeSubcommand);
        if (command) {
            const remaining = rest;
            if (command.startsWith("watch:")) {
                return [command, normalizedExchange, ...remaining];
            }
            if (candidate === "auth") {
                return normalizeExchangeAuth(normalizedExchange, maybeSubcommand, remaining);
            }
            return addExchangeFlag([command, ...remaining], normalizedExchange);
        }
    }
    if (candidate === "auth") {
        return normalizeExchangeAuth(normalizedExchange, maybeSubcommand, rest);
    }
    const alias = exports.COMMAND_ALIASES.get(candidate);
    if (alias) {
        const commandArgs = alias.prependExchangeArg
            ? [alias.command, normalizedExchange, ...args.slice(1)]
            : [alias.command, ...args.slice(1)];
        return alias.injectExchangeFlag ? addExchangeFlag(commandArgs, normalizedExchange) : commandArgs;
    }
    return ["exchange", "--exchange", normalizedExchange, ...args];
}

function normalizeExchangeAuth(exchange, action, rest) {
    if (!action || action === "status" || action === "status-exchange" || action === "exchange") {
        return ["auth", "status-exchange", exchange, ...(rest ?? [])];
    }
    if (action === "set" || action === "set-exchange") {
        return ["auth", "set-exchange", exchange, ...(rest ?? [])];
    }
    if (action === "remove" || action === "remove-exchange") {
        return ["auth", "remove-exchange", exchange, ...(rest ?? [])];
    }
    if (action === "login" || action === "logout") {
        return ["auth", action, ...(rest ?? [])];
    }
    return ["exchange", "--exchange", exchange, "auth", action, ...(rest ?? [])];
}

function normalizeGroupCommand(args) {
    const [candidate, maybeSubcommand, ...rest] = args;
    const group = GROUP_ALIASES.get(candidate);
    const command = group?.get(maybeSubcommand);
    return command ? [command, ...rest] : null;
}

function normalizeDirectCommandAlias(args) {
    const [candidate, ...rest] = args;
    const alias = exports.COMMAND_ALIASES.get(candidate);
    return alias ? [alias.command, ...rest] : null;
}

function normalizeArgvAliases(argv) {
    if (!Array.isArray(argv) || argv.length === 0) {
        return argv;
    }
    const args = [...argv];
    const first = args[0];
    if (first && !first.startsWith("-") && exports.KNOWN_EXCHANGES.has(first)) {
        return normalizeExchangeCommand(first, args.slice(1));
    }
    return normalizeGroupCommand(args) ?? normalizeDirectCommandAlias(args) ?? args;
}
