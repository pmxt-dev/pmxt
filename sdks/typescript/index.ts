/**
 * PMXT - Unified Prediction Market API (TypeScript SDK)
 *
 * A unified TypeScript SDK for supported prediction markets.
 * Provides local sidecar access to PMXT exchange implementations and hosted services where configured.
 *
 * @example
 * ```typescript
 * import { Polymarket, Kalshi } from "pmxtjs";
 *
 * // Initialize exchanges
 * const poly = new Polymarket();
 * const kalshi = new Kalshi();
 *
 * // Fetch markets
 * const markets = await poly.fetchMarkets({ query: "Trump" });
 * console.log(markets[0].title);
 * ```
 */


import { Exchange, Polymarket, Kalshi, KalshiDemo, Limitless, Myriad, Probable, Baozi, Opinion, Metaculus, Smarkets, PolymarketUS, GeminiTitan, Hyperliquid, SuiBets, Suibets, Rain, Hunch, Mock } from "./pmxt/client.js";
import { Router } from "./pmxt/router.js";
import { ServerManager } from "./pmxt/server-manager.js";
import { FeedClient } from "./pmxt/feed-client.js";
import * as models from "./pmxt/models.js";
import * as errors from "./pmxt/errors.js";

export { Exchange, Polymarket, Kalshi, KalshiDemo, Limitless, Myriad, Probable, Baozi, Opinion, Metaculus, Smarkets, PolymarketUS, GeminiTitan, Hyperliquid, SuiBets, Suibets, Rain, Hunch, Mock, PolymarketOptions } from "./pmxt/client.js";
export type { ExchangeOptions, SuiBetsOptions } from "./pmxt/client.js";
export { FeedClient } from "./pmxt/feed-client.js";
export type { Ticker, Tickers, OHLCV, Market as FeedMarket, OracleRound, FeedClientOptions } from "./pmxt/feed-client.js";
export { Router } from "./pmxt/router.js";
export type { RouterOptions } from "./pmxt/router.js";
export { ServerManager } from "./pmxt/server-manager.js";
export {
    HOSTED_URL,
    LOCAL_URL,
    ENV,
    resolvePmxtBaseUrl,
    PREFUNDED_ESCROW_ADDRESSES,
    VENUE_ESCROW_ADDRESSES,
    LIMITLESS_VENUE_ESCROW_ADDRESSES,
} from "./pmxt/constants.js";
export { MarketList } from "./pmxt/models.js";
export type { UnifiedSeries } from "./pmxt/models.js";
export type * from "./pmxt/models.js";
export * from "./pmxt/errors.js";
export * from "./pmxt/hosted-errors.js";


const defaultManager = new ServerManager();

// Flat aliases for the namespaced server commands. Kept as permanent,
// fully-supported shorthand — `pmxt.server.stop()` and `pmxt.stopServer()`
// are equivalent and both are first-class API.
async function stopServer(): Promise<void> {
    await defaultManager.stop();
}

async function restartServer(): Promise<void> {
    await defaultManager.restart();
}

/**
 * Namespaced server management API.
 *
 * Available commands:
 *  - status()  Structured snapshot of the sidecar (running, pid, port, version, uptime)
 *  - health()  True if the server responds to /health, false otherwise
 *  - start()   Idempotently start the sidecar (no-op if already running)
 *  - stop()    Stop the sidecar and clean up the lock file
 *  - restart() Stop and start the sidecar
 *  - logs(n)   Return the last n log lines from the sidecar log file
 */
export const server = {
    status: () => defaultManager.status(),
    health: () => defaultManager.health(),
    start: () => defaultManager.start(),
    stop: () => defaultManager.stop(),
    restart: () => defaultManager.restart(),
    logs: (n: number = 50) => defaultManager.logs(n),
} as const;

const pmxt = {
    Exchange,
    Polymarket,
    Kalshi,
    KalshiDemo,
    Limitless,
    Myriad,
    Probable,
    Baozi,
    Opinion,
    Metaculus,
    Smarkets,
    PolymarketUS,
    GeminiTitan,
    Hyperliquid,
    SuiBets,
    Suibets,
    Rain,
    Hunch,
    Mock,
    Router,
    ServerManager,
    FeedClient,
    server,
    stopServer,
    restartServer,
    ...models,
    ...errors
};

export default pmxt;
