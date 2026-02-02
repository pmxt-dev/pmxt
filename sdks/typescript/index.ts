/**
 * PMXT - Unified Prediction Market API (TypeScript SDK)
 * 
 * A unified interface for interacting with multiple prediction market exchanges
 * (Kalshi, Polymarket) identically.
 * 
 * @example
 * ```typescript
 * import { Polymarket, Kalshi } from "pmxtjs";
 * 
 * // Initialize exchanges
 * const poly = new Polymarket();
 * const kalshi = new Kalshi();
 * 
 * // Search for markets
 * const markets = await poly.searchMarkets("Trump");
 * console.log(markets[0].title);
 * ```
 */


import { Exchange, Polymarket, Kalshi, Limitless } from "./pmxt/client.js";
import { ServerManager } from "./pmxt/server-manager.js";
import * as models from "./pmxt/models.js";

export { Exchange, Polymarket, Kalshi, Limitless } from "./pmxt/client.js";
export { ServerManager } from "./pmxt/server-manager.js";
export type * from "./pmxt/models.js";


const defaultManager = new ServerManager();

async function stopServer(): Promise<void> {
    await defaultManager.stop();
}

async function restartServer(): Promise<void> {
    await defaultManager.restart();
}

const pmxt = {
    Exchange,
    Polymarket,
    Kalshi,
    Limitless,
    ServerManager,
    stopServer,
    restartServer,
    ...models
};

export default pmxt;
