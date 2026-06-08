# pmxtjs - API Reference

A unified TypeScript SDK for interacting with multiple prediction market exchanges (Polymarket, Kalshi, Limitless)
identically.

## Installation

```bash
npm install pmxtjs
```

## Quick Start

```typescript
import pmxt from 'pmxtjs';

// Initialize exchanges (server starts automatically!)
const poly = new pmxt.Polymarket();
const kalshi = new pmxt.Kalshi();
const limitless = new pmxt.Limitless(); // Requires API key for authenticated operations

// Search for markets
const markets = await poly.fetchMarkets({ query: "Trump" });
console.log(markets[0].title);
```

> **Note**: This SDK automatically manages the PMXT sidecar server.

---

## Server Management

The SDK exposes a `pmxt.server` namespace for managing the background sidecar server. Use these commands for clearing state, resolving "port busy" errors, inspecting health, or tailing logs.

```typescript
import pmxt from 'pmxtjs';

await pmxt.server.status();    // snapshot: { running, pid, port, version, uptimeSeconds, lockFile }
await pmxt.server.health();    // boolean - true if /health responds ok
await pmxt.server.start();     // idempotent - no-op if already running
await pmxt.server.stop();      // stop the sidecar and clean up the lock file
await pmxt.server.restart();   // stop and start the sidecar
pmxt.server.logs(50);          // last N log lines from ~/.pmxt/server.log (default 50)
```

### `pmxt.server.status`

Returns a fresh object describing the sidecar state. Useful for diagnosing "is it running?" before issuing API calls.

```typescript
import pmxt from 'pmxtjs';
const info = await pmxt.server.status();
console.log(info.running, info.pid, info.port, info.uptimeSeconds);
```

### `pmxt.server.health`

Returns `true` if the sidecar's `/health` endpoint responds with status `ok`, otherwise `false`. Lighter than `status()` when you only need a boolean liveness check.

```typescript
import pmxt from 'pmxtjs';
if (!(await pmxt.server.health())) {
  await pmxt.server.restart();
}
```

### `pmxt.server.start`

Idempotently start the sidecar. Returns immediately if a healthy server is already running. Use this when you want to fail fast on startup rather than letting the first API call lazily boot the server.

```typescript
import pmxt from 'pmxtjs';
await pmxt.server.start();
```

### `pmxt.server.stop`

Stop the running sidecar and clean up its lock file.

```typescript
import pmxt from 'pmxtjs';
await pmxt.server.stop();
```

### `pmxt.server.restart`

Stop the sidecar (if running) and start a fresh one. Equivalent to `stop()` followed by `start()`.

```typescript
import pmxt from 'pmxtjs';
await pmxt.server.restart();
```

### `pmxt.server.logs`

Return the last `n` lines (default `50`) from the sidecar log file at `~/.pmxt/server.log`. Returns an empty array if no log file exists yet. Invaluable when the server is misbehaving and you need to see what it actually printed.

```typescript
import pmxt from 'pmxtjs';
for (const line of pmxt.server.logs(100)) {
  console.log(line);
}
```

---

## Methods

### `has`

HTTP verb for the endpoint (e.g. GET, POST). */


**Signature:**

```typescript
async has(): Promise<ExchangeHas>
```

**Parameters:**

- None

**Returns:** Promise<ExchangeHas> - Result

**Example:**

```typescript
await exchange.has()
```


---
### `implicitApi`

Override in subclasses to force specific capability values.


**Signature:**

```typescript
async implicitApi(): Promise<ImplicitApiMethodInfo[]>
```

**Parameters:**

- None

**Returns:** Promise<ImplicitApiMethodInfo[]> - Result

**Example:**

```typescript
await exchange.implicitApi()
```


---
### `loadMarkets`

Load and cache all markets from the exchange into `this.markets` and `this.marketsBySlug`.


**Signature:**

```typescript
async loadMarkets(reload: boolean): Promise<Record<string, UnifiedMarket>>
```

**Parameters:**

- `reload` (boolean): Force a fresh fetch from the API even if markets are already loaded

**Returns:** Promise<Record<string, UnifiedMarket>> - Dictionary of markets indexed by marketId

**Example:**

```typescript
await exchange.loadMarkets(true)
```


---
### `fetchMarkets`

Fetch markets with optional filtering, search, or slug lookup.


**Signature:**

```typescript
async fetchMarkets(params?: MarketFetchParams): Promise<UnifiedMarket[]>
```

**Parameters:**

- `params` (MarketFetchParams) - **Optional**: Optional parameters for filtering and search
  - `params.query` - Search keyword to filter markets
  - `params.slug` - Market slug/ticker for direct lookup
  - `params.limit` - Maximum number of results
  - `params.offset` - Pagination offset
  - `params.sort` - Sort order ('volume' | 'liquidity' | 'newest')
  - `params.searchIn` - Where to search ('title' | 'description' | 'both')

**Returns:** Promise<[UnifiedMarket](#unifiedmarket)[]> - Array of unified markets

**Example:**

```typescript
await exchange.fetchMarkets({ query: "Trump", slug: "will-trump-win", limit: 10 })
```

**Notes:**
ordering — exchanges may reorder or add markets between requests. For stable iteration
across pages, use `loadMarkets()` and paginate over `Object.values(exchange.markets)`.
Some exchanges (like Limitless) may only support status 'active' for search results.

---
### `fetchMarketsPaginated`

Fetch markets with cursor-based pagination backed by a stable in-memory snapshot.


**Signature:**

```typescript
async fetchMarketsPaginated(params?: { limit?: number; cursor?: string; filter?: MarketFilterCriteria }): Promise<PaginatedMarketsResult>
```

**Parameters:**

- `params` ({ limit?: number; cursor?: string; filter?: MarketFilterCriteria }) - **Optional**: params
  - `params.limit` - Page size (default: return all markets)
  - `params.cursor` - Opaque cursor returned by a previous call

**Returns:** Promise<[PaginatedMarketsResult](#paginatedmarketsresult)> - PaginatedMarketsResult with data, total, and optional nextCursor

**Example:**

```typescript
await exchange.fetchMarketsPaginated({ limit: 10, cursor: "..." })
```


---
### `fetchEventsPaginated`

Paginated variant of {@link fetchEvents}.


**Signature:**

```typescript
async fetchEventsPaginated(params?: { limit?: number; cursor?: string; filter?: EventFilterCriteria }): Promise<PaginatedEventsResult>
```

**Parameters:**

- `params` ({ limit?: number; cursor?: string; filter?: EventFilterCriteria }) - **Optional**: params
  - `params.limit` - Page size (default: return all events)
  - `params.cursor` - Opaque cursor returned by a previous call

**Returns:** Promise<[PaginatedEventsResult](#paginatedeventsresult)> - PaginatedEventsResult with data, total, and optional nextCursor

**Example:**

```typescript
await exchange.fetchEventsPaginated({ limit: 10, cursor: "..." })
```


---
### `fetchEvents`

Fetch events with optional keyword search.


**Signature:**

```typescript
async fetchEvents(params?: EventFetchParams): Promise<UnifiedEvent[]>
```

**Parameters:**

- `params` ([EventFetchParams](#eventfetchparams)) - **Optional**: Optional parameters for search and filtering
  - `params.query` - Search keyword to filter events. If omitted, returns top events by volume.
  - `params.limit` - Maximum number of results
  - `params.offset` - Pagination offset
  - `params.searchIn` - Where to search ('title' | 'description' | 'both')

**Returns:** Promise<[UnifiedEvent](#unifiedevent)[]> - Array of unified events

**Example:**

```typescript
await exchange.fetchEvents({ query: "Trump", limit: 10, offset: 0 })
```

**Notes:**
Some exchanges (like Limitless) may only support status 'active' for search results.

---
### `fetchSeries`

Fetch the recurring series (fourth tier above Event -> Market -> Outcome)


**Signature:**

```typescript
async fetchSeries(params?: SeriesFetchParams): Promise<UnifiedSeries[]>
```

**Parameters:**

- `params` (SeriesFetchParams) - **Optional**: params

**Returns:** Promise<[UnifiedSeries](#unifiedseries)[]> - Array of unified series. Always an array, including the singular-lookup case.

**Example:**

```typescript
await exchange.fetchSeries()
```


---
### `fetchMarket`

Fetch a single market by lookup parameters.


**Signature:**

```typescript
async fetchMarket(params?: MarketFetchParams): Promise<UnifiedMarket>
```

**Parameters:**

- `params` (MarketFetchParams) - **Optional**: Lookup parameters (marketId, outcomeId, slug, etc.)

**Returns:** Promise<[UnifiedMarket](#unifiedmarket)> - A single unified market

**Example:**

```typescript
await exchange.fetchMarket()
```


---
### `fetchEvent`

Fetch a single event by lookup parameters.


**Signature:**

```typescript
async fetchEvent(params?: EventFetchParams): Promise<UnifiedEvent>
```

**Parameters:**

- `params` ([EventFetchParams](#eventfetchparams)) - **Optional**: Lookup parameters (eventId, slug, query)

**Returns:** Promise<[UnifiedEvent](#unifiedevent)> - A single unified event

**Example:**

```typescript
await exchange.fetchEvent()
```


---
### `fetchOHLCV`

Fetch historical OHLCV (candlestick) price data for a specific market outcome.


**Signature:**

```typescript
async fetchOHLCV(outcomeId: string, params: OHLCVParams): Promise<PriceCandle[]>
```

**Parameters:**

- `outcomeId` (string): The Outcome ID (outcomeId). Use outcome.outcomeId, NOT market.marketId
- `params` ([OHLCVParams](#ohlcvparams)): OHLCV parameters including resolution (required)

**Returns:** Promise<[PriceCandle](#pricecandle)[]> - Array of price candles

**Example:**

```typescript
await exchange.fetchOHLCV("abc123", "...")
```

**Notes:**
**CRITICAL**: Use `outcome.outcomeId` (TS) / `outcome.outcome_id` (Python), not the market ID.
Polymarket: outcomeId is the CLOB Token ID. Kalshi: outcomeId is the Market Ticker.
Common resolutions: '1m' | '5m' | '15m' | '1h' | '6h' | '1d'. Arbitrary intervals (e.g. '30s', '120s', '3h') accepted by venues that support them.

---
### `fetchOrderBook`

Fetch the order book (bids/asks) for a specific outcome.


**Signature:**

```typescript
async fetchOrderBook(outcomeId: string, limit?: number, params?: FetchOrderBookParams): Promise<OrderBook>
```

**Parameters:**

- `outcomeId` (string): The Outcome ID (outcomeId) or market slug
- `limit` (number) - **Optional**: Max number of bid/ask levels to return. For range
- `params` ([FetchOrderBookParams](#fetchorderbookparams)) - **Optional**: Optional parameters:

**Returns:** Promise<[OrderBook](#orderbook)> - Order book with bids and asks. Returns OrderBook[] when

**Example:**

```typescript
await exchange.fetchOrderBook("abc123", { limit: 10, params: "..." })
```


---
### `fetchOrderBooks`

Batch variant of {@link fetchOrderBook}. Fetches order books for


**Signature:**

```typescript
async fetchOrderBooks(outcomeIds: string[]): Promise<Record<string, OrderBook>>
```

**Parameters:**

- `outcomeIds` (string[]): List of Outcome IDs (outcomeId). Each id must be in the

**Returns:** Promise<Record<string, OrderBook>> - A map keyed by the input id (preserving the caller's exact

**Example:**

```typescript
await exchange.fetchOrderBooks("12345")
```


---
### `fetchTrades`

Fetch raw trade history for a specific outcome.


**Signature:**

```typescript
async fetchTrades(outcomeId: string, params: TradesParams | HistoryFilterParams): Promise<Trade[]>
```

**Parameters:**

- `outcomeId` (string): The Outcome ID (outcomeId)
- `params` (TradesParams | HistoryFilterParams): Trade filter parameters

**Returns:** Promise<[Trade](#trade)[]> - Array of recent trades

**Example:**

```typescript
await exchange.fetchTrades("abc123", "...")
```

**Notes:**
Polymarket requires an API key for trade history. Use fetchOHLCV for public historical data.

---
### `createOrder`

Place a new order on the exchange.


**Signature:**

```typescript
async createOrder(params: CreateOrderParams): Promise<Order>
```

**Parameters:**

- `params` ([CreateOrderParams](#createorderparams)): Order parameters

**Returns:** Promise<[Order](#order)> - The created order

**Example:**

```typescript
await exchange.createOrder()
```


---
### `buildOrder`

Build an order payload without submitting it to the exchange.


**Signature:**

```typescript
async buildOrder(params: CreateOrderParams): Promise<BuiltOrder>
```

**Parameters:**

- `params` ([CreateOrderParams](#createorderparams)): Order parameters (same as createOrder)

**Returns:** Promise<[BuiltOrder](#builtorder)> - A BuiltOrder containing the exchange-native payload

**Example:**

```typescript
await exchange.buildOrder()
```


---
### `submitOrder`

Submit a pre-built order returned by buildOrder().


**Signature:**

```typescript
async submitOrder(built: BuiltOrder): Promise<Order>
```

**Parameters:**

- `built` ([BuiltOrder](#builtorder)): A BuiltOrder from buildOrder()

**Returns:** Promise<[Order](#order)> - The submitted order

**Example:**

```typescript
await exchange.submitOrder("...")
```


---
### `cancelOrder`

Cancel an existing open order.


**Signature:**

```typescript
async cancelOrder(orderId: string): Promise<Order>
```

**Parameters:**

- `orderId` (string): The order ID to cancel

**Returns:** Promise<[Order](#order)> - The cancelled order

**Example:**

```typescript
await exchange.cancelOrder("ord-001")
```


---
### `fetchOrder`

Fetch a specific order by ID.


**Signature:**

```typescript
async fetchOrder(orderId: string): Promise<Order>
```

**Parameters:**

- `orderId` (string): The order ID to look up

**Returns:** Promise<[Order](#order)> - The order details

**Example:**

```typescript
await exchange.fetchOrder("ord-001")
```


---
### `fetchOpenOrders`

Fetch all open orders, optionally filtered by market.


**Signature:**

```typescript
async fetchOpenOrders(marketId?: string): Promise<Order[]>
```

**Parameters:**

- `marketId` (string) - **Optional**: Optional market ID to filter by

**Returns:** Promise<[Order](#order)[]> - Array of open orders

**Example:**

```typescript
await exchange.fetchOpenOrders({ marketId: "12345" })
```


---
### `fetchPositions`

Fetch current user positions across all markets.


**Signature:**

```typescript
async fetchPositions(address?: string): Promise<Position[]>
```

**Parameters:**

- `address` (string) - **Optional**: Optional public wallet address

**Returns:** Promise<[Position](#position)[]> - Array of user positions

**Example:**

```typescript
await exchange.fetchPositions({ address: "0xabc..." })
```


---
### `fetchBalance`

Fetch account balances.


**Signature:**

```typescript
async fetchBalance(address?: string): Promise<Balance[]>
```

**Parameters:**

- `address` (string) - **Optional**: Optional public wallet address

**Returns:** Promise<[Balance](#balance)[]> - Array of account balances

**Example:**

```typescript
await exchange.fetchBalance({ address: "0xabc..." })
```


---
### `getExecutionPrice`

Calculate the volume-weighted average execution price for a given order size.


**Signature:**

```typescript
async getExecutionPrice(orderBook: OrderBook, side: 'buy' | 'sell', amount: number): Promise<number>
```

**Parameters:**

- `orderBook` ([OrderBook](#orderbook)): The current order book
- `side` ('buy' | 'sell'): 'buy' or 'sell'
- `amount` (number): Number of contracts to simulate

**Returns:** Promise<number> - Average execution price, or 0 if insufficient liquidity

**Example:**

```typescript
await exchange.getExecutionPrice("...", "buy", 50)
```


---
### `getExecutionPriceDetailed`

Calculate detailed execution price information including partial fill data.


**Signature:**

```typescript
async getExecutionPriceDetailed(orderBook: OrderBook, side: 'buy' | 'sell', amount: number): Promise<ExecutionPriceResult>
```

**Parameters:**

- `orderBook` ([OrderBook](#orderbook)): The current order book
- `side` ('buy' | 'sell'): 'buy' or 'sell'
- `amount` (number): Number of contracts to simulate

**Returns:** Promise<[ExecutionPriceResult](#executionpriceresult)> - Detailed execution result with price, filled amount, and fill status

**Example:**

```typescript
await exchange.getExecutionPriceDetailed("...", "buy", 50)
```


---
### `filterMarkets`

Filter a list of markets by criteria.


**Signature:**

```typescript
async filterMarkets(markets: UnifiedMarket[], criteria: string | MarketFilterCriteria | MarketFilterFunction): Promise<UnifiedMarket[]>
```

**Parameters:**

- `markets` ([UnifiedMarket](#unifiedmarket)[]): Array of markets to filter
- `criteria` (string | MarketFilterCriteria | MarketFilterFunction): Filter criteria: string (text search), object (structured), or function (predicate)

**Returns:** Promise<[UnifiedMarket](#unifiedmarket)[]> - Filtered array of markets

**Example:**

```typescript
await exchange.filterMarkets("...", "...")
```


---
### `filterEvents`

Filter a list of events by criteria.


**Signature:**

```typescript
async filterEvents(events: UnifiedEvent[], criteria: string | EventFilterCriteria | EventFilterFunction): Promise<UnifiedEvent[]>
```

**Parameters:**

- `events` ([UnifiedEvent](#unifiedevent)[]): Array of events to filter
- `criteria` (string | EventFilterCriteria | EventFilterFunction): Filter criteria: string (text search), object (structured), or function (predicate)

**Returns:** Promise<[UnifiedEvent](#unifiedevent)[]> - Filtered array of events

**Example:**

```typescript
await exchange.filterEvents("...", "...")
```


---
### `watchOrderBook`

Watch order book updates in real-time via WebSocket.


**Signature:**

```typescript
async watchOrderBook(outcomeId: string, limit?: number, params: Record<string, any>): Promise<OrderBook>
```

**Parameters:**

- `outcomeId` (string): The Outcome ID to watch
- `limit` (number) - **Optional**: Optional limit for orderbook depth
- `params` (Record<string, any>): Optional exchange-specific parameters

**Returns:** Promise<[OrderBook](#orderbook)> - Promise that resolves with the current orderbook state

**Example:**

```typescript
await exchange.watchOrderBook("abc123", "...", { limit: 10 })
```


---
### `watchOrderBooks`

Watch multiple order books simultaneously via WebSocket.


**Signature:**

```typescript
async watchOrderBooks(outcomeIds: string[], limit?: number, params: Record<string, any>): Promise<Record<string, OrderBook>>
```

**Parameters:**

- `outcomeIds` (string[]): Array of Outcome IDs to watch
- `limit` (number) - **Optional**: Optional limit for orderbook depth
- `params` (Record<string, any>): Optional exchange-specific parameters

**Returns:** Promise<Record<string, OrderBook>> - Promise that resolves with order books keyed by ID

**Example:**

```typescript
await exchange.watchOrderBooks("12345", "...", { limit: 10 })
```


---
### `unwatchOrderBook`

Unsubscribe from a previously watched order book stream.


**Signature:**

```typescript
async unwatchOrderBook(outcomeId: string): Promise<void>
```

**Parameters:**

- `outcomeId` (string): The Outcome ID to stop watching

**Returns:** Promise<void> - Result

**Example:**

```typescript
await exchange.unwatchOrderBook("abc123")
```


---
### `watchTrades`

Watch trade executions in real-time via WebSocket.


**Signature:**

```typescript
async watchTrades(outcomeId: string, address?: string, since?: number, limit?: number): Promise<Trade[]>
```

**Parameters:**

- `outcomeId` (string): The Outcome ID to watch
- `address` (string) - **Optional**: Public wallet address
- `since` (number) - **Optional**: Optional timestamp to filter trades from
- `limit` (number) - **Optional**: Optional limit for number of trades

**Returns:** Promise<[Trade](#trade)[]> - Promise that resolves with recent trades

**Example:**

```typescript
await exchange.watchTrades("abc123", { address: "0xabc...", since: "..." })
```


---
### `watchAddress`

Stream activity for a public wallet address


**Signature:**

```typescript
async watchAddress(address: string, types?: SubscriptionOption[]): Promise<SubscribedAddressSnapshot>
```

**Parameters:**

- `address` (string): Public wallet address to watch
- `types` (SubscriptionOption[]) - **Optional**: Subset of activity to watch (default: all types)

**Returns:** Promise<SubscribedAddressSnapshot> - Promise that resolves with the latest SubscribedAddressSnapshot snapshot

**Example:**

```typescript
await exchange.watchAddress("0xabc...", { types: "..." })
```


---
### `unwatchAddress`

Stop watching a previously registered wallet address and release its resource updates.


**Signature:**

```typescript
async unwatchAddress(address: string): Promise<void>
```

**Parameters:**

- `address` (string): Public wallet address to stop watching

**Returns:** Promise<void> - Result

**Example:**

```typescript
await exchange.unwatchAddress("0xabc...")
```


---
### `close`

Close all WebSocket connections and clean up resources.


**Signature:**

```typescript
async close(): Promise<void>
```

**Parameters:**

- None

**Returns:** Promise<void> - Result

**Example:**

```typescript
await exchange.close()
```


---
### `fetchMarketMatches`

Find the same or related market on other venues. Two modes:


**Signature:**

```typescript
async fetchMarketMatches(params?: FetchMarketMatchesParams): Promise<MatchResult[]>
```

**Parameters:**

- `params` ([FetchMarketMatchesParams](#fetchmarketmatchesparams)) - **Optional**: Match filter parameters

**Returns:** Promise<[MatchResult](#matchresult)[]> - Array of matched markets with relation and confidence

**Example:**

```typescript
await exchange.fetchMarketMatches()
```


---
### `fetchMatches`

fetchMatches


**Signature:**

```typescript
async fetchMatches(params: FetchMatchesParams): Promise<MatchResult[]>
```

**Parameters:**

- `params` (FetchMatchesParams): params

**Returns:** Promise<[MatchResult](#matchresult)[]> - Result

**Example:**

```typescript
await exchange.fetchMatches()
```


---
### `fetchEventMatches`

Find the same or related event on other venues. Two modes:


**Signature:**

```typescript
async fetchEventMatches(params?: FetchEventMatchesParams): Promise<EventMatchResult[]>
```

**Parameters:**

- `params` ([FetchEventMatchesParams](#fetcheventmatchesparams)) - **Optional**: Event match filter parameters

**Returns:** Promise<[EventMatchResult](#eventmatchresult)[]> - Array of matched events with market-level match details

**Example:**

```typescript
await exchange.fetchEventMatches()
```


---
### `compareMarketPrices`

Compare live prices for the same market across venues. Finds identity matches and returns side-by-side best bid/ask prices so you can spot price differences at a glance.


**Signature:**

```typescript
async compareMarketPrices(params: FetchMatchesParams): Promise<PriceComparison[]>
```

**Parameters:**

- `params` (FetchMatchesParams): Match filter parameters (uses relation: 'identity' internally)

**Returns:** Promise<[PriceComparison](#pricecomparison)[]> - Array of price comparisons across venues

**Example:**

```typescript
await exchange.compareMarketPrices()
```


---
### `fetchRelatedMarkets`

Find related markets across venues. Discovers subset/superset market relationships


**Signature:**

```typescript
async fetchRelatedMarkets(params: FetchMatchesParams): Promise<PriceComparison[]>
```

**Parameters:**

- `params` (FetchMatchesParams): Match filter parameters

**Returns:** Promise<[PriceComparison](#pricecomparison)[]> - Array of subset/superset matches with live prices

**Example:**

```typescript
await exchange.fetchRelatedMarkets()
```


---
### `fetchMatchedMarkets`

fetchMatchedMarkets


**Signature:**

```typescript
async fetchMatchedMarkets(params?: FetchMatchedMarketsParams): Promise<MatchedMarketPair[]>
```

**Parameters:**

- `params` ([FetchMatchedMarketsParams](#fetchmatchedmarketsparams)) - **Optional**: params

**Returns:** Promise<[MatchedMarketPair](#matchedmarketpair)[]> - Result

**Example:**

```typescript
await exchange.fetchMatchedMarkets()
```


---
### `fetchMatchedPrices`

fetchMatchedPrices


**Signature:**

```typescript
async fetchMatchedPrices(params?: FetchMatchedPricesParams): Promise<MatchedPricePair[]>
```

**Parameters:**

- `params` (FetchMatchedPricesParams) - **Optional**: Price comparison parameters (minDifference, category, limit)

**Returns:** Promise<MatchedPricePair[]> - Array of matched market pairs with prices from each venue

**Example:**

```typescript
await exchange.fetchMatchedPrices()
```


---
### `fetchHedges`

fetchHedges


**Signature:**

```typescript
async fetchHedges(params: FetchMatchesParams): Promise<PriceComparison[]>
```

**Parameters:**

- `params` (FetchMatchesParams): Match filter parameters

**Returns:** Promise<[PriceComparison](#pricecomparison)[]> - Array of subset/superset matches with live prices

**Example:**

```typescript
await exchange.fetchHedges()
```


---
### `fetchArbitrage`

fetchArbitrage


**Signature:**

```typescript
async fetchArbitrage(params?: FetchArbitrageParams): Promise<ArbitrageOpportunity[]>
```

**Parameters:**

- `params` ([FetchArbitrageParams](#fetcharbitrageparams)) - **Optional**: Arbitrage scan parameters (minSpread, category, limit)

**Returns:** Promise<[ArbitrageOpportunity](#arbitrageopportunity)[]> - Array of arbitrage opportunities sorted by spread

**Example:**

```typescript
await exchange.fetchArbitrage()
```


---
### `watchPrices`

Watch AMM price updates for a market address (Limitless only).

> **Note**: This method is only available on **limitless** exchange.


**Signature:**

```typescript
async watchPrices(marketAddress: string, callback: (data: any)): Promise<void>
```

**Parameters:**

- `marketAddress` (string): Market contract address
- `callback` ((data: any)): Callback for price updates

**Returns:** Promise<void> - Result

**Example:**

```typescript
await exchange.watchPrices("...", "...")
```


---
### `watchUserPositions`

Watch user positions in real-time (Limitless only).

> **Note**: This method is only available on **limitless** exchange.


**Signature:**

```typescript
async watchUserPositions(callback: (data: any)): Promise<void>
```

**Parameters:**

- `callback` ((data: any)): Callback for position updates

**Returns:** Promise<void> - Result

**Example:**

```typescript
await exchange.watchUserPositions("...")
```


---
### `watchUserTransactions`

Watch user transactions in real-time (Limitless only).

> **Note**: This method is only available on **limitless** exchange.


**Signature:**

```typescript
async watchUserTransactions(callback: (data: any)): Promise<void>
```

**Parameters:**

- `callback` ((data: any)): Callback for transaction updates

**Returns:** Promise<void> - Result

**Example:**

```typescript
await exchange.watchUserTransactions("...")
```


---
### `initAuth`

Initialize L2 API credentials for implicit API signing.

> **Note**: This method is only available on **polymarket** exchange.


**Signature:**

```typescript
async initAuth(): Promise<void>
```

**Parameters:**

- None

**Returns:** Promise<void> - Result

**Example:**

```typescript
await exchange.initAuth()
```


---
### `preWarmMarket`

Pre-warm the SDK's internal caches for a market outcome.

> **Note**: This method is only available on **polymarket** exchange.


**Signature:**

```typescript
async preWarmMarket(outcomeId: string): Promise<void>
```

**Parameters:**

- `outcomeId` (string): The CLOB Token ID for the outcome (use `outcome.outcomeId`)

**Returns:** Promise<void> - Result

**Example:**

```typescript
await exchange.preWarmMarket("abc123")
```


---
### `getEventById`

Fetch a single event by its numeric ID (Probable only).

> **Note**: This method is only available on **probable** exchange.


**Signature:**

```typescript
async getEventById(id: string): Promise<UnifiedEvent | null>
```

**Parameters:**

- `id` (string): The numeric event ID

**Returns:** Promise<UnifiedEvent | null> - The UnifiedEvent, or null if not found

**Example:**

```typescript
await exchange.getEventById("12345")
```


---
### `getEventBySlug`

Fetch a single event by its URL slug (Probable only).

> **Note**: This method is only available on **probable** exchange.


**Signature:**

```typescript
async getEventBySlug(slug: string): Promise<UnifiedEvent | null>
```

**Parameters:**

- `slug` (string): The event's URL slug (e.g. `"trump-2024-election"`)

**Returns:** Promise<UnifiedEvent | null> - The UnifiedEvent, or null if not found

**Example:**

```typescript
await exchange.getEventBySlug("will-trump-win")
```


---

## Complete Trading Workflow

```typescript
import pmxt from 'pmxtjs';

const exchange = new pmxt.Polymarket({
  privateKey: process.env.POLYMARKET_PRIVATE_KEY
});

// 1. Check balance
const [balance] = await exchange.fetchBalance();
console.log(`Available: $${balance.available}`);

// 2. Search for a market
const markets = await exchange.fetchMarkets({ query: 'Trump' });
const market = markets[0];
const outcome = market.yes;

console.log(market.title);
console.log(`Price: ${(outcome.price * 100).toFixed(1)}%`);

// 3. Place a limit order
const order = await exchange.createOrder({
  marketId: market.marketId,
  outcomeId: outcome.outcomeId,
  side: 'buy',
  type: 'limit',
  amount: 10,
  price: 0.50
});

console.log(`Order placed: ${order.id}`);

// 4. Check order status
const updatedOrder = await exchange.fetchOrder(order.id);
console.log(`Status: ${updatedOrder.status}`);
console.log(`Filled: ${updatedOrder.filled}/${updatedOrder.amount}`);

// 5. Cancel if needed
if (updatedOrder.status === 'open') {
  await exchange.cancelOrder(order.id);
  console.log('Order cancelled');
}

// 6. Check positions
const positions = await exchange.fetchPositions();
positions.forEach(pos => {
  console.log(`${pos.outcomeLabel}: ${pos.unrealizedPnL > 0 ? '+' : ''}$${pos.unrealizedPnL.toFixed(2)}`);
});
```

## Data Models

### `UnifiedMarket`



```typescript
interface UnifiedMarket {
marketId: string; // The unique identifier for this market
eventId: string; // Link to parent event
title: string; // The market title (e.g., "Will BTC close above $100k on Dec 31?").
description: string; // Long-form market description or resolution criteria.
slug: string; // URL-friendly slug for the market.
outcomes: MarketOutcome[]; // The possible outcomes for this market.
resolutionDate: string; // When the market is scheduled to resolve. Optional because some venues do not publish a cutoff for every market (e.g. Opinion categorical children) — emit `undefined` rather than coercing to epoch.
volume24h: number; // Trading volume over the past 24 hours (USD).
volume: number; // Total / Lifetime volume
liquidity: number; // Current market liquidity (USD).
openInterest: number; // Total value of outstanding contracts (USD).
url: string; // Canonical URL to view the market on the venue.
image: string; // Optional image URL for the market.
category: string; // Optional category label. Venue-defined — common values include "Sports", "Politics", "Crypto", "Economics", "Science", "Culture". Polymarket uses finer-grained categories like "Bitcoin", "Soccer", "Economic Policy"; Kalshi uses broader ones like "Sports" or "Mentions".
tags: string[]; // Optional list of tags. More granular than category — e.g. ["Crypto", "Crypto Prices", "Bitcoin"] or ["Politics", "Elections", "Trump"]. Tags vary by venue: Polymarket markets carry several, Kalshi typically one.
tickSize: number; // Minimum price increment (e.g., 0.01, 0.001)
status: string; // Venue-native lifecycle status (e.g. 'active', 'closed', 'archived').
contractAddress: string; // On-chain contract / condition identifier where applicable (Polymarket conditionId, etc.).
sourceMetadata: object; // Raw venue-specific metadata not captured by first-class fields (e.g. Kalshi series_ticker / series_title from the parent event, Polymarket series). Passed through verbatim so downstream consumers can recover anything the unified shape omits. Each venue populates what it has.
sourceExchange: string; // The exchange/venue this market originates from (e.g. 'polymarket', 'kalshi'). Populated by the Router.
yes: any; // Convenience accessor for the YES outcome on a binary market.
no: any; // Convenience accessor for the NO outcome on a binary market.
up: any; // Convenience accessor for the UP outcome on a binary market.
down: any; // Convenience accessor for the DOWN outcome on a binary market.
}
```

---
### `MarketOutcome`



```typescript
interface MarketOutcome {
outcomeId: string; // Outcome ID for trading operations (CLOB Token ID for Polymarket, Market Ticker for Kalshi)
marketId: string; // The market this outcome belongs to (set automatically when outcomes are built)
label: string; // Human-readable outcome label (e.g., "Yes", "No", candidate name).
price: number; // Probability between 0.0 and 1.0.
priceChange24h: number; // Change in price over the past 24 hours, as an absolute probability delta.
metadata: object; // Exchange-specific metadata (e.g., clobTokenId for Polymarket)
}
```

---
### `UnifiedEvent`

A grouped collection of related markets (e.g., "Who will be Fed Chair?" contains multiple candidate markets).

```typescript
interface UnifiedEvent {
id: string; // The unique identifier for this event.
title: string; // The event title (e.g., "Who will be Fed Chair?").
description: string; // Long-form event description.
slug: string; // URL-friendly slug for the event.
markets: UnifiedMarket[]; // Markets grouped under this event.
volume24h: number; // Trading volume over the past 24 hours (USD).
volume: number; // Total / Lifetime volume (sum across markets; undefined if no market provides it)
url: string; // Canonical URL to view the event on the venue.
image: string; // Optional image URL for the event.
category: string; // Optional category label. Venue-defined — common values include "Sports", "Politics", "Crypto", "Economics", "Science", "Culture". Polymarket uses finer-grained categories like "Bitcoin", "Soccer", "Economic Policy"; Kalshi uses broader ones like "Sports" or "Mentions".
tags: string[]; // Optional list of tags. More granular than category — e.g. ["Sports", "FIFA World Cup", "2026 FIFA World Cup"] or ["Politics", "Geopolitics", "Middle East"]. Tags vary by venue: Polymarket markets carry several, Kalshi typically one.
sourceMetadata: object; // Raw venue-specific metadata not captured by first-class fields (e.g. Kalshi series_ticker / series_title, Polymarket series). Passed through verbatim so downstream consumers can recover anything the unified shape omits. Each venue populates what it has.
sourceExchange: string; // The exchange/venue this event originates from (e.g. 'polymarket', 'kalshi'). Populated by the Router.
}
```

---
### `UnifiedSeries`

A recurring grouping of events on a venue — the fourth tier above Event -> Market -> Outcome. Examples: Kalshi `KXATPMATCH` (every ATP tennis match), Polymarket `wta` (every WTA match), Opinion's daily `collection`. Series only exists where the venue exposes a recurring-event concept; venues without one return an empty array from `fetchSeries`.

```typescript
interface UnifiedSeries {
id: string; // Stable venue-native series identifier (e.g. "KXATPMATCH" on Kalshi, "atp" on Polymarket Gamma, numeric Gamma id).
ticker: string; // Venue-native ticker, when distinct from `id`.
slug: string; // Venue-native slug.
title: string; // Human-readable series title (e.g. "ATP Match Winner", "WTA").
description: any; // Long-form series description.
recurrence: any; // Recurrence cadence the venue reports ('daily', 'weekly', 'annual', ...).
events: UnifiedEvent[]; // Child events. Populated when fetched by id; the list form usually omits this to keep payloads small.
url: any; // Canonical venue URL for the series.
image: any; // Venue-hosted image.
sourceExchange: string; // The exchange this series originates from. Populated by the Router.
sourceMetadata: object; // Raw venue-specific fields not promoted to first-class columns.
}
```

---
### `PriceCandle`



```typescript
interface PriceCandle {
timestamp: number; // Unix timestamp in milliseconds marking the start of the candle.
open: number; // Opening price for the interval (probability between 0.0 and 1.0).
high: number; // Highest price during the interval (probability between 0.0 and 1.0).
low: number; // Lowest price during the interval (probability between 0.0 and 1.0).
close: number; // Closing price for the interval (probability between 0.0 and 1.0).
volume: number; // Trading volume during the interval.
}
```

---
### `OrderBook`



```typescript
interface OrderBook {
bids: OrderLevel[]; // Order book bid levels, sorted by price descending.
asks: OrderLevel[]; // Order book ask levels, sorted by price ascending.
timestamp: number; // Unix timestamp in milliseconds when the snapshot was taken.
datetime: string; // ISO 8601 datetime string of the snapshot (CCXT-compatible).
}
```

---
### `OrderLevel`



```typescript
interface OrderLevel {
price: number; // 0.0 to 1.0 (probability)
size: number; // contracts/shares
}
```

---
### `Trade`



```typescript
interface Trade {
id: string; // The unique identifier for this trade.
timestamp: number; // Unix timestamp in milliseconds when the trade executed.
price: number; // Probability between 0.0 and 1.0.
amount: number; // Size of the trade in contracts/shares.
side: string; // Trade side from the taker's perspective.
outcomeId: string; // The outcome this trade is for (if known).
}
```

---
### `UserTrade`



```typescript
interface UserTrade {
id: string; // The unique identifier for this trade.
timestamp: number; // Unix timestamp in milliseconds when the trade executed.
price: number; // Probability between 0.0 and 1.0.
amount: number; // Size of the trade in contracts/shares.
side: string; // Trade side from the taker's perspective.
outcomeId: string; // The outcome this trade is for (if known).
orderId: string; // The order that produced this trade, if known.
}
```

---
### `Order`



```typescript
interface Order {
id: string; // The exchange-assigned order identifier.
marketId: string; // The market this order was placed on.
outcomeId: string; // The outcome this order was placed on.
side: string; // Order side: buy or sell.
type: string; // Order type: market (execute immediately) or limit (resting at a price).
price: number; // For limit orders
amount: number; // Size in contracts/shares
status: string; // Lifecycle status of the order.
filled: number; // Amount filled (USDC cost for buys, shares for sells)
filledShares: number; // Amount filled in shares/contracts (if different from USDC-denominated `filled`).
remaining: number; // Amount remaining
timestamp: number; // Unix timestamp in milliseconds when the order was created.
fee: number; // Fee paid for this order, if known.
feeRateBps: number; // Fee rate in basis points applied to this order (e.g. 100 = 1%).
}
```

---
### `Position`



```typescript
interface Position {
marketId: string; // The market this position is held in.
outcomeId: string; // The outcome this position is held in.
outcomeLabel: string; // Human-readable label for the outcome held.
size: number; // Positive for long, negative for short
entryPrice: number; // Average entry price for the position (probability between 0.0 and 1.0).
currentPrice: number; // Current mark price for the position (probability between 0.0 and 1.0).
unrealizedPnL: number; // Unrealized profit or loss at the current price (USD).
realizedPnL: number; // Realized profit or loss booked so far (USD).
}
```

---
### `Balance`



```typescript
interface Balance {
currency: string; // e.g., 'USDC'
total: number; // Total balance including funds locked in open orders.
available: number; // Balance available to trade (excludes locked funds).
locked: number; // In open orders
}
```

---
### `ExecutionPriceResult`



```typescript
interface ExecutionPriceResult {
price: number; // 
filledAmount: number; // 
fullyFilled: boolean; // 
}
```

---
### `PaginatedMarketsResult`

Shape returned by fetchMarketsPaginated

```typescript
interface PaginatedMarketsResult {
data: UnifiedMarket[]; // The page of unified markets
total: number; // Total number of markets in the snapshot
nextCursor: string; // Cursor to pass to the next call, or undefined if this is the last page
}
```

---
### `PaginatedEventsResult`

Shape returned by fetchEventsPaginated

```typescript
interface PaginatedEventsResult {
data: UnifiedEvent[]; // The page of unified events
total: number; // Total number of events in the snapshot
nextCursor: string; // Cursor to pass to the next call, or undefined if this is the last page
}
```

---
### `BuiltOrder`



```typescript
interface BuiltOrder {
exchange: string; // The exchange name this order was built for.
params: any; // The original params used to build this order.
signedOrder: object; // For CLOB exchanges (Polymarket): the EIP-712 signed order ready to POST to the exchange's order endpoint.
tx: object; // For on-chain AMM exchanges: the EVM transaction payload. Reserved for future exchanges; no current exchange populates this.
raw: any; // The raw, exchange-native payload. Always present.
}
```

---
### `MarketFilterCriteria`



```typescript
interface MarketFilterCriteria {
text: string; // 
searchIn: string[]; // Default: ['title']
volume24h: object; // 
volume: object; // Filter by total (lifetime) volume range
liquidity: object; // Filter by current liquidity range
openInterest: object; // Filter by open interest range
resolutionDate: object; // 
category: string; // Filter by category. Common values: "Sports", "Politics", "Crypto", "Bitcoin", "Soccer", "Economic Policy" (Polymarket) or "Sports", "Mentions" (Kalshi).
tags: string[]; // Match markets that have ANY of these tags. Examples: ["Crypto", "Crypto Prices"], ["Politics", "Elections"], ["Sports", "FIFA World Cup"].
price: object; // 
priceChange24h: object; // 
}
```

---
### `EventFilterCriteria`



```typescript
interface EventFilterCriteria {
text: string; // 
searchIn: string[]; // Default: ['title']
category: string; // Filter by category. Common values: "Sports", "Politics", "Crypto", "Bitcoin", "Soccer", "Economic Policy" (Polymarket) or "Sports", "Mentions" (Kalshi).
tags: string[]; // Match events that have ANY of these tags. Examples: ["Crypto"], ["Politics", "Geopolitics", "Middle East"], ["Sports", "FIFA World Cup"].
marketCount: object; // 
totalVolume: object; // Sum of market volumes
}
```

---
### `MatchResult`



```typescript
interface MatchResult {
market: UnifiedMarket; // 
sourceMarket: any; // The source market this was matched against. Present in browse mode (no marketId), absent in lookup mode.
relation: string; // 
confidence: number; // 
reasoning: any; // 
bestBid: any; // 
bestAsk: any; // 
}
```

---
### `EventMatchResult`



```typescript
interface EventMatchResult {
event: UnifiedEvent; // 
marketMatches: MatchResult[]; // 
}
```

---
### `PriceComparison`



```typescript
interface PriceComparison {
market: UnifiedMarket; // 
relation: string; // 
confidence: number; // 
reasoning: any; // 
bestBid: any; // 
bestAsk: any; // 
venue: string; // 
}
```

---
### `ArbitrageOpportunity`



```typescript
interface ArbitrageOpportunity {
marketA: UnifiedMarket; // 
marketB: UnifiedMarket; // 
spread: number; // 
buyVenue: string; // 
sellVenue: string; // 
buyPrice: number; // 
sellPrice: number; // 
relation: string; // The set-theoretic relation between the two markets (e.g. identity, subset).
confidence: number; // Match confidence score (0.0 to 1.0).
}
```

---
### `MatchedMarketPair`



```typescript
interface MatchedMarketPair {
marketA: UnifiedMarket; // 
marketB: UnifiedMarket; // 
priceDifference: number; // 
venueA: string; // 
venueB: string; // 
priceA: number; // 
priceB: number; // 
relation: string; // The set-theoretic relation between the two markets (e.g. identity, subset).
confidence: number; // Match confidence score (0.0 to 1.0).
reasoning: any; // Why the two markets were matched.
}
```

---
### `ExchangeCredentials`

Optional authentication credentials for exchange operations.

```typescript
interface ExchangeCredentials {
apiKey: string; // 
apiSecret: string; // Standard API secret for HMAC-authenticated exchanges
passphrase: string; // Standard API passphrase for HMAC-authenticated exchanges
apiToken: string; // Metaculus: `Authorization: Token <apiToken>` for higher rate limits
privateKey: string; // Required for Polymarket L1 auth
signatureType: any; // 0 = EOA, 1 = Poly Proxy, 2 = Gnosis Safe (Can also use 'eoa', 'polyproxy', 'gnosis_safe')
funderAddress: string; // The address funding the trades (defaults to signer address)
walletAddress: string; // 
baseUrl: string; // 
}
```

---
### `FeedTicker`

CCXT-compatible ticker with last trade price and metadata.

```typescript
interface FeedTicker {
symbol: string; // Trading pair symbol (e.g. BTC/USD)
info: any; // Raw provider-specific data
timestamp: number; // Unix timestamp in milliseconds
datetime: string; // 
high: number; // 
low: number; // 
bid: number; // 
bidVolume: number; // 
ask: number; // 
askVolume: number; // 
vwap: number; // 
open: number; // 
close: number; // 
last: number; // Last trade price
previousClose: number; // 
change: number; // 
percentage: number; // 
average: number; // 
quoteVolume: number; // 
baseVolume: number; // 
indexPrice: number; // 
markPrice: number; // 
}
```

---
### `FeedMarket`

CCXT-compatible market descriptor for a data feed.

```typescript
interface FeedMarket {
id: string; // 
symbol: string; // 
base: string; // 
quote: string; // 
active: boolean; // 
type: string; // 
info: any; // Provider-specific metadata
}
```

---
### `FeedOracleRound`

Chainlink oracle price round.

```typescript
interface FeedOracleRound {
feed: string; // Price feed pair (e.g. BTC/USD)
roundId: string; // 
answer: number; // Oracle price
startedAt: number; // 
updatedAt: number; // 
answeredInRound: string; // 
decimals: number; // 
description: string; // 
}
```

---

## Filter Parameters

### `BaseRequest`

Base request structure with optional credentials

```typescript
interface BaseRequest {
credentials?: ExchangeCredentials; // 
}
```

---
### `MarketFilterParams`



```typescript
interface MarketFilterParams {
limit?: number; // Maximum number of results to return
offset?: number; // Pagination offset — number of results to skip
sort?: string; // Sort order for results
status?: string; // Filter by market status (default: 'active', 'inactive' and 'closed' are interchangeable)
searchIn?: string; // Where to search (default: 'title')
query?: string; // For keyword search
slug?: string; // For slug/ticker lookup
marketId?: string; // Direct lookup by market ID
outcomeId?: string; // Reverse lookup -- find market containing this outcome
eventId?: string; // Find markets belonging to an event
page?: number; // For pagination (used by Limitless)
similarityThreshold?: number; // For semantic search (used by Limitless)
}
```

---
### `EventFetchParams`



```typescript
interface EventFetchParams {
query?: string; // For keyword search
limit?: number; // Maximum number of results to return
cursor?: string; // Opaque venue pagination cursor, where supported.
offset?: number; // Pagination offset — number of results to skip
sort?: string; // Sort order for results
status?: string; // Filter by event status (default: 'active', 'inactive' and 'closed' are interchangeable)
searchIn?: string; // Where to search (default: 'title')
eventId?: string; // Direct lookup by event ID
slug?: string; // Lookup by event slug
series?: string; // Filter events by their parent series. Accepts the venue-native series id / ticker / slug (e.g. Kalshi `"KXATPMATCH"`, Polymarket `"wta"`). Passed through to the vendor where supported, otherwise applied to `sourceMetadata` after fetch.
filter?: any; // Optional client-side filter applied after fetching
category?: string; // Filter by category. Each event belongs to a venue-assigned category such as "Sports", "Politics", "Crypto", "Bitcoin", "Soccer", "Economic Policy" (Polymarket) or "Sports", "Mentions" (Kalshi).
tags?: string[]; // Filter by tags. Returns events matching ANY of the provided tags. Tags are more specific than categories -- for example a "Politics" event might carry tags ["Politics", "Geopolitics", "Middle East", "Iran"]. Common tags include "Crypto", "Elections", "Fed Rates", "FIFA World Cup", "Trump".
}
```

---
### `HistoryFilterParams`

Deprecated - use OHLCVParams or TradesParams instead. Resolution is optional for backward compatibility.

```typescript
interface HistoryFilterParams {
resolution?: string; // Optional for backward compatibility
start?: string; // Start of the time range
end?: string; // End of the time range
limit?: number; // Maximum number of results to return
}
```

---
### `OHLCVParams`



```typescript
interface OHLCVParams {
resolution: string; // Required for candle aggregation
start?: string; // Start of the time range
end?: string; // End of the time range
limit?: number; // Maximum number of results to return
}
```

---
### `FetchOrderBookParams`



```typescript
interface FetchOrderBookParams {
side?: string; // Outcome side: 'yes' or 'no'. Required for exchanges like Limitless where the API returns a single orderbook per market.
outcome?: string; // Outcome alias: 'yes' or 'no', or an outcome token ID. When set, the first argument is treated as a market ID and this value selects which outcome's order book to fetch. Accepts the literal strings 'yes'/'no' (resolved via a market lookup) or a raw outcome token ID.
since?: number; // Unix timestamp (ms) — fetch a historical snapshot at or before this time, or the start of a range when combined with `until` (hosted API only).
until?: number; // Unix timestamp (ms) — end of a historical range. When combined with `since`, returns an array of reconstructed L2 OrderBook snapshots between `since` and `until` (hosted API only).
}
```

---
### `TradesParams`



```typescript
interface TradesParams {
start?: string; // Start of the time range
end?: string; // End of the time range
limit?: number; // Maximum number of results to return (max {@link MAX_TRADES_LIMIT})
}
```

---
### `CreateOrderParams`



```typescript
interface CreateOrderParams {
marketId: string; // The market to trade on.
outcomeId: string; // The outcome to trade.
side: string; // Order side: buy or sell.
type: string; // Order type: market (execute immediately) or limit (resting at a price).
amount: number; // Size of the order in contracts/shares.
price?: number; // Required for limit orders
fee?: number; // Optional fee rate (e.g., 1000 for 0.1%)
tickSize?: number; // Optional override for Limitless/Polymarket
negRisk?: boolean; // Optional override to skip neg-risk lookup (Polymarket)
onBehalfOf?: number; // Limitless delegated signing: profile ID to trade on behalf of
}
```

---
### `MyTradesParams`



```typescript
interface MyTradesParams {
outcomeId?: string; // filter to specific outcome/ticker
marketId?: string; // filter to specific market
since?: string; // Only return records after this date
until?: string; // Only return records before this date
limit?: number; // Maximum number of results to return
cursor?: string; // for Kalshi cursor pagination
}
```

---
### `OrderHistoryParams`



```typescript
interface OrderHistoryParams {
marketId?: string; // required for Limitless (slug)
since?: string; // Only return records after this date
until?: string; // Only return records before this date
limit?: number; // Maximum number of results to return
cursor?: string; // Opaque pagination cursor from a previous response
}
```

---
### `FetchMarketMatchesParams`



```typescript
interface FetchMarketMatchesParams {
query?: string; // Keyword search across matched market titles.
category?: string; // Filter matches by category.
market?: any; // Pass a UnifiedMarket directly instead of marketId/slug/url.
marketId?: string; // Lookup a specific market by ID. Omit for browse mode.
slug?: string; // 
url?: string; // 
relation?: string; // 
minConfidence?: number; // 
limit?: number; // 
includePrices?: boolean; // 
minDifference?: number; // Minimum price difference between venues. Browse mode only.
sort?: string; // Sort order. Browse mode only.
}
```

---
### `FetchEventMatchesParams`



```typescript
interface FetchEventMatchesParams {
query?: string; // Keyword search across matched event titles.
category?: string; // Filter matches by category.
event?: any; // Pass a UnifiedEvent directly instead of eventId/slug.
eventId?: string; // Lookup a specific event by ID. Omit for browse mode.
slug?: string; // 
relation?: string; // 
minConfidence?: number; // 
limit?: number; // 
includePrices?: boolean; // 
}
```

---
### `FetchArbitrageParams`



```typescript
interface FetchArbitrageParams {
minSpread?: number; // 
category?: string; // 
limit?: number; // 
relations?: string[]; // Comma-separated relation types to include (default: 'identity').
}
```

---
### `FetchMatchedMarketsParams`



```typescript
interface FetchMatchedMarketsParams {
minDifference?: number; // 
category?: string; // 
limit?: number; // 
relations?: string[]; // Comma-separated relation types to include (default: 'identity').
}
```

---

## Low-Level API Reference

Advanced: call exchange-specific REST endpoints directly via `exchange.callApi(name, params)`.

```typescript
// Example
const result = await exchange.callApi('operationName', { param: 'value' });
```

### Polymarket

| `callApi()` name | Method | Path | Summary | Auth |
|-----------------|--------|------|---------|------|
| `getGammaStatus` | `GET` | `/status` | Gamma API Health check | Public |
| `listTeams` | `GET` | `/teams` | List teams | Public |
| `getSportsMetadata` | `GET` | `/sports` | Get sports metadata information | Public |
| `getSportsMarketTypes` | `GET` | `/sports/market-types` | Get valid sports market types | Public |
| `listTags` | `GET` | `/tags` | List tags | Public |
| `getTag` | `GET` | `/tags/{id}` | Get tag by id | Public |
| `getRelatedTagsById` | `GET` | `/tags/{id}/related-tags` | Get related tags (relationships) by tag id | Public |
| `getRelatedTagsBySlug` | `GET` | `/tags/slug/{slug}/related-tags` | Get related tags (relationships) by tag slug | Public |
| `getTagsRelatedToATagById` | `GET` | `/tags/{id}/related-tags/tags` | Get tags related to a tag id | Public |
| `getTagsRelatedToATagBySlug` | `GET` | `/tags/slug/{slug}/related-tags/tags` | Get tags related to a tag slug | Public |
| `listEvents` | `GET` | `/events` | List events | Public |
| `getEvent` | `GET` | `/events/{id}` | Get event by id | Public |
| `getEventTags` | `GET` | `/events/{id}/tags` | Get event tags | Public |
| `getEventBySlug` | `GET` | `/events/slug/{slug}` | Get event by slug | Public |
| `listMarkets` | `GET` | `/markets` | List markets | Public |
| `getMarket` | `GET` | `/markets/{id}` | Get market by id | Public |
| `getMarketTags` | `GET` | `/markets/{id}/tags` | Get market tags by id | Public |
| `getMarketBySlug` | `GET` | `/markets/slug/{slug}` | Get market by slug | Public |
| `listSeries` | `GET` | `/series` | List series | Public |
| `getSeries` | `GET` | `/series/{id}` | Get series by id | Public |
| `listComments` | `GET` | `/comments` | List comments | Public |
| `getCommentsById` | `GET` | `/comments/{id}` | Get comments by comment id | Public |
| `getPublicProfile` | `GET` | `/public-profile` | Get public profile by wallet address | Public |
| `publicSearch` | `GET` | `/public-search` | Search markets, events, and profiles | Public |
| `getBook` | `GET` | `/book` | Get order book summary | Public |
| `postBooks` | `POST` | `/books` | Get multiple order books summaries | Public |
| `getPrice` | `GET` | `/price` | Get market price | Public |
| `getPrices` | `GET` | `/prices` | Get multiple market prices | Public |
| `postPrices` | `POST` | `/prices` | Get multiple market prices by request | Public |
| `getMidpoint` | `GET` | `/midpoint` | Get midpoint price | Public |
| `postSpreads` | `POST` | `/spreads` | Get bid-ask spreads | Public |
| `getPricesHistory` | `GET` | `/prices-history` | Get price history for a traded token | Public |
| `getMarketsByToken` | `GET` | `/markets-by-token/{token_id}` | Get market by token | Public |
| `postAuthApiKey` | `POST` | `/auth/api-key` | Create API Key | Required |
| `getAuthDeriveApiKey` | `GET` | `/auth/derive-api-key` | Derive API Key | Required |
| `postOrder` | `POST` | `/order` | Place Single Order | Required |
| `deleteOrder` | `DELETE` | `/order` | Cancel Single Order | Required |
| `postOrders` | `POST` | `/orders` | Place Multiple Orders (Batch) | Required |
| `deleteOrders` | `DELETE` | `/orders` | Cancel Multiple Orders | Required |
| `deleteCancelAll` | `DELETE` | `/cancel-all` | Cancel All Orders | Required |
| `deleteCancelMarketOrders` | `DELETE` | `/cancel-market-orders` | Cancel Market Orders | Required |
| `getDataOrder` | `GET` | `/data/order/{id}` | Get Order | Required |
| `getDataOrders` | `GET` | `/data/orders` | Get Active Orders | Required |
| `getDataTrades` | `GET` | `/data/trades` | Get Trades | Required |
| `getOrderScoring` | `GET` | `/order-scoring` | Check Order Reward Scoring | Required |
| `postOrdersScoring` | `POST` | `/orders-scoring` | Check Multiple Orders Scoring | Required |
| `updateBalanceAllowance` | `GET` | `/balance-allowance/update` | Update balance and allowance cache | Required |
| `getGeoblock` | `GET` | `/geoblock` | Check Geoblock Status | Public |
| `getDataApiHealth` | `GET` | `/` | Data API Health check | Public |
| `getPositions` | `GET` | `/positions` | Get current positions for a user | Public |
| `getV1AccountingSnapshot` | `GET` | `/v1/accounting/snapshot` | Download an accounting snapshot (ZIP of CSVs) | Public |
| `getTraded` | `GET` | `/traded` | Get total markets a user has traded | Public |
| `getOi` | `GET` | `/oi` | Get open interest | Public |
| `getLiveVolume` | `GET` | `/live-volume` | Get live volume for an event | Public |
| `getTrades` | `GET` | `/trades` | Get trades for a user or markets | Public |
| `getActivity` | `GET` | `/activity` | Get user activity | Public |
| `getHolders` | `GET` | `/holders` | Get top holders for markets | Public |
| `getValue` | `GET` | `/value` | Get total value of a user's positions | Public |
| `getClosedPositions` | `GET` | `/closed-positions` | Get closed positions for a user | Public |
| `getV1MarketPositions` | `GET` | `/v1/market-positions` | Get positions for a market | Public |
| `getV1Leaderboard` | `GET` | `/v1/leaderboard` | Get trader leaderboard rankings | Public |
| `getV1BuildersLeaderboard` | `GET` | `/v1/builders/leaderboard` | Get aggregated builder leaderboard | Public |

#### Endpoint Details

##### `getGammaStatus`

**GET** `/status`

Gamma API Health check


---
##### `listTeams`

**GET** `/teams`

List teams

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `league` (query, array)
- `name` (query, array)
- `abbreviation` (query, array)

---
##### `getSportsMetadata`

**GET** `/sports`

Get sports metadata information


---
##### `getSportsMarketTypes`

**GET** `/sports/market-types`

Get valid sports market types


---
##### `listTags`

**GET** `/tags`

List tags

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `include_template` (query, boolean)
- `is_carousel` (query, boolean)

---
##### `getTag`

**GET** `/tags/{id}`

Get tag by id

**Parameters:**
- `` (, string)
- `include_template` (query, boolean)

---
##### `getRelatedTagsById`

**GET** `/tags/{id}/related-tags`

Get related tags (relationships) by tag id

**Parameters:**
- `` (, string)
- `omit_empty` (query, boolean)
- `status` (query, string) — enum: `active,closed,all`

---
##### `getRelatedTagsBySlug`

**GET** `/tags/slug/{slug}/related-tags`

Get related tags (relationships) by tag slug

**Parameters:**
- `` (, string)
- `omit_empty` (query, boolean)
- `status` (query, string) — enum: `active,closed,all`

---
##### `getTagsRelatedToATagById`

**GET** `/tags/{id}/related-tags/tags`

Get tags related to a tag id

**Parameters:**
- `` (, string)
- `omit_empty` (query, boolean)
- `status` (query, string) — enum: `active,closed,all`

---
##### `getTagsRelatedToATagBySlug`

**GET** `/tags/slug/{slug}/related-tags/tags`

Get tags related to a tag slug

**Parameters:**
- `` (, string)
- `omit_empty` (query, boolean)
- `status` (query, string) — enum: `active,closed,all`

---
##### `listEvents`

**GET** `/events`

List events

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `id` (query, array)
- `tag_id` (query, integer)
- `exclude_tag_id` (query, array)
- `slug` (query, array)
- `tag_slug` (query, string)
- `related_tags` (query, boolean)
- `active` (query, boolean)
- `archived` (query, boolean)
- `featured` (query, boolean)
- `cyom` (query, boolean)
- `include_chat` (query, boolean)
- `include_template` (query, boolean)
- `recurrence` (query, string)
- `closed` (query, boolean)
- `liquidity_min` (query, number)
- `liquidity_max` (query, number)
- `volume_min` (query, number)
- `volume_max` (query, number)
- `start_date_min` (query, string)
- `start_date_max` (query, string)
- `end_date_min` (query, string)
- `end_date_max` (query, string)

---
##### `getEvent`

**GET** `/events/{id}`

Get event by id

**Parameters:**
- `` (, string)
- `include_chat` (query, boolean)
- `include_template` (query, boolean)

---
##### `getEventTags`

**GET** `/events/{id}/tags`

Get event tags

**Parameters:**
- `` (, string)

---
##### `getEventBySlug`

**GET** `/events/slug/{slug}`

Get event by slug

**Parameters:**
- `` (, string)
- `include_chat` (query, boolean)
- `include_template` (query, boolean)

---
##### `listMarkets`

**GET** `/markets`

List markets

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `id` (query, array)
- `slug` (query, array)
- `clob_token_ids` (query, array)
- `condition_ids` (query, array)
- `market_maker_address` (query, array)
- `liquidity_num_min` (query, number)
- `liquidity_num_max` (query, number)
- `volume_num_min` (query, number)
- `volume_num_max` (query, number)
- `start_date_min` (query, string)
- `start_date_max` (query, string)
- `end_date_min` (query, string)
- `end_date_max` (query, string)
- `tag_id` (query, integer)
- `related_tags` (query, boolean)
- `cyom` (query, boolean)
- `uma_resolution_status` (query, string)
- `game_id` (query, string)
- `sports_market_types` (query, array)
- `rewards_min_size` (query, number)
- `question_ids` (query, array)
- `include_tag` (query, boolean)
- `closed` (query, boolean)

---
##### `getMarket`

**GET** `/markets/{id}`

Get market by id

**Parameters:**
- `` (, string)
- `include_tag` (query, boolean)

---
##### `getMarketTags`

**GET** `/markets/{id}/tags`

Get market tags by id

**Parameters:**
- `` (, string)

---
##### `getMarketBySlug`

**GET** `/markets/slug/{slug}`

Get market by slug

**Parameters:**
- `` (, string)
- `include_tag` (query, boolean)

---
##### `listSeries`

**GET** `/series`

List series

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `slug` (query, array)
- `categories_ids` (query, array)
- `categories_labels` (query, array)
- `closed` (query, boolean)
- `include_chat` (query, boolean)
- `recurrence` (query, string)

---
##### `getSeries`

**GET** `/series/{id}`

Get series by id

**Parameters:**
- `` (, string)
- `include_chat` (query, boolean)

---
##### `listComments`

**GET** `/comments`

List comments

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `parent_entity_type` (query, string) — enum: `Event,Series,market`
- `parent_entity_id` (query, integer)
- `get_positions` (query, boolean)
- `holders_only` (query, boolean)

---
##### `getCommentsById`

**GET** `/comments/{id}`

Get comments by comment id

**Parameters:**
- `id` (path, integer) **required**
- `get_positions` (query, boolean)

---
##### `getPublicProfile`

**GET** `/public-profile`

Get public profile by wallet address

**Parameters:**
- `address` (query, string) **required** — The wallet address (proxy wallet or user address)

---
##### `publicSearch`

**GET** `/public-search`

Search markets, events, and profiles

**Parameters:**
- `q` (query, string) **required**
- `cache` (query, boolean)
- `events_status` (query, string)
- `limit_per_type` (query, integer)
- `page` (query, integer)
- `events_tag` (query, array)
- `keep_closed_markets` (query, integer)
- `sort` (query, string)
- `ascending` (query, boolean)
- `search_tags` (query, boolean)
- `search_profiles` (query, boolean)
- `recurrence` (query, string)
- `exclude_tag_id` (query, array)
- `optimized` (query, boolean)

---
##### `getBook`

**GET** `/book`

Get order book summary

**Parameters:**
- `token_id` (query, string) **required**

---
##### `postBooks`

**POST** `/books`

Get multiple order books summaries


---
##### `getPrice`

**GET** `/price`

Get market price

**Parameters:**
- `token_id` (query, string) **required**
- `side` (query, string) **required** — enum: `BUY,SELL`

---
##### `getPrices`

**GET** `/prices`

Get multiple market prices


---
##### `postPrices`

**POST** `/prices`

Get multiple market prices by request


---
##### `getMidpoint`

**GET** `/midpoint`

Get midpoint price

**Parameters:**
- `token_id` (query, string) **required**

---
##### `postSpreads`

**POST** `/spreads`

Get bid-ask spreads


---
##### `getPricesHistory`

**GET** `/prices-history`

Get price history for a traded token

**Parameters:**
- `market` (query, string) **required**
- `startTs` (query, number)
- `endTs` (query, number)
- `interval` (query, string) — enum: `1m,1w,1d,6h,1h,max`
- `fidelity` (query, number)

---
##### `getMarketsByToken`

**GET** `/markets-by-token/{token_id}`

Get market by token

**Parameters:**
- `token_id` (path, string) **required**

---
##### `postAuthApiKey`

**POST** `/auth/api-key`

Create API Key *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `getAuthDeriveApiKey`

**GET** `/auth/derive-api-key`

Derive API Key *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `postOrder`

**POST** `/order`

Place Single Order *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `deleteOrder`

**DELETE** `/order`

Cancel Single Order *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `postOrders`

**POST** `/orders`

Place Multiple Orders (Batch) *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `deleteOrders`

**DELETE** `/orders`

Cancel Multiple Orders *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `deleteCancelAll`

**DELETE** `/cancel-all`

Cancel All Orders *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `deleteCancelMarketOrders`

**DELETE** `/cancel-market-orders`

Cancel Market Orders *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `getDataOrder`

**GET** `/data/order/{id}`

Get Order *(Auth required)*

**Parameters:**
- `` (, string)
- `id` (path, string) **required**

---
##### `getDataOrders`

**GET** `/data/orders`

Get Active Orders *(Auth required)*

**Parameters:**
- `` (, string)
- `id` (query, string)
- `market` (query, string)
- `asset_id` (query, string)

---
##### `getDataTrades`

**GET** `/data/trades`

Get Trades *(Auth required)*

**Parameters:**
- `` (, string)
- `id` (query, string)
- `market` (query, string)
- `maker` (query, string)
- `taker` (query, string)
- `before` (query, string)
- `after` (query, string)

---
##### `getOrderScoring`

**GET** `/order-scoring`

Check Order Reward Scoring *(Auth required)*

**Parameters:**
- `` (, string)
- `orderId` (query, string) **required**

---
##### `postOrdersScoring`

**POST** `/orders-scoring`

Check Multiple Orders Scoring *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `updateBalanceAllowance`

**GET** `/balance-allowance/update`

Update balance and allowance cache *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `getGeoblock`

**GET** `/geoblock`

Check Geoblock Status


---
##### `getDataApiHealth`

**GET** `/`

Data API Health check


---
##### `getPositions`

**GET** `/positions`

Get current positions for a user

**Parameters:**
- `user` (query, string) **required** — User address (required)
- `market` (query, array) — Comma-separated list of condition IDs. Mutually exclusive with eventId.
- `eventId` (query, array) — Comma-separated list of event IDs. Mutually exclusive with market.
- `sizeThreshold` (query, number)
- `redeemable` (query, boolean)
- `mergeable` (query, boolean)
- `limit` (query, integer)
- `offset` (query, integer)
- `sortBy` (query, string) — enum: `CURRENT,INITIAL,TOKENS,CASHPNL,PERCENTPNL,TITLE,RESOLVING,PRICE,AVGPRICE`
- `sortDirection` (query, string) — enum: `ASC,DESC`
- `title` (query, string)

---
##### `getV1AccountingSnapshot`

**GET** `/v1/accounting/snapshot`

Download an accounting snapshot (ZIP of CSVs)

**Parameters:**
- `user` (query, string) **required** — User address (0x-prefixed)

---
##### `getTraded`

**GET** `/traded`

Get total markets a user has traded

**Parameters:**
- `user` (query, string) **required**

---
##### `getOi`

**GET** `/oi`

Get open interest

**Parameters:**
- `market` (query, array)

---
##### `getLiveVolume`

**GET** `/live-volume`

Get live volume for an event

**Parameters:**
- `id` (query, integer) **required**

---
##### `getTrades`

**GET** `/trades`

Get trades for a user or markets

**Parameters:**
- `limit` (query, integer)
- `offset` (query, integer)
- `takerOnly` (query, boolean)
- `filterType` (query, string) — Must be provided together with filterAmount. — enum: `CASH,TOKENS`
- `filterAmount` (query, number) — Must be provided together with filterType.
- `market` (query, array) — Comma-separated list of condition IDs. Mutually exclusive with eventId.
- `eventId` (query, array) — Comma-separated list of event IDs. Mutually exclusive with market.
- `user` (query, string)
- `side` (query, string) — enum: `BUY,SELL`

---
##### `getActivity`

**GET** `/activity`

Get user activity

**Parameters:**
- `limit` (query, integer)
- `offset` (query, integer)
- `user` (query, string) **required**
- `market` (query, array) — Comma-separated list of condition IDs. Mutually exclusive with eventId.
- `eventId` (query, array) — Comma-separated list of event IDs. Mutually exclusive with market.
- `type` (query, array)
- `start` (query, integer)
- `end` (query, integer)
- `sortBy` (query, string) — enum: `TIMESTAMP,TOKENS,CASH`
- `sortDirection` (query, string) — enum: `ASC,DESC`
- `side` (query, string) — enum: `BUY,SELL`

---
##### `getHolders`

**GET** `/holders`

Get top holders for markets

**Parameters:**
- `limit` (query, integer) — Maximum number of holders to return per token. Capped at 20.
- `market` (query, array) **required** — Comma-separated list of condition IDs.
- `minBalance` (query, integer)

---
##### `getValue`

**GET** `/value`

Get total value of a user's positions

**Parameters:**
- `user` (query, string) **required**
- `market` (query, array)

---
##### `getClosedPositions`

**GET** `/closed-positions`

Get closed positions for a user

**Parameters:**
- `user` (query, string) **required** — The address of the user in question
- `market` (query, array) — The conditionId of the market in question. Supports multiple csv separated values. Cannot be used with the eventId param.
- `title` (query, string) — Filter by market title
- `eventId` (query, array) — The event id of the event in question. Supports multiple csv separated values. Returns positions for all markets for those event ids. Cannot be used with the market param.
- `limit` (query, integer) — The max number of positions to return
- `offset` (query, integer) — The starting index for pagination
- `sortBy` (query, string) — The sort criteria — enum: `REALIZEDPNL,TITLE,PRICE,AVGPRICE,TIMESTAMP`
- `sortDirection` (query, string) — The sort direction — enum: `ASC,DESC`

---
##### `getV1MarketPositions`

**GET** `/v1/market-positions`

Get positions for a market

**Parameters:**
- `market` (query, string) **required** — The condition ID of the market to query positions for
- `user` (query, string) — Filter to a single user by proxy wallet address
- `status` (query, string) — Filter positions by status.
- `OPEN` — Only positions with size > 0.01
- `CLOSED` — Only positions with size <= 0.01
- `ALL` — All positions regardless of size
 — enum: `OPEN,CLOSED,ALL`
- `sortBy` (query, string) — Sort positions by:
- `TOKENS` — Position size (number of tokens)
- `CASH_PNL` — Unrealized cash PnL
- `REALIZED_PNL` — Realized PnL
- `TOTAL_PNL` — Total PnL (cash_pnl + realized_pnl)
 — enum: `TOKENS,CASH_PNL,REALIZED_PNL,TOTAL_PNL`
- `sortDirection` (query, string) — enum: `ASC,DESC`
- `limit` (query, integer) — Max number of positions to return per outcome token
- `offset` (query, integer) — Pagination offset per outcome token

---
##### `getV1Leaderboard`

**GET** `/v1/leaderboard`

Get trader leaderboard rankings

**Parameters:**
- `category` (query, string) — Market category for the leaderboard — enum: `OVERALL,POLITICS,SPORTS,CRYPTO,CULTURE,MENTIONS,WEATHER,ECONOMICS,TECH,FINANCE`
- `timePeriod` (query, string) — Time period for leaderboard results — enum: `DAY,WEEK,MONTH,ALL`
- `orderBy` (query, string) — Leaderboard ordering criteria — enum: `PNL,VOL`
- `limit` (query, integer) — Max number of leaderboard traders to return
- `offset` (query, integer) — Starting index for pagination
- `user` (query, string) — Limit leaderboard to a single user by address
- `userName` (query, string) — Limit leaderboard to a single username

---
##### `getV1BuildersLeaderboard`

**GET** `/v1/builders/leaderboard`

Get aggregated builder leaderboard

**Parameters:**
- `timePeriod` (query, string) — The time period to aggregate results over.
 — enum: `DAY,WEEK,MONTH,ALL`
- `limit` (query, string)

---
### Kalshi

| `callApi()` name | Method | Path | Summary | Auth |
|-----------------|--------|------|---------|------|
| `GetHistoricalCutoff` | `GET` | `/historical/cutoff` | Get Historical Cutoff Timestamps | Public |
| `GetMarketCandlesticksHistorical` | `GET` | `/historical/markets/{ticker}/candlesticks` | Get Historical Market Candlesticks | Public |
| `GetFillsHistorical` | `GET` | `/historical/fills` | Get Historical Fills | Required |
| `GetHistoricalOrders` | `GET` | `/historical/orders` | Get Historical Orders | Required |
| `GetHistoricalMarkets` | `GET` | `/historical/markets` | Get Historical Markets | Public |
| `GetHistoricalMarket` | `GET` | `/historical/markets/{ticker}` | Get Historical Market | Public |
| `GetExchangeStatus` | `GET` | `/exchange/status` | Get Exchange Status | Public |
| `GetExchangeAnnouncements` | `GET` | `/exchange/announcements` | Get Exchange Announcements | Public |
| `GetSeriesFeeChanges` | `GET` | `/series/fee_changes` | Get Series Fee Changes | Public |
| `GetExchangeSchedule` | `GET` | `/exchange/schedule` | Get Exchange Schedule | Public |
| `GetUserDataTimestamp` | `GET` | `/exchange/user_data_timestamp` | Get User Data Timestamp | Public |
| `GetOrders` | `GET` | `/portfolio/orders` | Get Orders | Required |
| `CreateOrder` | `POST` | `/portfolio/orders` | Create Order | Required |
| `GetOrder` | `GET` | `/portfolio/orders/{order_id}` | Get Order | Required |
| `CancelOrder` | `DELETE` | `/portfolio/orders/{order_id}` | Cancel Order | Required |
| `BatchCreateOrders` | `POST` | `/portfolio/orders/batched` | Batch Create Orders | Required |
| `BatchCancelOrders` | `DELETE` | `/portfolio/orders/batched` | Batch Cancel Orders | Required |
| `AmendOrder` | `POST` | `/portfolio/orders/{order_id}/amend` | Amend Order | Required |
| `DecreaseOrder` | `POST` | `/portfolio/orders/{order_id}/decrease` | Decrease Order | Required |
| `GetOrderQueuePositions` | `GET` | `/portfolio/orders/queue_positions` | Get Queue Positions for Orders | Required |
| `GetOrderQueuePosition` | `GET` | `/portfolio/orders/{order_id}/queue_position` | Get Order Queue Position | Required |
| `GetOrderGroups` | `GET` | `/portfolio/order_groups` | Get Order Groups | Required |
| `CreateOrderGroup` | `POST` | `/portfolio/order_groups/create` | Create Order Group | Required |
| `GetOrderGroup` | `GET` | `/portfolio/order_groups/{order_group_id}` | Get Order Group | Required |
| `DeleteOrderGroup` | `DELETE` | `/portfolio/order_groups/{order_group_id}` | Delete Order Group | Required |
| `ResetOrderGroup` | `PUT` | `/portfolio/order_groups/{order_group_id}/reset` | Reset Order Group | Required |
| `TriggerOrderGroup` | `PUT` | `/portfolio/order_groups/{order_group_id}/trigger` | Trigger Order Group | Required |
| `UpdateOrderGroupLimit` | `PUT` | `/portfolio/order_groups/{order_group_id}/limit` | Update Order Group Limit | Required |
| `GetBalance` | `GET` | `/portfolio/balance` | Get Balance | Required |
| `CreateSubaccount` | `POST` | `/portfolio/subaccounts` | Create Subaccount | Required |
| `ApplySubaccountTransfer` | `POST` | `/portfolio/subaccounts/transfer` | Transfer Between Subaccounts | Required |
| `GetSubaccountBalances` | `GET` | `/portfolio/subaccounts/balances` | Get All Subaccount Balances | Required |
| `GetSubaccountTransfers` | `GET` | `/portfolio/subaccounts/transfers` | Get Subaccount Transfers | Required |
| `GetPositions` | `GET` | `/portfolio/positions` | Get Positions | Required |
| `GetSettlements` | `GET` | `/portfolio/settlements` | Get Settlements | Required |
| `GetPortfolioRestingOrderTotalValue` | `GET` | `/portfolio/summary/total_resting_order_value` | Get Total Resting Order Value | Required |
| `GetFills` | `GET` | `/portfolio/fills` | Get Fills | Required |
| `GetApiKeys` | `GET` | `/api_keys` | Get API Keys | Required |
| `CreateApiKey` | `POST` | `/api_keys` | Create API Key | Required |
| `GenerateApiKey` | `POST` | `/api_keys/generate` | Generate API Key | Required |
| `DeleteApiKey` | `DELETE` | `/api_keys/{api_key}` | Delete API Key | Required |
| `GetTagsForSeriesCategories` | `GET` | `/search/tags_by_categories` | Get Tags for Series Categories | Public |
| `GetFiltersForSports` | `GET` | `/search/filters_by_sport` | Get Filters for Sports | Public |
| `GetAccountApiLimits` | `GET` | `/account/limits` | Get Account API Limits | Required |
| `GetMarketCandlesticks` | `GET` | `/series/{series_ticker}/markets/{ticker}/candlesticks` | Get Market Candlesticks | Public |
| `GetTrades` | `GET` | `/markets/trades` | Get Trades | Public |
| `GetMarketCandlesticksByEvent` | `GET` | `/series/{series_ticker}/events/{ticker}/candlesticks` | Get Event Candlesticks | Public |
| `GetEvents` | `GET` | `/events` | Get Events | Public |
| `GetMultivariateEvents` | `GET` | `/events/multivariate` | Get Multivariate Events | Public |
| `GetEvent` | `GET` | `/events/{event_ticker}` | Get Event | Public |
| `GetEventMetadata` | `GET` | `/events/{event_ticker}/metadata` | Get Event Metadata | Public |
| `GetEventForecastPercentilesHistory` | `GET` | `/series/{series_ticker}/events/{ticker}/forecast_percentile_history` | Get Event Forecast Percentile History | Required |
| `GetLiveData` | `GET` | `/live_data/{type}/milestone/{milestone_id}` | Get Live Data | Public |
| `GetLiveDatas` | `GET` | `/live_data/batch` | Get Multiple Live Data | Public |
| `GetIncentivePrograms` | `GET` | `/incentive_programs` | Get Incentives | Public |
| `GetFCMOrders` | `GET` | `/fcm/orders` | Get FCM Orders | Required |
| `GetFCMPositions` | `GET` | `/fcm/positions` | Get FCM Positions | Required |
| `GetStructuredTargets` | `GET` | `/structured_targets` | Get Structured Targets | Public |
| `GetStructuredTarget` | `GET` | `/structured_targets/{structured_target_id}` | Get Structured Target | Public |
| `GetMarketOrderbook` | `GET` | `/markets/{ticker}/orderbook` | Get Market Orderbook | Required |
| `GetMarketOrderbooks` | `GET` | `/markets/orderbooks` | Get Multiple Market Orderbooks | Required |
| `GetMilestone` | `GET` | `/milestones/{milestone_id}` | Get Milestone | Public |
| `GetMilestones` | `GET` | `/milestones` | Get Milestones | Public |
| `GetCommunicationsID` | `GET` | `/communications/id` | Get Communications ID | Required |
| `GetRFQs` | `GET` | `/communications/rfqs` | Get RFQs | Required |
| `CreateRFQ` | `POST` | `/communications/rfqs` | Create RFQ | Required |
| `GetRFQ` | `GET` | `/communications/rfqs/{rfq_id}` | Get RFQ | Required |
| `DeleteRFQ` | `DELETE` | `/communications/rfqs/{rfq_id}` | Delete RFQ | Required |
| `GetQuotes` | `GET` | `/communications/quotes` | Get Quotes | Required |
| `CreateQuote` | `POST` | `/communications/quotes` | Create Quote | Required |
| `GetQuote` | `GET` | `/communications/quotes/{quote_id}` | Get Quote | Required |
| `DeleteQuote` | `DELETE` | `/communications/quotes/{quote_id}` | Delete Quote | Required |
| `AcceptQuote` | `PUT` | `/communications/quotes/{quote_id}/accept` | Accept Quote | Required |
| `ConfirmQuote` | `PUT` | `/communications/quotes/{quote_id}/confirm` | Confirm Quote | Required |
| `GetMultivariateEventCollection` | `GET` | `/multivariate_event_collections/{collection_ticker}` | Get Multivariate Event Collection | Public |
| `CreateMarketInMultivariateEventCollection` | `POST` | `/multivariate_event_collections/{collection_ticker}` | Create Market In Multivariate Event Collection | Required |
| `GetMultivariateEventCollections` | `GET` | `/multivariate_event_collections` | Get Multivariate Event Collections | Public |
| `LookupTickersForMarketInMultivariateEventCollection` | `PUT` | `/multivariate_event_collections/{collection_ticker}/lookup` | Lookup Tickers For Market In Multivariate Event Collection | Required |
| `GetMultivariateEventCollectionLookupHistory` | `GET` | `/multivariate_event_collections/{collection_ticker}/lookup` | Get Multivariate Event Collection Lookup History | Public |
| `GetSeries` | `GET` | `/series/{series_ticker}` | Get Series | Public |
| `GetSeriesList` | `GET` | `/series` | Get Series List | Public |
| `GetMarkets` | `GET` | `/markets` | Get Markets | Public |
| `GetMarket` | `GET` | `/markets/{ticker}` | Get Market | Public |
| `BatchGetMarketCandlesticks` | `GET` | `/markets/candlesticks` | Batch Get Market Candlesticks | Public |

#### Endpoint Details

##### `GetHistoricalCutoff`

**GET** `/historical/cutoff`

Get Historical Cutoff Timestamps


---
##### `GetMarketCandlesticksHistorical`

**GET** `/historical/markets/{ticker}/candlesticks`

Get Historical Market Candlesticks

**Parameters:**
- `ticker` (path, string) **required** — Market ticker - unique identifier for the specific market
- `start_ts` (query, integer) **required** — Start timestamp (Unix timestamp). Candlesticks will include those ending on or after this time.
- `end_ts` (query, integer) **required** — End timestamp (Unix timestamp). Candlesticks will include those ending on or before this time.
- `period_interval` (query, integer) **required** — Time period length of each candlestick in minutes. Valid values are 1 (1 minute), 60 (1 hour), or 1440 (1 day). — enum: `1,60,1440`

---
##### `GetFillsHistorical`

**GET** `/historical/fills`

Get Historical Fills *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)

---
##### `GetHistoricalOrders`

**GET** `/historical/orders`

Get Historical Orders *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)

---
##### `GetHistoricalMarkets`

**GET** `/historical/markets`

Get Historical Markets

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)

---
##### `GetHistoricalMarket`

**GET** `/historical/markets/{ticker}`

Get Historical Market

**Parameters:**
- `` (, string)

---
##### `GetExchangeStatus`

**GET** `/exchange/status`

Get Exchange Status


---
##### `GetExchangeAnnouncements`

**GET** `/exchange/announcements`

Get Exchange Announcements


---
##### `GetSeriesFeeChanges`

**GET** `/series/fee_changes`

Get Series Fee Changes

**Parameters:**
- `series_ticker` (query, string)
- `show_historical` (query, boolean)

---
##### `GetExchangeSchedule`

**GET** `/exchange/schedule`

Get Exchange Schedule


---
##### `GetUserDataTimestamp`

**GET** `/exchange/user_data_timestamp`

Get User Data Timestamp


---
##### `GetOrders`

**GET** `/portfolio/orders`

Get Orders *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)

---
##### `CreateOrder`

**POST** `/portfolio/orders`

Create Order *(Auth required)*


---
##### `GetOrder`

**GET** `/portfolio/orders/{order_id}`

Get Order *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `CancelOrder`

**DELETE** `/portfolio/orders/{order_id}`

Cancel Order *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)

---
##### `BatchCreateOrders`

**POST** `/portfolio/orders/batched`

Batch Create Orders *(Auth required)*


---
##### `BatchCancelOrders`

**DELETE** `/portfolio/orders/batched`

Batch Cancel Orders *(Auth required)*


---
##### `AmendOrder`

**POST** `/portfolio/orders/{order_id}/amend`

Amend Order *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `DecreaseOrder`

**POST** `/portfolio/orders/{order_id}/decrease`

Decrease Order *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `GetOrderQueuePositions`

**GET** `/portfolio/orders/queue_positions`

Get Queue Positions for Orders *(Auth required)*

**Parameters:**
- `market_tickers` (query, string) — Comma-separated list of market tickers to filter by
- `event_ticker` (query, string) — Event ticker to filter by
- `` (, string)

---
##### `GetOrderQueuePosition`

**GET** `/portfolio/orders/{order_id}/queue_position`

Get Order Queue Position *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `GetOrderGroups`

**GET** `/portfolio/order_groups`

Get Order Groups *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `CreateOrderGroup`

**POST** `/portfolio/order_groups/create`

Create Order Group *(Auth required)*


---
##### `GetOrderGroup`

**GET** `/portfolio/order_groups/{order_group_id}`

Get Order Group *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)

---
##### `DeleteOrderGroup`

**DELETE** `/portfolio/order_groups/{order_group_id}`

Delete Order Group *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)

---
##### `ResetOrderGroup`

**PUT** `/portfolio/order_groups/{order_group_id}/reset`

Reset Order Group *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)

---
##### `TriggerOrderGroup`

**PUT** `/portfolio/order_groups/{order_group_id}/trigger`

Trigger Order Group *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)

---
##### `UpdateOrderGroupLimit`

**PUT** `/portfolio/order_groups/{order_group_id}/limit`

Update Order Group Limit *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `GetBalance`

**GET** `/portfolio/balance`

Get Balance *(Auth required)*

**Parameters:**
- `subaccount` (query, integer) — Subaccount number (0 for primary, 1-32 for subaccounts). When provided, returns only that subaccount's balance.

---
##### `CreateSubaccount`

**POST** `/portfolio/subaccounts`

Create Subaccount *(Auth required)*


---
##### `ApplySubaccountTransfer`

**POST** `/portfolio/subaccounts/transfer`

Transfer Between Subaccounts *(Auth required)*


---
##### `GetSubaccountBalances`

**GET** `/portfolio/subaccounts/balances`

Get All Subaccount Balances *(Auth required)*


---
##### `GetSubaccountTransfers`

**GET** `/portfolio/subaccounts/transfers`

Get Subaccount Transfers *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)

---
##### `GetPositions`

**GET** `/portfolio/positions`

Get Positions *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)

---
##### `GetSettlements`

**GET** `/portfolio/settlements`

Get Settlements *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)

---
##### `GetPortfolioRestingOrderTotalValue`

**GET** `/portfolio/summary/total_resting_order_value`

Get Total Resting Order Value *(Auth required)*


---
##### `GetFills`

**GET** `/portfolio/fills`

Get Fills *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)

---
##### `GetApiKeys`

**GET** `/api_keys`

Get API Keys *(Auth required)*


---
##### `CreateApiKey`

**POST** `/api_keys`

Create API Key *(Auth required)*


---
##### `GenerateApiKey`

**POST** `/api_keys/generate`

Generate API Key *(Auth required)*


---
##### `DeleteApiKey`

**DELETE** `/api_keys/{api_key}`

Delete API Key *(Auth required)*

**Parameters:**
- `api_key` (path, string) **required** — API key ID to delete

---
##### `GetTagsForSeriesCategories`

**GET** `/search/tags_by_categories`

Get Tags for Series Categories


---
##### `GetFiltersForSports`

**GET** `/search/filters_by_sport`

Get Filters for Sports


---
##### `GetAccountApiLimits`

**GET** `/account/limits`

Get Account API Limits *(Auth required)*


---
##### `GetMarketCandlesticks`

**GET** `/series/{series_ticker}/markets/{ticker}/candlesticks`

Get Market Candlesticks

**Parameters:**
- `series_ticker` (path, string) **required** — Series ticker - the series that contains the target market
- `ticker` (path, string) **required** — Market ticker - unique identifier for the specific market
- `start_ts` (query, integer) **required** — Start timestamp (Unix timestamp). Candlesticks will include those ending on or after this time.
- `end_ts` (query, integer) **required** — End timestamp (Unix timestamp). Candlesticks will include those ending on or before this time.
- `period_interval` (query, integer) **required** — Time period length of each candlestick in minutes. Valid values are 1 (1 minute), 60 (1 hour), or 1440 (1 day). — enum: `1,60,1440`
- `include_latest_before_start` (query, boolean) — If true, prepends the latest candlestick available before the start_ts. This synthetic candlestick is created by:
1. Finding the most recent real candlestick before start_ts
2. Projecting it forward to the first period boundary (calculated as the next period interval after start_ts)
3. Setting all OHLC prices to null, and `previous_price` to the close price from the real candlestick


---
##### `GetTrades`

**GET** `/markets/trades`

Get Trades

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)

---
##### `GetMarketCandlesticksByEvent`

**GET** `/series/{series_ticker}/events/{ticker}/candlesticks`

Get Event Candlesticks

**Parameters:**
- `ticker` (path, string) **required** — The event ticker
- `series_ticker` (path, string) **required** — The series ticker
- `start_ts` (query, integer) **required** — Start timestamp for the range
- `end_ts` (query, integer) **required** — End timestamp for the range
- `period_interval` (query, integer) **required** — Specifies the length of each candlestick period, in minutes. Must be one minute, one hour, or one day. — enum: `1,60,1440`

---
##### `GetEvents`

**GET** `/events`

Get Events

**Parameters:**
- `limit` (query, integer) — Parameter to specify the number of results per page. Defaults to 200. Maximum value is 200.
- `cursor` (query, string) — Parameter to specify the pagination cursor. Use the cursor value returned from the previous response to get the next page of results. Leave empty for the first page.
- `with_nested_markets` (query, boolean) — Parameter to specify if nested markets should be included in the response. When true, each event will include a 'markets' field containing a list of Market objects associated with that event.
- `with_milestones` (query, boolean) — If true, includes related milestones as a field alongside events.
- `status` (query, string) — Filter by event status. Possible values are 'open', 'closed', 'settled'. Leave empty to return events with any status. — enum: `open,closed,settled`
- `` (, string)
- `min_close_ts` (query, integer) — Filter events with at least one market with close timestamp greater than this Unix timestamp (in seconds).

---
##### `GetMultivariateEvents`

**GET** `/events/multivariate`

Get Multivariate Events

**Parameters:**
- `limit` (query, integer) — Number of results per page. Defaults to 100. Maximum value is 200.
- `cursor` (query, string) — Pagination cursor. Use the cursor value returned from the previous response to get the next page of results.
- `` (, string)
- `collection_ticker` (query, string) — Filter events by collection ticker. Returns only multivariate events belonging to the specified collection. Cannot be used together with series_ticker.
- `with_nested_markets` (query, boolean) — Parameter to specify if nested markets should be included in the response. When true, each event will include a 'markets' field containing a list of Market objects associated with that event.

---
##### `GetEvent`

**GET** `/events/{event_ticker}`

Get Event

**Parameters:**
- `event_ticker` (path, string) **required** — Event ticker
- `with_nested_markets` (query, boolean) — If true, markets are included within the event object. If false (default), markets are returned as a separate top-level field in the response.

---
##### `GetEventMetadata`

**GET** `/events/{event_ticker}/metadata`

Get Event Metadata

**Parameters:**
- `event_ticker` (path, string) **required** — Event ticker

---
##### `GetEventForecastPercentilesHistory`

**GET** `/series/{series_ticker}/events/{ticker}/forecast_percentile_history`

Get Event Forecast Percentile History *(Auth required)*

**Parameters:**
- `ticker` (path, string) **required** — The event ticker
- `series_ticker` (path, string) **required** — The series ticker
- `percentiles` (query, array) **required** — Array of percentile values to retrieve (0-10000, max 10 values)
- `start_ts` (query, integer) **required** — Start timestamp for the range
- `end_ts` (query, integer) **required** — End timestamp for the range
- `period_interval` (query, integer) **required** — Specifies the length of each forecast period, in minutes. 0 for 5-second intervals, or 1, 60, or 1440 for minute-based intervals. — enum: `0,1,60,1440`

---
##### `GetLiveData`

**GET** `/live_data/{type}/milestone/{milestone_id}`

Get Live Data

**Parameters:**
- `type` (path, string) **required** — Type of live data
- `milestone_id` (path, string) **required** — Milestone ID

---
##### `GetLiveDatas`

**GET** `/live_data/batch`

Get Multiple Live Data

**Parameters:**
- `milestone_ids` (query, array) **required** — Array of milestone IDs

---
##### `GetIncentivePrograms`

**GET** `/incentive_programs`

Get Incentives

**Parameters:**
- `status` (query, string) — Status filter. Can be "all", "active", "upcoming", "closed", or "paid_out". Default is "all". — enum: `all,active,upcoming,closed,paid_out`
- `type` (query, string) — Type filter. Can be "all", "liquidity", or "volume". Default is "all". — enum: `all,liquidity,volume`
- `limit` (query, integer) — Number of results per page. Defaults to 100. Maximum value is 10000.
- `cursor` (query, string) — Cursor for pagination

---
##### `GetFCMOrders`

**GET** `/fcm/orders`

Get FCM Orders *(Auth required)*

**Parameters:**
- `subtrader_id` (query, string) **required** — Restricts the response to orders for a specific subtrader (FCM members only)
- `` (, string)
- `` (, string)
- `` (, string)
- `min_ts` (query, integer) — Restricts the response to orders after a timestamp, formatted as a Unix Timestamp
- `max_ts` (query, integer) — Restricts the response to orders before a timestamp, formatted as a Unix Timestamp
- `status` (query, string) — Restricts the response to orders that have a certain status — enum: `resting,canceled,executed`
- `limit` (query, integer) — Parameter to specify the number of results per page. Defaults to 100

---
##### `GetFCMPositions`

**GET** `/fcm/positions`

Get FCM Positions *(Auth required)*

**Parameters:**
- `subtrader_id` (query, string) **required** — Restricts the response to positions for a specific subtrader (FCM members only)
- `ticker` (query, string) — Ticker of desired positions
- `event_ticker` (query, string) — Event ticker of desired positions
- `count_filter` (query, string) — Restricts the positions to those with any of following fields with non-zero values, as a comma separated list
- `settlement_status` (query, string) — Settlement status of the markets to return. Defaults to unsettled — enum: `all,unsettled,settled`
- `limit` (query, integer) — Parameter to specify the number of results per page. Defaults to 100
- `cursor` (query, string) — The Cursor represents a pointer to the next page of records in the pagination

---
##### `GetStructuredTargets`

**GET** `/structured_targets`

Get Structured Targets

**Parameters:**
- `type` (query, string) — Filter by structured target type
- `competition` (query, string) — Filter by competition
- `page_size` (query, integer) — Number of items per page (min 1, max 2000, default 100)
- `cursor` (query, string) — Pagination cursor

---
##### `GetStructuredTarget`

**GET** `/structured_targets/{structured_target_id}`

Get Structured Target

**Parameters:**
- `structured_target_id` (path, string) **required** — Structured target ID

---
##### `GetMarketOrderbook`

**GET** `/markets/{ticker}/orderbook`

Get Market Orderbook *(Auth required)*

**Parameters:**
- `` (, string)
- `depth` (query, integer) — Depth of the orderbook to retrieve (0 or negative means all levels, 1-100 for specific depth)

---
##### `GetMarketOrderbooks`

**GET** `/markets/orderbooks`

Get Multiple Market Orderbooks *(Auth required)*

**Parameters:**
- `tickers` (query, array) **required** — List of market tickers to fetch orderbooks for

---
##### `GetMilestone`

**GET** `/milestones/{milestone_id}`

Get Milestone

**Parameters:**
- `milestone_id` (path, string) **required** — Milestone ID

---
##### `GetMilestones`

**GET** `/milestones`

Get Milestones

**Parameters:**
- `limit` (query, integer) **required** — Number of milestones to return per page
- `minimum_start_date` (query, string) — Minimum start date to filter milestones. Format RFC3339 timestamp
- `category` (query, string) — Filter by milestone category
- `competition` (query, string) — Filter by competition
- `source_id` (query, string) — Filter by source id
- `type` (query, string) — Filter by milestone type
- `related_event_ticker` (query, string) — Filter by related event ticker
- `cursor` (query, string) — Pagination cursor. Use the cursor value returned from the previous response to get the next page of results

---
##### `GetCommunicationsID`

**GET** `/communications/id`

Get Communications ID *(Auth required)*


---
##### `GetRFQs`

**GET** `/communications/rfqs`

Get RFQs *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `limit` (query, integer) — Parameter to specify the number of results per page. Defaults to 100.
- `status` (query, string) — Filter RFQs by status
- `creator_user_id` (query, string) — Filter RFQs by creator user ID

---
##### `CreateRFQ`

**POST** `/communications/rfqs`

Create RFQ *(Auth required)*


---
##### `GetRFQ`

**GET** `/communications/rfqs/{rfq_id}`

Get RFQ *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `DeleteRFQ`

**DELETE** `/communications/rfqs/{rfq_id}`

Delete RFQ *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `GetQuotes`

**GET** `/communications/quotes`

Get Quotes *(Auth required)*

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `limit` (query, integer) — Parameter to specify the number of results per page. Defaults to 500.
- `status` (query, string) — Filter quotes by status
- `quote_creator_user_id` (query, string) — Filter quotes by quote creator user ID
- `rfq_creator_user_id` (query, string) — Filter quotes by RFQ creator user ID
- `rfq_creator_subtrader_id` (query, string) — Filter quotes by RFQ creator subtrader ID (FCM members only)
- `rfq_id` (query, string) — Filter quotes by RFQ ID

---
##### `CreateQuote`

**POST** `/communications/quotes`

Create Quote *(Auth required)*


---
##### `GetQuote`

**GET** `/communications/quotes/{quote_id}`

Get Quote *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `DeleteQuote`

**DELETE** `/communications/quotes/{quote_id}`

Delete Quote *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `AcceptQuote`

**PUT** `/communications/quotes/{quote_id}/accept`

Accept Quote *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `ConfirmQuote`

**PUT** `/communications/quotes/{quote_id}/confirm`

Confirm Quote *(Auth required)*

**Parameters:**
- `` (, string)

---
##### `GetMultivariateEventCollection`

**GET** `/multivariate_event_collections/{collection_ticker}`

Get Multivariate Event Collection

**Parameters:**
- `collection_ticker` (path, string) **required** — Collection ticker

---
##### `CreateMarketInMultivariateEventCollection`

**POST** `/multivariate_event_collections/{collection_ticker}`

Create Market In Multivariate Event Collection *(Auth required)*

**Parameters:**
- `collection_ticker` (path, string) **required** — Collection ticker

---
##### `GetMultivariateEventCollections`

**GET** `/multivariate_event_collections`

Get Multivariate Event Collections

**Parameters:**
- `status` (query, string) — Only return collections of a certain status. Can be unopened, open, or closed. — enum: `unopened,open,closed`
- `associated_event_ticker` (query, string) — Only return collections associated with a particular event ticker.
- `series_ticker` (query, string) — Only return collections with a particular series ticker.
- `limit` (query, integer) — Specify the maximum number of results.
- `cursor` (query, string) — The Cursor represents a pointer to the next page of records in the pagination. This optional parameter, when filled, should be filled with the cursor string returned in a previous request to this end-point.

---
##### `LookupTickersForMarketInMultivariateEventCollection`

**PUT** `/multivariate_event_collections/{collection_ticker}/lookup`

Lookup Tickers For Market In Multivariate Event Collection *(Auth required)*

**Parameters:**
- `collection_ticker` (path, string) **required** — Collection ticker

---
##### `GetMultivariateEventCollectionLookupHistory`

**GET** `/multivariate_event_collections/{collection_ticker}/lookup`

Get Multivariate Event Collection Lookup History

**Parameters:**
- `collection_ticker` (path, string) **required** — Collection ticker
- `lookback_seconds` (query, integer) **required** — Number of seconds to look back for lookup history. Must be one of 10, 60, 300, or 3600. — enum: `10,60,300,3600`

---
##### `GetSeries`

**GET** `/series/{series_ticker}`

Get Series

**Parameters:**
- `series_ticker` (path, string) **required** — The ticker of the series to retrieve
- `include_volume` (query, boolean) — If true, includes the total volume traded across all events in this series.

---
##### `GetSeriesList`

**GET** `/series`

Get Series List

**Parameters:**
- `category` (query, string)
- `tags` (query, string)
- `include_product_metadata` (query, boolean)
- `include_volume` (query, boolean) — If true, includes the total volume traded across all events in each series.

---
##### `GetMarkets`

**GET** `/markets`

Get Markets

**Parameters:**
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)
- `` (, string)

---
##### `GetMarket`

**GET** `/markets/{ticker}`

Get Market

**Parameters:**
- `` (, string)

---
##### `BatchGetMarketCandlesticks`

**GET** `/markets/candlesticks`

Batch Get Market Candlesticks

**Parameters:**
- `market_tickers` (query, string) **required** — Comma-separated list of market tickers (maximum 100)
- `start_ts` (query, integer) **required** — Start timestamp in Unix seconds
- `end_ts` (query, integer) **required** — End timestamp in Unix seconds
- `period_interval` (query, integer) **required** — Candlestick period interval in minutes
- `include_latest_before_start` (query, boolean) — If true, prepends the latest candlestick available before the start_ts. This synthetic candlestick is created by:
1. Finding the most recent real candlestick before start_ts
2. Projecting it forward to the first period boundary (calculated as the next period interval after start_ts)
3. Setting all OHLC prices to null, and `previous_price` to the close price from the real candlestick


---
### Limitless

| `callApi()` name | Method | Path | Summary | Auth |
|-----------------|--------|------|---------|------|
| `AuthController_getSigningMessage` | `GET` | `/auth/signing-message` | Get signing message | Public |
| `AuthController_verifyAuth` | `GET` | `/auth/verify-auth` | Verify authentication | Required |
| `AuthController_login` | `POST` | `/auth/login` | User login | Public |
| `AuthController_logout` | `POST` | `/auth/logout` | User logout | Required |
| `MarketController_getActiveMarkets[0]` | `GET` | `/markets/active/{categoryId}` | Browse Active Markets | Public |
| `MarketController_getActiveMarkets[1]` | `GET` | `/markets/active` | Browse Active Markets | Public |
| `MarketController_getActiveMarketCountPerCategory` | `GET` | `/markets/categories/count` | Get active market count per category | Public |
| `MarketController_getActiveSlugs` | `GET` | `/markets/active/slugs` | Get active market slugs with metadata | Public |
| `MarketController_find` | `GET` | `/markets/{addressOrSlug}` | Get Market Details | Public |
| `MarketController_getFeedEvent` | `GET` | `/markets/{slug}/get-feed-events` | Get feed events for a market | Required |
| `MarketOrderbookController_getHistoricalPrice` | `GET` | `/markets/{slug}/historical-price` | Get Historical Prices | Public |
| `MarketOrderbookController_getOrderbook` | `GET` | `/markets/{slug}/orderbook` | Get Orderbook | Public |
| `MarketOrderbookController_getLockedBalance` | `GET` | `/markets/{slug}/locked-balance` | Get Locked Balance | Required |
| `MarketOrderbookController_getUserOrders` | `GET` | `/markets/{slug}/user-orders` | User Orders | Required |
| `MarketOrderbookController_getMarketEvents` | `GET` | `/markets/{slug}/events` | Market Events | Public |
| `MarketSearchController_search` | `GET` | `/markets/search` | Search for markets based on semantic similarity | Public |
| `PortfolioController_getTrades` | `GET` | `/portfolio/trades` | Get Trades | Required |
| `PortfolioController_getPositions` | `GET` | `/portfolio/positions` | Get Positions | Required |
| `PortfolioController_getPnlChart` | `GET` | `/portfolio/pnl-chart` | Get portfolio PnL chart | Required |
| `PortfolioController_getHistory` | `GET` | `/portfolio/history` | Get History | Required |
| `PortfolioController_getPointsBreakdown` | `GET` | `/portfolio/points` | Get points breakdown | Required |
| `PublicPortfolioController_tradedVolume` | `GET` | `/portfolio/{account}/traded-volume` | User Total Volume | Public |
| `PublicPortfolioController_getPositions` | `GET` | `/portfolio/{account}/positions` | Get All User Positions | Public |
| `PublicPortfolioController_getPnlChart` | `GET` | `/portfolio/{account}/pnl-chart` | Get portfolio PnL chart (public) | Public |
| `TradingPortfolioController_getAllowance` | `GET` | `/portfolio/trading/allowance` | Get User Trading Allowance | Required |
| `OrderController_createOrder` | `POST` | `/orders` | Create Order | Required |
| `OrderController_cancelOrder` | `DELETE` | `/orders/{orderId}` | Cancel Order | Required |
| `OrderController_cancelOrderBatch` | `POST` | `/orders/cancel-batch` | Cancel multiple orders in batch | Required |
| `OrderController_cancelAllOrders` | `DELETE` | `/orders/all/{slug}` | Cancel all of a user's orders in a specific market | Required |

#### Endpoint Details

##### `AuthController_getSigningMessage`

**GET** `/auth/signing-message`

Get signing message


---
##### `AuthController_verifyAuth`

**GET** `/auth/verify-auth`

Verify authentication *(Auth required)*


---
##### `AuthController_login`

**POST** `/auth/login`

User login

**Parameters:**
- `x-account` (header, string) **required** — The Ethereum address of the user
- `x-signing-message` (header, string) **required** — The signing message generated by the server
- `x-signature` (header, string) **required** — The signature generated by signing the message with the user's wallet

---
##### `AuthController_logout`

**POST** `/auth/logout`

User logout *(Auth required)*


---
##### `MarketController_getActiveMarkets[0]`

**GET** `/markets/active/{categoryId}`

Browse Active Markets

**Parameters:**
- `page` (query, number) — Page number for pagination
- `limit` (query, number) — Number of items per page
- `sortBy` (query, string) — Sort by query parameter
- `tradeType` (query, string) — Filter by trade type (amm, clob, or group) — enum: `amm,clob,group`
- `automationType` (query, string) — Filter by automation type (manual, lumy, or sports) — enum: `manual,lumy,sports`
- `categoryId` (path, number) **required** — Filter markets by category ID

---
##### `MarketController_getActiveMarkets[1]`

**GET** `/markets/active`

Browse Active Markets

**Parameters:**
- `page` (query, number) — Page number for pagination
- `limit` (query, number) — Number of items per page
- `sortBy` (query, string) — Sort by query parameter
- `tradeType` (query, string) — Filter by trade type (amm, clob, or group) — enum: `amm,clob,group`
- `automationType` (query, string) — Filter by automation type (manual, lumy, or sports) — enum: `manual,lumy,sports`
- `categoryId` (path, number) **required** — Filter markets by category ID

---
##### `MarketController_getActiveMarketCountPerCategory`

**GET** `/markets/categories/count`

Get active market count per category


---
##### `MarketController_getActiveSlugs`

**GET** `/markets/active/slugs`

Get active market slugs with metadata


---
##### `MarketController_find`

**GET** `/markets/{addressOrSlug}`

Get Market Details

**Parameters:**
- `addressOrSlug` (path, string) **required** — Market/group address (0x...) or slug identifier (my-market-name)

---
##### `MarketController_getFeedEvent`

**GET** `/markets/{slug}/get-feed-events`

Get feed events for a market *(Auth required)*

**Parameters:**
- `page` (query, number) — Page number for pagination
- `limit` (query, number) — Number of events per page
- `slug` (path, string) **required** — Slug of the market

---
##### `MarketOrderbookController_getHistoricalPrice`

**GET** `/markets/{slug}/historical-price`

Get Historical Prices

**Parameters:**
- `to` (query, string) — End date for historical data
- `from` (query, string) — Start date for historical data
- `interval` (query, string) — Time interval for data points — enum: `1h,6h,1d,1w,1m,all`
- `slug` (path, string) **required** — Market slug identifier

---
##### `MarketOrderbookController_getOrderbook`

**GET** `/markets/{slug}/orderbook`

Get Orderbook

**Parameters:**
- `slug` (path, string) **required** — Market slug identifier

---
##### `MarketOrderbookController_getLockedBalance`

**GET** `/markets/{slug}/locked-balance`

Get Locked Balance *(Auth required)*

**Parameters:**
- `slug` (path, string) **required** — Market slug identifier

---
##### `MarketOrderbookController_getUserOrders`

**GET** `/markets/{slug}/user-orders`

User Orders *(Auth required)*

**Parameters:**
- `statuses` (query, array) — Order status(es) to filter by. Defaults to [LIVE] if not provided
- `limit` (query, number) — Maximum number of orders to return
- `slug` (path, string) **required** — Market slug identifier

---
##### `MarketOrderbookController_getMarketEvents`

**GET** `/markets/{slug}/events`

Market Events

**Parameters:**
- `page` (query, number) — Page number for pagination
- `limit` (query, number) — Number of events per page
- `slug` (path, string) **required** — Market slug identifier

---
##### `MarketSearchController_search`

**GET** `/markets/search`

Search for markets based on semantic similarity

**Parameters:**
- `query` (query, string) **required** — Search query text
- `limit` (query, number) — Maximum number of results to return
- `page` (query, number) — Number of page
- `similarityThreshold` (query, number) — Minimum similarity score (0-1)

---
##### `PortfolioController_getTrades`

**GET** `/portfolio/trades`

Get Trades *(Auth required)*


---
##### `PortfolioController_getPositions`

**GET** `/portfolio/positions`

Get Positions *(Auth required)*


---
##### `PortfolioController_getPnlChart`

**GET** `/portfolio/pnl-chart`

Get portfolio PnL chart *(Auth required)*

**Parameters:**
- `timeframe` (query, string) — Timeframe window for percent change and chart series

---
##### `PortfolioController_getHistory`

**GET** `/portfolio/history`

Get History *(Auth required)*

**Parameters:**
- `page` (query, number) **required** — Page number
- `limit` (query, number) **required** — Number of items per page
- `from` (query, string) — Start date for filtering (ISO 8601 format)
- `to` (query, string) — End date for filtering (ISO 8601 format)

---
##### `PortfolioController_getPointsBreakdown`

**GET** `/portfolio/points`

Get points breakdown *(Auth required)*


---
##### `PublicPortfolioController_tradedVolume`

**GET** `/portfolio/{account}/traded-volume`

User Total Volume

**Parameters:**
- `account` (path, string) **required** — User Ethereum address

---
##### `PublicPortfolioController_getPositions`

**GET** `/portfolio/{account}/positions`

Get All User Positions

**Parameters:**
- `account` (path, string) **required** — User Ethereum address

---
##### `PublicPortfolioController_getPnlChart`

**GET** `/portfolio/{account}/pnl-chart`

Get portfolio PnL chart (public)

**Parameters:**
- `account` (path, string) **required** — User Ethereum address
- `timeframe` (query, string) — Timeframe window for percent change and chart series

---
##### `TradingPortfolioController_getAllowance`

**GET** `/portfolio/trading/allowance`

Get User Trading Allowance *(Auth required)*

**Parameters:**
- `type` (query, string) **required** — Trading type: CLOB or NegRisk — enum: `clob,negrisk`
- `spender` (query, string) — Optional spender address override (e.g., venue exchange address)

---
##### `OrderController_createOrder`

**POST** `/orders`

Create Order *(Auth required)*


---
##### `OrderController_cancelOrder`

**DELETE** `/orders/{orderId}`

Cancel Order *(Auth required)*

**Parameters:**
- `orderId` (path, string) **required** — Unique identifier of the order to be cancelled

---
##### `OrderController_cancelOrderBatch`

**POST** `/orders/cancel-batch`

Cancel multiple orders in batch *(Auth required)*


---
##### `OrderController_cancelAllOrders`

**DELETE** `/orders/all/{slug}`

Cancel all of a user's orders in a specific market *(Auth required)*


---
### Probable

| `callApi()` name | Method | Path | Summary | Auth |
|-----------------|--------|------|---------|------|
| `getPublicApiV1AuthNonce` | `GET` | `/public/api/v1/auth/nonce` | Generate Nonce | Public |
| `postPublicApiV1AuthLogin` | `POST` | `/public/api/v1/auth/login` | Login | Public |
| `postPublicApiV1AuthLogout` | `POST` | `/public/api/v1/auth/logout` | Logout | Public |
| `postPublicApiV1AuthApiKey` | `POST` | `/public/api/v1/auth/api-key/{chainId}` | Generate API Key | Required |
| `getPublicApiV1AuthApiKey` | `GET` | `/public/api/v1/auth/api-key/{chainId}` | Get API Key | Required |
| `deletePublicApiV1AuthApiKey` | `DELETE` | `/public/api/v1/auth/api-key/{chainId}` | Delete API Key | Required |
| `postPublicApiV1AuthVerifyL1` | `POST` | `/public/api/v1/auth/verify/l1` | Verify L1 Headers | Required |
| `postPublicApiV1AuthVerifyL2` | `POST` | `/public/api/v1/auth/verify/l2` | Verify L2 Headers | Required |
| `getPublicApiV1Events` | `GET` | `/public/api/v1/events/` | List All Events | Public |
| `getPublicApiV1Events` | `GET` | `/public/api/v1/events/{id}` | Get Event by ID | Public |
| `getPublicApiV1EventsSlug` | `GET` | `/public/api/v1/events/slug/{slug}` | Get Event by Slug | Public |
| `getPublicApiV1EventsTags` | `GET` | `/public/api/v1/events/{id}/tags` | Get Tags for Event | Public |
| `getPublicApiV1Markets` | `GET` | `/public/api/v1/markets/` | List All Markets | Public |
| `getPublicApiV1Markets` | `GET` | `/public/api/v1/markets/{id}` | Get Market by ID | Public |
| `getPublicApiV1MarketsPolymarket` | `GET` | `/public/api/v1/markets/polymarket/{polymarketId}` | Get Market by Polymarket ID | Public |
| `getPublicApiV1MarketsBsc` | `GET` | `/public/api/v1/markets/bsc/{bscQuestionId}` | Get Market by BSC Question ID | Public |
| `getPublicApiV1PublicSearch` | `GET` | `/public/api/v1/public-search/` | Search Events and Markets | Public |
| `getPublicApiV1Tags` | `GET` | `/public/api/v1/tags/` | List All Tags | Public |
| `postPublicApiV1Order` | `POST` | `/public/api/v1/order/{chainId}` | Place Order | Required |
| `deletePublicApiV1Order` | `DELETE` | `/public/api/v1/order/{chainId}/{orderId}` | Cancel Order | Required |
| `getPublicApiV1Orders` | `GET` | `/public/api/v1/orders/{chainId}/{orderId}` | Get Order | Required |
| `getPublicApiV1OrdersOpen` | `GET` | `/public/api/v1/orders/{chainId}/open` | Get Open Orders | Required |
| `getPublicApiV1Price` | `GET` | `/public/api/v1/price` | Get Price | Public |
| `postPublicApiV1Prices` | `POST` | `/public/api/v1/prices` | Get Prices (Batch) | Public |
| `getPublicApiV1Midpoint` | `GET` | `/public/api/v1/midpoint` | Get Midpoint | Public |
| `getPublicApiV1Book` | `GET` | `/public/api/v1/book` | Get Order Book | Public |
| `getPublicApiV1PricesHistory` | `GET` | `/public/api/v1/prices-history` | Get Price History | Public |
| `getPublicApiV1Trade` | `GET` | `/public/api/v1/trade/{chainId}` | Get Trades (Authenticated) | Required |
| `getPublicApiV1Trades` | `GET` | `/public/api/v1/trades` | Get Public Trades | Public |
| `getPublicApiV1Activity` | `GET` | `/public/api/v1/activity` | User Activity | Public |
| `getPublicApiV1PositionCurrent` | `GET` | `/public/api/v1/position/current` | Current Position | Public |
| `getPublicApiV1Pnl` | `GET` | `/public/api/v1/pnl` | Profit and Loss | Public |

#### Endpoint Details

##### `getPublicApiV1AuthNonce`

**GET** `/public/api/v1/auth/nonce`

Generate Nonce


---
##### `postPublicApiV1AuthLogin`

**POST** `/public/api/v1/auth/login`

Login


---
##### `postPublicApiV1AuthLogout`

**POST** `/public/api/v1/auth/logout`

Logout


---
##### `postPublicApiV1AuthApiKey`

**POST** `/public/api/v1/auth/api-key/{chainId}`

Generate API Key *(Auth required)*

**Parameters:**
- `chainId` (path, integer) **required**

---
##### `getPublicApiV1AuthApiKey`

**GET** `/public/api/v1/auth/api-key/{chainId}`

Get API Key *(Auth required)*

**Parameters:**
- `chainId` (path, integer) **required**

---
##### `deletePublicApiV1AuthApiKey`

**DELETE** `/public/api/v1/auth/api-key/{chainId}`

Delete API Key *(Auth required)*

**Parameters:**
- `chainId` (path, integer) **required**

---
##### `postPublicApiV1AuthVerifyL1`

**POST** `/public/api/v1/auth/verify/l1`

Verify L1 Headers *(Auth required)*


---
##### `postPublicApiV1AuthVerifyL2`

**POST** `/public/api/v1/auth/verify/l2`

Verify L2 Headers *(Auth required)*


---
##### `getPublicApiV1Events`

**GET** `/public/api/v1/events/`

List All Events

**Parameters:**
- `page` (query, integer)
- `limit` (query, integer)
- `status` (query, string) — enum: `active,closed,all`
- `tag_id` (query, string)
- `sort` (query, string)

---
##### `getPublicApiV1Events`

**GET** `/public/api/v1/events/{id}`

Get Event by ID

**Parameters:**
- `id` (path, integer) **required**

---
##### `getPublicApiV1EventsSlug`

**GET** `/public/api/v1/events/slug/{slug}`

Get Event by Slug

**Parameters:**
- `slug` (path, string) **required**

---
##### `getPublicApiV1EventsTags`

**GET** `/public/api/v1/events/{id}/tags`

Get Tags for Event

**Parameters:**
- `id` (path, integer) **required**

---
##### `getPublicApiV1Markets`

**GET** `/public/api/v1/markets/`

List All Markets

**Parameters:**
- `page` (query, integer)
- `active` (query, boolean)
- `event_id` (query, integer)

---
##### `getPublicApiV1Markets`

**GET** `/public/api/v1/markets/{id}`

Get Market by ID

**Parameters:**
- `id` (path, integer) **required**

---
##### `getPublicApiV1MarketsPolymarket`

**GET** `/public/api/v1/markets/polymarket/{polymarketId}`

Get Market by Polymarket ID

**Parameters:**
- `polymarketId` (path, string) **required**

---
##### `getPublicApiV1MarketsBsc`

**GET** `/public/api/v1/markets/bsc/{bscQuestionId}`

Get Market by BSC Question ID

**Parameters:**
- `bscQuestionId` (path, string) **required**

---
##### `getPublicApiV1PublicSearch`

**GET** `/public/api/v1/public-search/`

Search Events and Markets

**Parameters:**
- `q` (query, string) **required**
- `page` (query, integer)
- `events_tag` (query, string)
- `optimized` (query, boolean)

---
##### `getPublicApiV1Tags`

**GET** `/public/api/v1/tags/`

List All Tags


---
##### `postPublicApiV1Order`

**POST** `/public/api/v1/order/{chainId}`

Place Order *(Auth required)*

**Parameters:**
- `chainId` (path, integer) **required**

---
##### `deletePublicApiV1Order`

**DELETE** `/public/api/v1/order/{chainId}/{orderId}`

Cancel Order *(Auth required)*

**Parameters:**
- `chainId` (path, integer) **required**
- `orderId` (path, string) **required**
- `tokenId` (query, string) **required**

---
##### `getPublicApiV1Orders`

**GET** `/public/api/v1/orders/{chainId}/{orderId}`

Get Order *(Auth required)*

**Parameters:**
- `chainId` (path, integer) **required**
- `orderId` (path, string) **required**
- `tokenId` (query, string) **required**

---
##### `getPublicApiV1OrdersOpen`

**GET** `/public/api/v1/orders/{chainId}/open`

Get Open Orders *(Auth required)*

**Parameters:**
- `chainId` (path, integer) **required**
- `limit` (query, integer)
- `page` (query, integer)

---
##### `getPublicApiV1Price`

**GET** `/public/api/v1/price`

Get Price

**Parameters:**
- `token_id` (query, string) **required**
- `side` (query, string) **required** — enum: `BUY,SELL`

---
##### `postPublicApiV1Prices`

**POST** `/public/api/v1/prices`

Get Prices (Batch)


---
##### `getPublicApiV1Midpoint`

**GET** `/public/api/v1/midpoint`

Get Midpoint

**Parameters:**
- `token_id` (query, string) **required**

---
##### `getPublicApiV1Book`

**GET** `/public/api/v1/book`

Get Order Book

**Parameters:**
- `token_id` (query, string) **required**

---
##### `getPublicApiV1PricesHistory`

**GET** `/public/api/v1/prices-history`

Get Price History

**Parameters:**
- `market` (query, string) **required** — Asset ID
- `interval` (query, string) — enum: `max,1m,1h,6h,1d,1w`
- `startTs` (query, integer)
- `endTs` (query, integer)

---
##### `getPublicApiV1Trade`

**GET** `/public/api/v1/trade/{chainId}`

Get Trades (Authenticated) *(Auth required)*

**Parameters:**
- `chainId` (path, integer) **required**
- `tokenId` (query, string) **required**
- `limit` (query, integer)
- `next_cursor` (query, string)

---
##### `getPublicApiV1Trades`

**GET** `/public/api/v1/trades`

Get Public Trades

**Parameters:**
- `user` (query, string)
- `limit` (query, integer)
- `side` (query, string)

---
##### `getPublicApiV1Activity`

**GET** `/public/api/v1/activity`

User Activity

**Parameters:**
- `user` (query, string) **required**
- `limit` (query, integer)

---
##### `getPublicApiV1PositionCurrent`

**GET** `/public/api/v1/position/current`

Current Position

**Parameters:**
- `user` (query, string) **required**
- `eventId` (query, integer)

---
##### `getPublicApiV1Pnl`

**GET** `/public/api/v1/pnl`

Profit and Loss

**Parameters:**
- `user_address` (query, string) **required**

---
### Myriad

| `callApi()` name | Method | Path | Summary | Auth |
|-----------------|--------|------|---------|------|
| `getQuestions` | `GET` | `/questions` | List Questions | Required |
| `getQuestions` | `GET` | `/questions/{id}` | Get Question Details | Required |
| `getMarkets` | `GET` | `/markets` | List Markets | Required |
| `getMarkets` | `GET` | `/markets/{id}` | Get Market Details | Required |
| `getMarketsEvents` | `GET` | `/markets/{id}/events` | Get Market Events | Required |
| `getMarketsReferrals` | `GET` | `/markets/{id}/referrals` | Get Market Referrals | Required |
| `getMarketsHolders` | `GET` | `/markets/{id}/holders` | Get Market Holders | Required |
| `postMarketsQuote` | `POST` | `/markets/quote` | Get Trade Quote | Required |
| `postMarketsQuoteWithFee` | `POST` | `/markets/quote_with_fee` | Get Trade Quote with Frontend Fee | Required |
| `postMarketsClaim` | `POST` | `/markets/claim` | Get Claim Quote | Required |
| `getUsersEvents` | `GET` | `/users/{address}/events` | Get User Events | Required |
| `getUsersReferrals` | `GET` | `/users/{address}/referrals` | Get User Referrals | Required |
| `getUsersPortfolio` | `GET` | `/users/{address}/portfolio` | Get User Portfolio | Required |
| `getUsersMarkets` | `GET` | `/users/{address}/markets` | Get User Markets Portfolio | Required |

#### Endpoint Details

##### `getQuestions`

**GET** `/questions`

List Questions *(Auth required)*

**Parameters:**
- `page` (query, integer)
- `limit` (query, integer)
- `keyword` (query, string) — Search in question title
- `min_markets` (query, integer) — Minimum number of linked markets
- `max_markets` (query, integer) — Maximum number of linked markets

---
##### `getQuestions`

**GET** `/questions/{id}`

Get Question Details *(Auth required)*

**Parameters:**
- `id` (path, integer) **required**

---
##### `getMarkets`

**GET** `/markets`

List Markets *(Auth required)*

**Parameters:**
- `page` (query, integer)
- `limit` (query, integer)
- `sort` (query, string) — enum: `volume,volume_24h,liquidity,expires_at,published_at,featured`
- `order` (query, string) — enum: `asc,desc`
- `network_id` (query, string) — Comma-separated list of network ids
- `state` (query, string) — enum: `open,closed,resolved`
- `token_address` (query, string)
- `topics` (query, string) — Comma-separated list of topics
- `keyword` (query, string) — Full-text search across title, description, and outcome titles
- `ids` (query, string) — Comma-separated list of on-chain market ids
- `in_play` (query, boolean)
- `moneyline` (query, boolean)
- `min_duration` (query, integer) — Minimum market duration in seconds
- `max_duration` (query, integer) — Maximum market duration in seconds

---
##### `getMarkets`

**GET** `/markets/{id}`

Get Market Details *(Auth required)*

**Parameters:**
- `id` (path, string) **required** — Market slug OR Market ID
- `network_id` (query, integer) — Required if 'id' in path is a numeric Market ID

---
##### `getMarketsEvents`

**GET** `/markets/{id}/events`

Get Market Events *(Auth required)*

**Parameters:**
- `id` (path, string) **required** — Market slug OR Market ID
- `network_id` (query, integer) — Required if 'id' in path is a numeric Market ID
- `page` (query, integer)
- `limit` (query, integer)
- `since` (query, integer) — Unix seconds (inclusive)
- `until` (query, integer) — Unix seconds (inclusive)

---
##### `getMarketsReferrals`

**GET** `/markets/{id}/referrals`

Get Market Referrals *(Auth required)*

**Parameters:**
- `id` (path, string) **required** — Market slug OR Market ID
- `network_id` (query, integer) — Required if 'id' in path is a numeric Market ID
- `page` (query, integer)
- `limit` (query, integer)
- `since` (query, integer)
- `until` (query, integer)
- `code` (query, string)

---
##### `getMarketsHolders`

**GET** `/markets/{id}/holders`

Get Market Holders *(Auth required)*

**Parameters:**
- `id` (path, string) **required** — Market slug OR Market ID
- `network_id` (query, integer) — Required if 'id' in path is a numeric Market ID
- `page` (query, integer)
- `limit` (query, integer)

---
##### `postMarketsQuote`

**POST** `/markets/quote`

Get Trade Quote *(Auth required)*


---
##### `postMarketsQuoteWithFee`

**POST** `/markets/quote_with_fee`

Get Trade Quote with Frontend Fee *(Auth required)*


---
##### `postMarketsClaim`

**POST** `/markets/claim`

Get Claim Quote *(Auth required)*


---
##### `getUsersEvents`

**GET** `/users/{address}/events`

Get User Events *(Auth required)*

**Parameters:**
- `address` (path, string) **required**
- `page` (query, integer)
- `limit` (query, integer)
- `market_id` (query, string)
- `market_slug` (query, string)
- `network_id` (query, integer)
- `since` (query, integer)
- `until` (query, integer)

---
##### `getUsersReferrals`

**GET** `/users/{address}/referrals`

Get User Referrals *(Auth required)*

**Parameters:**
- `address` (path, string) **required**
- `page` (query, integer)
- `limit` (query, integer)
- `market_id` (query, string)
- `market_slug` (query, string)
- `network_id` (query, integer)
- `since` (query, integer)
- `until` (query, integer)
- `code` (query, string)

---
##### `getUsersPortfolio`

**GET** `/users/{address}/portfolio`

Get User Portfolio *(Auth required)*

**Parameters:**
- `address` (path, string) **required**
- `page` (query, integer)
- `limit` (query, integer)
- `min_shares` (query, number) — Default 0.1
- `market_slug` (query, string)
- `market_id` (query, string)
- `network_id` (query, integer)
- `token_address` (query, string)

---
##### `getUsersMarkets`

**GET** `/users/{address}/markets`

Get User Markets Portfolio *(Auth required)*

**Parameters:**
- `address` (path, string) **required**
- `page` (query, integer)
- `limit` (query, integer)
- `min_shares` (query, number)
- `network_id` (query, integer)
- `state` (query, string)
- `token_address` (query, string)
- `topics` (query, string)
- `keyword` (query, string)
- `market_ids` (query, string) — Comma-separated list of {networkId}:{marketId} pairs

---
