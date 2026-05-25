"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLI_OPERATIONS = exports.CLI_OPERATION_BY_ID = exports.CURATED_OPERATION_ALIASES = void 0;
exports.isCliOperationId = isCliOperationId;
exports.resolveCliOperationId = resolveCliOperationId;
exports.getCliOperation = getCliOperation;
// @ts-nocheck
const metadata_js_1 = require("./generated/metadata.js");
Object.defineProperty(exports, "CLI_OPERATION_BY_ID", { enumerable: true, get: function () { return metadata_js_1.CLI_OPERATION_BY_ID; } });
Object.defineProperty(exports, "CLI_OPERATIONS", { enumerable: true, get: function () { return metadata_js_1.CLI_OPERATIONS; } });
exports.CURATED_OPERATION_ALIASES = {
    health: 'healthCheck',
    'health-check': 'healthCheck',
    'load-markets': 'loadMarkets',
    close: 'close',
    events: 'fetchEvents',
    'fetch-events': 'fetchEvents',
    'events-paginated': 'fetchEventsPaginated',
    'fetch-events-paginated': 'fetchEventsPaginated',
    event: 'fetchEvent',
    'fetch-event': 'fetchEvent',
    markets: 'fetchMarkets',
    'fetch-markets': 'fetchMarkets',
    'markets-paginated': 'fetchMarketsPaginated',
    'fetch-markets-paginated': 'fetchMarketsPaginated',
    market: 'fetchMarket',
    'fetch-market': 'fetchMarket',
    'event-matches': 'fetchEventMatches',
    'fetch-event-matches': 'fetchEventMatches',
    'market-matches': 'fetchMarketMatches',
    'fetch-market-matches': 'fetchMarketMatches',
    ohlcv: 'fetchOHLCV',
    'fetch-ohlcv': 'fetchOHLCV',
    'order-book': 'fetchOrderBook',
    'fetch-order-book': 'fetchOrderBook',
    'order-books': 'fetchOrderBooks',
    'fetch-order-books': 'fetchOrderBooks',
    trades: 'fetchTrades',
    'fetch-trades': 'fetchTrades',
    'execution-price': 'getExecutionPrice',
    'get-execution-price': 'getExecutionPrice',
    'execution-price-detailed': 'getExecutionPriceDetailed',
    'get-execution-price-detailed': 'getExecutionPriceDetailed',
    'create-order': 'createOrder',
    'build-order': 'buildOrder',
    'submit-order': 'submitOrder',
    'cancel-order': 'cancelOrder',
    order: 'fetchOrder',
    'fetch-order': 'fetchOrder',
    'open-orders': 'fetchOpenOrders',
    'fetch-open-orders': 'fetchOpenOrders',
    'my-trades': 'fetchMyTrades',
    'fetch-my-trades': 'fetchMyTrades',
    'closed-orders': 'fetchClosedOrders',
    'fetch-closed-orders': 'fetchClosedOrders',
    'all-orders': 'fetchAllOrders',
    'fetch-all-orders': 'fetchAllOrders',
    positions: 'fetchPositions',
    'fetch-positions': 'fetchPositions',
    balance: 'fetchBalance',
    'fetch-balance': 'fetchBalance',
    'watch-all-order-books': 'watchAllOrderBooks',
    'stream-all-order-books': 'watchAllOrderBooks',
    'watch-order-book': 'watchOrderBook',
    'stream-order-book': 'watchOrderBook',
    'watch-order-books': 'watchOrderBooks',
    'stream-order-books': 'watchOrderBooks',
    'watch-trades': 'watchTrades',
    'stream-trades': 'watchTrades',
    feeds: 'feedList',
    'feed-list': 'feedList',
    'feed-markets': 'feedLoadMarkets',
    'feed-load-markets': 'feedLoadMarkets',
    'feed-ticker': 'feedFetchTicker',
    'feed-fetch-ticker': 'feedFetchTicker',
    'feed-tickers': 'feedFetchTickers',
    'feed-fetch-tickers': 'feedFetchTickers',
    'feed-ohlcv': 'feedFetchOHLCV',
    'feed-fetch-ohlcv': 'feedFetchOHLCV',
    'feed-order-book': 'feedFetchOrderBook',
    'feed-fetch-order-book': 'feedFetchOrderBook',
    'feed-watch-ticker': 'feedWatchTicker',
    'feed-stream-ticker': 'feedWatchTicker',
    'feed-oracle-round': 'feedFetchOracleRound',
    'feed-fetch-oracle-round': 'feedFetchOracleRound',
    'feed-oracle-history': 'feedFetchOracleHistory',
    'feed-fetch-oracle-history': 'feedFetchOracleHistory',
    'feed-historical-prices': 'feedFetchHistoricalPrices',
    'feed-fetch-historical-prices': 'feedFetchHistoricalPrices',
    'matched-markets': 'getV0Matched-markets',
    'v0-matched-markets': 'getV0Matched-markets',
    'matched-prices': 'getV0Matched-prices',
    'v0-matched-prices': 'getV0Matched-prices',
    sql: 'postV0Sql',
    'v0-sql': 'postV0Sql',
};
function isCliOperationId(value) {
    return Object.prototype.hasOwnProperty.call(metadata_js_1.CLI_OPERATION_BY_ID, value);
}
function resolveCliOperationId(value) {
    const normalized = value.trim();
    if (isCliOperationId(normalized)) {
        return normalized;
    }
    return exports.CURATED_OPERATION_ALIASES[normalized];
}
function getCliOperation(value) {
    const operationId = resolveCliOperationId(value);
    return operationId ? metadata_js_1.CLI_OPERATION_BY_ID[operationId] : undefined;
}
