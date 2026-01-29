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
const markets &#x3D; await polymarket.fetchMarkets({ 
  limit: 20, 
  offset: 0,
  sort: &#x27;volume&#x27; // &#x27;volume&#x27; | &#x27;liquidity&#x27; | &#x27;newest&#x27;
});
```


---
### `searchMarkets`

Search Markets

Search for markets by title or description.

**Signature:**

```typescript
async searchMarkets(query: string, params?: MarketFilterParams): Promise<UnifiedMarket[]>
```

**Parameters:**

- `query` (string): Search query
- `params` (MarketFilterParams) - **Optional**: Filter parameters

**Returns:** `Promise<UnifiedMarket[]>` - Search results

**Example:**

```typescript
const results &#x3D; await kalshi.searchMarkets(&#x27;Fed rates&#x27;, { 
  limit: 10,
  searchIn: &#x27;title&#x27; // &#x27;title&#x27; (default) | &#x27;description&#x27; | &#x27;both&#x27;
});
```


---
### `getMarketsBySlug`

Get Market by Slug

Get Market by Slug

**Signature:**

```typescript
async getMarketsBySlug(): Promise<UnifiedMarket[]>
```

**Parameters:**

- None

**Returns:** `Promise<UnifiedMarket[]>` - Targeted market

**Example:**

```typescript
// Polymarket: use URL slug
const polyMarkets &#x3D; await polymarket.getMarketsBySlug(&#x27;who-will-trump-nominate-as-fed-chair&#x27;);

// Kalshi: use market ticker (auto-uppercased)
const kalshiMarkets &#x3D; await kalshi.getMarketsBySlug(&#x27;KXFEDCHAIRNOM-29&#x27;);
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
const markets &#x3D; await polymarket.searchMarkets(&#x27;Trump&#x27;);
const outcomeId &#x3D; markets[0].outcomes[0].id; // Get the outcome ID

const candles &#x3D; await polymarket.fetchOHLCV(outcomeId, {
  resolution: &#x27;1h&#x27;, // &#x27;1m&#x27; | &#x27;5m&#x27; | &#x27;15m&#x27; | &#x27;1h&#x27; | &#x27;6h&#x27; | &#x27;1d&#x27;
  start: new Date(&#x27;2024-01-01&#x27;),
  end: new Date(&#x27;2024-01-31&#x27;),
  limit: 100
});
```

**Notes:**
**CRITICAL**: Use &#x60;outcome.id&#x60;, not &#x60;market.id&#x60;.
- **Polymarket**: &#x60;outcome.id&#x60; is the CLOB Token ID
- **Kalshi**: &#x60;outcome.id&#x60; is the Market Ticker

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
const orderBook &#x3D; await kalshi.fetchOrderBook(&#x27;FED-25JAN&#x27;);
console.log(&#x27;Best bid:&#x27;, orderBook.bids[0].price);
console.log(&#x27;Best ask:&#x27;, orderBook.asks[0].price);
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
const trades &#x3D; await kalshi.fetchTrades(&#x27;FED-25JAN&#x27;, {
  resolution: &#x27;1h&#x27;,
  limit: 100
});
```

**Notes:**
**Note**: Polymarket requires API key. Use &#x60;fetchOHLCV&#x60; for public historical data.

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
const order &#x3D; await polymarket.createOrder({
  marketId: &#x27;663583&#x27;,
  outcomeId: &#x27;10991849228756847439673778874175365458450913336396982752046655649803657501964&#x27;,
  side: &#x27;buy&#x27;,
  type: &#x27;limit&#x27;,
  amount: 10,        // Number of contracts
  price: 0.55        // Required for limit orders (0.0-1.0)
});

console.log(&#x60;Order ${order.id}: ${order.status}&#x60;);

// Market Order Example
const order &#x3D; await kalshi.createOrder({
  marketId: &#x27;FED-25JAN&#x27;,
  outcomeId: &#x27;FED-25JAN-YES&#x27;,
  side: &#x27;sell&#x27;,
  type: &#x27;market&#x27;,
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
const cancelledOrder &#x3D; await polymarket.cancelOrder(&#x27;order-123&#x27;);
console.log(cancelledOrder.status); // &#x27;cancelled&#x27;
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
const order &#x3D; await kalshi.fetchOrder(&#x27;order-456&#x27;);
console.log(&#x60;Filled: ${order.filled}/${order.amount}&#x60;);
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
const allOrders &#x3D; await polymarket.fetchOpenOrders();

// Open orders for specific market
const marketOrders &#x3D; await kalshi.fetchOpenOrders(&#x27;FED-25JAN&#x27;);

allOrders.forEach(order &#x3D;&gt; {
  console.log(&#x60;${order.side} ${order.amount} @ ${order.price}&#x60;);
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
const positions &#x3D; await kalshi.fetchPositions();
positions.forEach(pos &#x3D;&gt; {
  console.log(&#x60;${pos.outcomeLabel}: ${pos.size} @ $${pos.entryPrice}&#x60;);
  console.log(&#x60;Unrealized P&amp;L: $${pos.unrealizedPnL}&#x60;);
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
const balances &#x3D; await polymarket.fetchBalance();
console.log(balances);
// [{ currency: &#x27;USDC&#x27;, total: 1000, available: 950, locked: 50 }]
```


---

## Complete Trading Workflow

```typescript
import pmxt from &#x27;pmxtjs&#x27;;

const exchange &#x3D; new pmxt.Polymarket({
  privateKey: process.env.POLYMARKET_PRIVATE_KEY
});

// 1. Check balance
const [balance] &#x3D; await exchange.fetchBalance();
console.log(&#x60;Available: $${balance.available}&#x60;);

// 2. Search for a market
const markets &#x3D; await exchange.searchMarkets(&#x27;Trump&#x27;);
const market &#x3D; markets[0];
const outcome &#x3D; market.outcomes[0];

// 3. Place a limit order
const order &#x3D; await exchange.createOrder({
  marketId: market.id,
  outcomeId: outcome.id,
  side: &#x27;buy&#x27;,
  type: &#x27;limit&#x27;,
  amount: 10,
  price: 0.50
});

console.log(&#x60;Order placed: ${order.id}&#x60;);

// 4. Check order status
const updatedOrder &#x3D; await exchange.fetchOrder(order.id);
console.log(&#x60;Status: ${updatedOrder.status}&#x60;);
console.log(&#x60;Filled: ${updatedOrder.filled}/${updatedOrder.amount}&#x60;);

// 5. Cancel if needed
if (updatedOrder.status &#x3D;&#x3D;&#x3D; &#x27;open&#x27;) {
  await exchange.cancelOrder(order.id);
  console.log(&#x27;Order cancelled&#x27;);
}

// 6. Check positions
const positions &#x3D; await exchange.fetchPositions();
positions.forEach(pos &#x3D;&gt; {
  console.log(&#x60;${pos.outcomeLabel}: ${pos.unrealizedPnL &gt; 0 ? &#x27;+&#x27; : &#x27;&#x27;}$${pos.unrealizedPnL.toFixed(2)}&#x60;);
});
```

## Data Models

### `UnifiedMarket`



```typescript
interface UnifiedMarket {
  id: string; // 
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
  yes: MarketOutcome; // Convenience access to Yes outcome
  no: MarketOutcome; // Convenience access to No outcome
  up: MarketOutcome; // Alias for .yes (used for Up/Down markets)
  down: MarketOutcome; // Alias for .no (used for Up/Down markets)
}
```

**Binary Outcome Mapping Logic:**

PMXT automatically identifies binary outcomes for markets with exactly two outcomes using the following priority:
1. **Explicit Labels**: Matches "Yes", "Up", or "Over".
2. **Opposite Pattern**: Matches pairs like "Kevin Warsh" and "Not Kevin Warsh", identifying the non-"Not" side as `yes`.
3. **Fallback**: If no pattern is matched, index 0 is mapped to `yes/up` and index 1 to `no/down`.

---
### `MarketOutcome`



```typescript
interface MarketOutcome {
  id: string; // 
  label: string; // 
  price: number; // 
  priceChange24h: number; // 
  metadata: object; // Exchange-specific metadata (e.g., clobTokenId for Polymarket)
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
### `ExchangeCredentials`

Optional authentication credentials for exchange operations

```typescript
interface ExchangeCredentials {
  apiKey: string; // API key for the exchange
  privateKey: string; // Private key for signing transactions
  apiSecret: string; // API secret (if required by exchange)
  passphrase: string; // Passphrase (if required by exchange)
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
}
```

---
