# pmxtjs - API Reference

A unified TypeScript SDK for interacting with multiple prediction market exchanges (Kalshi, Polymarket) identically.

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

// Search for markets
const markets = await poly.searchMarkets("Trump");
console.log(markets[0].title);
```

> **Note**: This SDK automatically manages the PMXT sidecar server.

---

## Server Management

The SDK provides global functions to manage the background sidecar server. This is useful for clearing state or
resolving "port busy" errors.

### `stopServer`

Stop the background PMXT sidecar server and clean up lock files.

```typescript
import pmxt from 'pmxtjs';
await pmxt.stopServer();
```

### `restartServer`

Restart the background PMXT sidecar server. Equivalent to calling `stopServer()` followed by a fresh start.

```typescript
import pmxt from 'pmxtjs';
await pmxt.restartServer();
```

---

## Methods

### `fetchMarkets`

Fetch Markets

Fetch Markets

**Signature:**

```typescript
async fetchMarkets(params?: MarketFilterParams): Promise<UnifiedMarket[]>
  ```

  **Parameters:**

  - `params` (MarketFilterParams) - **Optional**: Filter parameters

  **Returns:** `Promise<UnifiedMarket[]>` - List of unified markets

    **Example:**

    ```typescript
    const markets = await polymarket.fetchMarkets({ 
  limit: 20, 
  offset: 0,
  sort: 'volume' // 'volume' | 'liquidity' | 'newest'
});
    ```


    ---
### `fetchOHLCV`

Fetch OHLCV Candles

Fetch OHLCV Candles

**Signature:**

```typescript
async fetchOHLCV(id: string, params?: HistoryFilterParams): Promise<PriceCandle[]>
  ```

  **Parameters:**

  - `id` (string): id
  - `params` (HistoryFilterParams) - **Optional**: Filter parameters

  **Returns:** `Promise<PriceCandle[]>` - Historical prices

    **Example:**

    ```typescript
    const markets = await polymarket.searchMarkets('Trump');
const outcomeId = markets[0].outcomes[0].id; // Get the outcome ID

const candles = await polymarket.fetchOHLCV(outcomeId, {
  resolution: '1h', // '1m' | '5m' | '15m' | '1h' | '6h' | '1d'
  start: new Date('2024-01-01'),
  end: new Date('2024-01-31'),
  limit: 100
});
    ```

    **Notes:**
    **CRITICAL**: Use `outcome.id`, not `market.id`.
    - **Polymarket**: `outcome.id` is the CLOB Token ID
    - **Kalshi**: `outcome.id` is the Market Ticker

    ---
### `fetchOrderBook`

Fetch Order Book

Fetch Order Book

**Signature:**

```typescript
async fetchOrderBook(): Promise<OrderBook>
  ```

  **Parameters:**

  - None

  **Returns:** `Promise<OrderBook>` - Current order book

    **Example:**

    ```typescript
    const orderBook = await kalshi.fetchOrderBook('FED-25JAN');
console.log('Best bid:', orderBook.bids[0].price);
console.log('Best ask:', orderBook.asks[0].price);
    ```


    ---
### `fetchTrades`

Fetch Trades

Fetch Trades

**Signature:**

```typescript
async fetchTrades(id: string, params?: HistoryFilterParams): Promise<Trade[]>
  ```

  **Parameters:**

  - `id` (string): id
  - `params` (HistoryFilterParams) - **Optional**: Filter parameters

  **Returns:** `Promise<Trade[]>` - Recent trades

    **Example:**

    ```typescript
    const trades = await kalshi.fetchTrades('FED-25JAN', {
  resolution: '1h',
  limit: 100
});
    ```

    **Notes:**
    **Note**: Polymarket requires API key. Use `fetchOHLCV` for public historical data.

    ---
### `fetchEvents`

Fetch Events

Fetch Events

**Signature:**

```typescript
async fetchEvents(params?: EventFetchParams): Promise<UnifiedEvent[]>
  ```

  **Parameters:**

  - `params` (EventFetchParams) - **Optional**: Filter parameters

  **Returns:** `Promise<UnifiedEvent[]>` - List of unified events

    **Example:**

    ```typescript
    // No example available
    ```


    ---
### `watchOrderBook`

Watch Order Book (WebSocket Stream)

Subscribe to real-time order book updates via WebSocket. Returns a promise that resolves with the next order book update. Call repeatedly in a loop to stream updates (CCXT Pro pattern).


**Signature:**

```typescript
async watchOrderBook(outcomeId: string, limit?: any): Promise<OrderBook>
  ```

  **Parameters:**

  - `outcomeId` (string): outcomeId
  - `limit` (any) - **Optional**: limit

  **Returns:** `Promise<OrderBook>` - Next order book update

    **Example:**

    ```typescript
    // No example available
    ```


    ---
### `watchTrades`

Watch Trades (WebSocket Stream)

Subscribe to real-time trade updates via WebSocket. Returns a promise that resolves with the next trade(s). Call repeatedly in a loop to stream updates (CCXT Pro pattern).


**Signature:**

```typescript
async watchTrades(outcomeId: string, since?: any, limit?: any): Promise<Trade[]>
  ```

  **Parameters:**

  - `outcomeId` (string): outcomeId
  - `since` (any) - **Optional**: since
  - `limit` (any) - **Optional**: limit

  **Returns:** `Promise<Trade[]>` - Next trade update(s)

    **Example:**

    ```typescript
    // No example available
    ```


    ---
### `watchPrices`

Watch Prices (WebSocket Stream)

Watch Prices (WebSocket Stream)

**Signature:**

```typescript
async watchPrices(): Promise<any>
  ```

  **Parameters:**

  - None

  **Returns:** `Promise<any>` - Price update

    **Example:**

    ```typescript
    // No example available
    ```


    ---
### `watchUserPositions`

Watch User Positions (WebSocket Stream)

Watch User Positions (WebSocket Stream)

**Signature:**

```typescript
async watchUserPositions(): Promise<any>
  ```

  **Parameters:**

  - None

  **Returns:** `Promise<any>` - User position update

    **Example:**

    ```typescript
    // No example available
    ```


    ---
### `watchUserTransactions`

Watch User Transactions (WebSocket Stream)

Watch User Transactions (WebSocket Stream)

**Signature:**

```typescript
async watchUserTransactions(): Promise<any>
  ```

  **Parameters:**

  - None

  **Returns:** `Promise<any>` - User transaction update

    **Example:**

    ```typescript
    // No example available
    ```


    ---
### `createOrder`

Create Order

Create Order

**Signature:**

```typescript
async createOrder(params?: CreateOrderParams): Promise<Order>
  ```

  **Parameters:**

  - `params` (CreateOrderParams) - **Optional**: Filter parameters

  **Returns:** `Promise<Order>` - Order created

    **Example:**

    ```typescript
    // Limit Order Example
const order = await polymarket.createOrder({
  marketId: '663583',
  outcomeId: '10991849228756847439673778874175365458450913336396982752046655649803657501964',
  side: 'buy',
  type: 'limit',
  amount: 10,        // Number of contracts
  price: 0.55        // Required for limit orders (0.0-1.0)
});

console.log(`Order ${order.id}: ${order.status}`);

// Market Order Example
const order = await kalshi.createOrder({
  marketId: 'FED-25JAN',
  outcomeId: 'FED-25JAN-YES',
  side: 'sell',
  type: 'market',
  amount: 5          // Price not needed for market orders
});
    ```


    ---
### `cancelOrder`

Cancel Order

Cancel Order

**Signature:**

```typescript
async cancelOrder(): Promise<Order>
  ```

  **Parameters:**

  - None

  **Returns:** `Promise<Order>` - Order cancelled

    **Example:**

    ```typescript
    const cancelledOrder = await polymarket.cancelOrder('order-123');
console.log(cancelledOrder.status); // 'cancelled'
    ```


    ---
### `fetchOrder`

Fetch Order

Fetch Order

**Signature:**

```typescript
async fetchOrder(): Promise<Order>
  ```

  **Parameters:**

  - None

  **Returns:** `Promise<Order>` - Order details

    **Example:**

    ```typescript
    const order = await kalshi.fetchOrder('order-456');
console.log(`Filled: ${order.filled}/${order.amount}`);
    ```


    ---
### `fetchOpenOrders`

Fetch Open Orders

Fetch Open Orders

**Signature:**

```typescript
async fetchOpenOrders(): Promise<Order[]>
  ```

  **Parameters:**

  - None

  **Returns:** `Promise<Order[]>` - List of open orders

    **Example:**

    ```typescript
    // All open orders
const allOrders = await polymarket.fetchOpenOrders();

// Open orders for specific market
const marketOrders = await kalshi.fetchOpenOrders('FED-25JAN');

allOrders.forEach(order => {
  console.log(`${order.side} ${order.amount} @ ${order.price}`);
});
    ```


    ---
### `fetchPositions`

Fetch Positions

Fetch Positions

**Signature:**

```typescript
async fetchPositions(): Promise<Position[]>
  ```

  **Parameters:**

  - None

  **Returns:** `Promise<Position[]>` - User positions

    **Example:**

    ```typescript
    const positions = await kalshi.fetchPositions();
positions.forEach(pos => {
  console.log(`${pos.outcomeLabel}: ${pos.size} @ $${pos.entryPrice}`);
  console.log(`Unrealized P&L: $${pos.unrealizedPnL}`);
});
    ```


    ---
### `fetchBalance`

Fetch Balance

Fetch Balance

**Signature:**

```typescript
async fetchBalance(): Promise<Balance[]>
  ```

  **Parameters:**

  - None

  **Returns:** `Promise<Balance[]>` - Account balances

    **Example:**

    ```typescript
    const balances = await polymarket.fetchBalance();
console.log(balances);
// [{ currency: 'USDC', total: 1000, available: 950, locked: 50 }]
    ```


    ---
### `getExecutionPrice`

Get Execution Price

Get Execution Price

**Signature:**

```typescript
async getExecutionPrice(orderBook: string, side: OrderBook, amount: OrderBook): Promise<any>
  ```

  **Parameters:**

  - `orderBook` (string): orderBook
  - `side` (OrderBook): side
  - `amount` (OrderBook): amount

  **Returns:** `Promise<any>` - Average execution price

    **Example:**

    ```typescript
    // No example available
    ```


    ---
### `getExecutionPriceDetailed`

Get Detailed Execution Price

Get Detailed Execution Price

**Signature:**

```typescript
async getExecutionPriceDetailed(orderBook: string, side: OrderBook, amount: OrderBook): Promise<ExecutionPriceResult>
  ```

  **Parameters:**

  - `orderBook` (string): orderBook
  - `side` (OrderBook): side
  - `amount` (OrderBook): amount

  **Returns:** `Promise<ExecutionPriceResult>` - Detailed execution result

    **Example:**

    ```typescript
    // No example available
    ```


    ---
### `filterMarkets`

Filter Markets

Filter a list of markets by criteria. Can filter by string query, structured criteria object, or custom filter function.


**Signature:**

```typescript
async filterMarkets(markets: any, criteria: any): Promise<UnifiedMarket[]>
  ```

  **Parameters:**

  - `markets` (any): markets
  - `criteria` (any): criteria

  **Returns:** `Promise<UnifiedMarket[]>` - Filtered markets

    **Example:**

    ```typescript
    // Simple text search
const filtered = poly.filterMarkets(markets, 'Trump');

// Advanced criteria
const undervalued = poly.filterMarkets(markets, {
    text: 'Election',
    volume24h: { min: 10000 },
    price: { outcome: 'yes', max: 0.4 }
});

// Custom function
const volatile = poly.filterMarkets(markets, m => 
    m.yes?.priceChange24h < -0.1
);
    ```


    ---
### `filterEvents`

Filter Events

Filter a list of events by criteria. Can filter by string query, structured criteria object, or custom filter function.


**Signature:**

```typescript
async filterEvents(events: any, criteria: any): Promise<UnifiedEvent[]>
  ```

  **Parameters:**

  - `events` (any): events
  - `criteria` (any): criteria

  **Returns:** `Promise<UnifiedEvent[]>` - Filtered events

    **Example:**

    ```typescript
    const filtered = poly.filterEvents(events, {
    category: 'Politics',
    marketCount: { min: 5 }
});
    ```


    ---
### `close`

Close WebSocket Connections

Close all WebSocket connections and cleanup resources. Call this when you're done streaming to properly release connections.


**Signature:**

```typescript
async close(): Promise<any>
  ```

  **Parameters:**

  - None

  **Returns:** `Promise<any>` - WebSocket connections closed successfully

    **Example:**

    ```typescript
    // No example available
    ```


    ---
### `searchMarkets`

searchMarkets



**Signature:**

```typescript
async searchMarkets(): Promise<any>
  ```

  **Parameters:**

  - None

  **Returns:** `Promise<any>` - 

    **Example:**

    ```typescript
    const results = await kalshi.searchMarkets('Fed rates', { 
  limit: 10,
  searchIn: 'title' // 'title' (default) | 'description' | 'both'
});
    ```


    ---
### `searchEvents`

searchEvents



**Signature:**

```typescript
async searchEvents(): Promise<any>
  ```

  **Parameters:**

  - None

  **Returns:** `Promise<any>` - 

    **Example:**

    ```typescript
    const events = await polymarket.searchEvents('Who will Trump nominate as Fed Chair?');
// Filter for specific market within the event
const warsh = polymarket.filterMarkets(events[0].markets, 'Kevin Warsh')[0];
    ```


    ---
### `getMarketsBySlug`

getMarketsBySlug



**Signature:**

```typescript
async getMarketsBySlug(): Promise<any>
  ```

  **Parameters:**

  - None

  **Returns:** `Promise<any>` - 

    **Example:**

    ```typescript
    // Polymarket: use URL slug
const polyMarkets = await polymarket.getMarketsBySlug('who-will-trump-nominate-as-fed-chair');

// Kalshi: use market ticker (auto-uppercased)
const kalshiMarkets = await kalshi.getMarketsBySlug('KXFEDCHAIRNOM-29');
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
const markets = await exchange.searchMarkets('Trump');
const market = markets[0];
const outcome = market.outcomes[0];

// 3. Place a limit order
const order = await exchange.createOrder({
  marketId: market.id,
  outcomeId: outcome.id,
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
    title: string; // 
    description: string; // 
    outcomes: MarketOutcome[]; // 
    resolutionDate: string; // 
    volume24h: number; // 
    volume: number; // 
    liquidity: number; // 
    openInterest: number; // 
    url: string; // 
    image: string; // 
    category: string; // 
    tags: string[]; // 
    yes: MarketOutcome; // 
    no: MarketOutcome; // 
    up: MarketOutcome; // 
    down: MarketOutcome; // 
    }
    ```

    ---
    ### `MarketOutcome`

    

    ```typescript
    interface MarketOutcome {
    outcomeId: string; // Outcome ID for trading operations (CLOB Token ID for Polymarket, Market Ticker for Kalshi)
    label: string; // 
    price: number; // 
    priceChange24h: number; // 
    metadata: object; // Exchange-specific metadata (e.g., clobTokenId for Polymarket)
    }
    ```

    ---
    ### `UnifiedEvent`

    A grouped collection of related markets (e.g., "Who will be Fed Chair?" contains multiple candidate markets)

    ```typescript
    interface UnifiedEvent {
    id: string; // 
    title: string; // 
    description: string; // 
    slug: string; // 
    markets: UnifiedMarket[]; // 
    url: string; // 
    image: string; // 
    category: string; // 
    tags: string[]; // 
    }
    ```

    ---
    ### `PriceCandle`

    

    ```typescript
    interface PriceCandle {
    timestamp: number; // 
    open: number; // 
    high: number; // 
    low: number; // 
    close: number; // 
    volume: number; // 
    }
    ```

    ---
    ### `OrderBook`

    

    ```typescript
    interface OrderBook {
    bids: OrderLevel[]; // 
    asks: OrderLevel[]; // 
    timestamp: number; // 
    }
    ```

    ---
    ### `OrderLevel`

    

    ```typescript
    interface OrderLevel {
    price: number; // 
    size: number; // 
    }
    ```

    ---
    ### `Trade`

    

    ```typescript
    interface Trade {
    id: string; // 
    price: number; // 
    amount: number; // 
    side: string; // 
    timestamp: number; // 
    }
    ```

    ---
    ### `Order`

    

    ```typescript
    interface Order {
    id: string; // 
    marketId: string; // 
    outcomeId: string; // 
    side: string; // 
    type: string; // 
    price: number; // 
    amount: number; // 
    status: string; // 
    filled: number; // 
    remaining: number; // 
    timestamp: number; // 
    fee: number; // 
    }
    ```

    ---
    ### `Position`

    

    ```typescript
    interface Position {
    marketId: string; // 
    outcomeId: string; // 
    outcomeLabel: string; // 
    size: number; // 
    entryPrice: number; // 
    currentPrice: number; // 
    unrealizedPnL: number; // 
    realizedPnL: number; // 
    }
    ```

    ---
    ### `Balance`

    

    ```typescript
    interface Balance {
    currency: string; // 
    total: number; // 
    available: number; // 
    locked: number; // 
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
    ### `ExchangeCredentials`

    Optional authentication credentials for exchange operations

    ```typescript
    interface ExchangeCredentials {
    apiKey: string; // API key for the exchange
    privateKey: string; // Private key for signing transactions
    apiSecret: string; // API secret (if required by exchange)
    passphrase: string; // Passphrase (if required by exchange)
    funderAddress: string; // The address funding the trades (Proxy address)
    signatureType: any; // Signature type (0=EOA, 1=Poly Proxy, 2=Gnosis Safe, or names like 'gnosis_safe')
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
    limit?: number; // 
    offset?: number; // 
    sort?: string; // 
    searchIn?: string; // 
    query?: string; // 
    slug?: string; // 
    page?: number; // 
    similarityThreshold?: number; // 
    }
    ```

    ---
    ### `EventFetchParams`

    

    ```typescript
    interface EventFetchParams {
    query?: string; // 
    limit?: number; // 
    offset?: number; // 
    searchIn?: string; // 
    }
    ```

    ---
    ### `HistoryFilterParams`

    

    ```typescript
    interface HistoryFilterParams {
    resolution: string; // 
    start?: string; // 
    end?: string; // 
    limit?: number; // 
    }
    ```

    ---
    ### `CreateOrderParams`

    

    ```typescript
    interface CreateOrderParams {
    marketId: string; // 
    outcomeId: string; // 
    side: string; // 
    type: string; // 
    amount: number; // 
    price?: number; // 
    fee?: number; // 
    }
    ```

    ---
