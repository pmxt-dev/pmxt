# Prediction Market API Reference

A unified interface for interacting with multiple prediction market exchanges and venues through one interface.

## Installation & Usage

```bash
npm install pmxtjs
```

### Import Styles

```typescript
import { Polymarket, Kalshi } from 'pmxtjs';

const polymarket = new Polymarket();
const kalshi = new Kalshi();
```

```typescript
import pmxt from 'pmxtjs';

const polymarket = new pmxt.Polymarket();
const kalshi = new pmxt.Kalshi();
```

---

## Core Methods

### `fetchMarkets(params?)`
Get active markets from an exchange. This is the unified method for all market fetching operations.

**Parameters**:
- `limit`: Number of results (default: 20)
- `offset`: Pagination offset
- `sort`: 'volume' | 'liquidity' | 'newest'
- `query`: Search text
- `slug`: Market slug or ticker

```typescript
// 1. Fetch recent markets
const markets = await polymarket.fetchMarkets({ 
  limit: 20, 
  sort: 'volume' 
});

// 2. Search by text
const results = await kalshi.fetchMarkets({ 
  query: 'Fed rates',
  limit: 10
});

// 3. Fetch by slug/ticker
const market = await polymarket.fetchMarkets({ 
  slug: 'who-will-trump-nominate-as-fed-chair'
});
```

### `fetchEvents(params?)`
Get events (groups of related markets). Unified method for event fetching.

**Parameters**:
- `query`: Search text
- `limit`: Number of results
- `offset`: Pagination offset

```typescript
// Search for events
const events = await polymarket.fetchEvents({ 
  query: 'Fed Chair',
  limit: 5 
});
```

---



---

## Deep-Dive Methods

### `fetchOHLCV(outcomeId, params)`
Get historical price candles.

**CRITICAL**: Use `outcome.outcomeId`, not `market.marketId`.
- **Polymarket**: `outcome.outcomeId` is the CLOB Token ID
- **Kalshi**: `outcome.outcomeId` is the Market Ticker

```typescript
const markets = await polymarket.fetchMarkets({ query: 'Trump' });
const outcomeId = markets[0].outcomes[0].outcomeId; // Get the outcome ID

const candles = await polymarket.fetchOHLCV(outcomeId, {
  resolution: '1h', // '1m' | '5m' | '15m' | '1h' | '6h' | '1d'
  start: new Date('2024-01-01'),
  end: new Date('2024-01-31'),
  limit: 100
});
```

### `fetchOrderBook(outcomeId)`
Get current bids/asks.

```typescript
const orderBook = await kalshi.fetchOrderBook('FED-25JAN');
console.log('Best bid:', orderBook.bids[0].price);
console.log('Best ask:', orderBook.asks[0].price);
```

### `fetchTrades(outcomeId, params)`
Get trade history.

**Note**: Polymarket requires API key. Use `fetchOHLCV` for public historical data.

```typescript
const trades = await kalshi.fetchTrades('FED-25JAN', {
  limit: 100
});
```

---

## Helper Methods

### `getExecutionPrice(orderBook, side, amount)`
Calculate the volume-weighted average price for a given amount. Returns `0` if there is insufficient liquidity to fully fill the amount.

```typescript
const orderBook = await polymarket.fetchOrderBook(outcomeId);
const price = polymarket.getExecutionPrice(orderBook, 'buy', 100);
console.log(`Average price for 100 shares: ${price}`);
```

### `getExecutionPriceDetailed(orderBook, side, amount)`
Calculate detailed execution price information, including partial fills.

```typescript
const detailed = polymarket.getExecutionPriceDetailed(orderBook, 'buy', 100);
console.log(`Average Price: ${detailed.price}`);
console.log(`Filled Amount: ${detailed.filledAmount}`);
console.log(`Fully Filled: ${detailed.fullyFilled}`);
```

---

## Data Models

### `UnifiedMarket`
```typescript
{
  marketId: string;        // Market ID (use this for createOrder)
  title: string;
  description: string;
  outcomes: MarketOutcome[]; // All tradeable outcomes

  resolutionDate: Date;
  volume24h: number;       // USD
  volume?: number;         // Total volume (USD)
  liquidity: number;       // USD
  openInterest?: number;   // USD

  url: string;
  image?: string;
  category?: string;
  tags?: string[];
}
```

### `MarketOutcome`
```typescript
{
  outcomeId: string;       // Use this for fetchOHLCV/fetchOrderBook/fetchTrades
                           // Polymarket: CLOB Token ID
                           // Kalshi: Market Ticker
  label: string;           // "Trump", "Yes", etc.
  price: number;           // 0.0 to 1.0 (probability)
  priceChange24h?: number;
  metadata?: {
    clobTokenId?: string;  // Polymarket only
  }
}
```

### Other Types
```typescript
interface PriceCandle {
  timestamp: number;       // Unix ms
  open: number;            // 0.0 to 1.0
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface OrderBook {
  bids: OrderLevel[];      // Sorted high to low
  asks: OrderLevel[];      // Sorted low to high
  timestamp?: number;
}

interface OrderLevel {
  price: number;           // 0.0 to 1.0
  size: number;            // Contracts
}

interface Trade {
  id: string;
  timestamp: number;       // Unix ms
  price: number;           // 0.0 to 1.0
  amount: number;
  side: 'buy' | 'sell' | 'unknown';
}

interface ExecutionPriceResult {
  price: number;           // Average execution price
  filledAmount: number;    // Amount filled (shares)
  fullyFilled: boolean;    // If the requested amount was met
}
```

---

## Complete Workflow Example

```typescript
// 1. Search for markets
const markets = await polymarket.fetchMarkets({ query: 'Fed Chair' });
const market = markets[0];

// 2. Get outcome details
const outcome = market.outcomes[0];
console.log(`${outcome.label}: ${(outcome.price * 100).toFixed(1)}%`);

// 3. Fetch historical data (use outcome.outcomeId!)
const candles = await polymarket.fetchOHLCV(outcome.outcomeId, {
  resolution: '1d',
  limit: 30
});

// 4. Get current order book
const orderBook = await polymarket.fetchOrderBook(outcome.outcomeId);
const spread = orderBook.asks[0].price - orderBook.bids[0].price;
console.log(`Spread: ${(spread * 100).toFixed(2)}%`);
```

---

## Exchange Differences

| Feature | Polymarket | Kalshi |
|---------|-----------|--------|
| **Sorting** | Server-side | Client-side (slower for large sets) |
| **Market ID** | UUID | Event Ticker (e.g., "PRES-2024") |
| **Outcome ID** | CLOB Token ID | Market Ticker (e.g., "FED-25JAN") |
| **OHLCV Quality** | Synthetic (O=H=L=C) | Native (distinct values) |
| **Auth Required** | Only for `fetchTrades()` | No (all public) |
| **Slug Format** | lowercase-with-hyphens | UPPERCASE (auto-normalized) |

---

## Error Handling

```typescript
try {
  const market = await kalshi.fetchMarket({ slug: 'INVALID-TICKER' });
  console.log(market.title);
} catch (error) {
  // Throws MarketNotFound when no market matches the lookup
  console.error(error.message);
}
```

**Common Errors**:
- `404`: Market/event doesn't exist
- `401`: Missing API key (Polymarket `fetchTrades`)
- `429`: Rate limited
- `500`: Exchange API issue

---

## Type Exports

```typescript
import pmxt, { 
  UnifiedMarket,
  MarketOutcome,
  PriceCandle,
  OrderBook,
  Trade,
  CandleInterval,
  MarketFilterParams,
  HistoryFilterParams
} from 'pmxtjs';
```

---

## Authentication & Trading

Authenticated trading is available on venues that expose trading APIs. You must provide the venue-specific credentials when initializing the exchange; the examples below show Polymarket and Kalshi.

### Polymarket Authentication

Requires your **Polygon Private Key**. See [Setup Guide](https://github.com/pmxt-dev/pmxt/blob/main/docs/SETUP_POLYMARKET.md) for details.

```typescript
import pmxt from 'pmxtjs';

const polymarket = new pmxt.Polymarket({
  privateKey: process.env.POLYMARKET_PRIVATE_KEY,
  funderAddress: process.env.POLYMARKET_PROXY_ADDRESS, // Optional: Proxy address
  signatureType: 'gnosis-safe' // 'eoa' | 'poly-proxy' | 'gnosis-safe'
});
```

### Kalshi Authentication

Requires **API Key** and **Private Key**.

```typescript
import pmxt from 'pmxtjs';

const kalshi = new pmxt.Kalshi({
  apiKey: process.env.KALSHI_API_KEY,
  privateKey: process.env.KALSHI_PRIVATE_KEY
});
```

---

## Account Methods

### `fetchBalance()`
Get your account balance.

```typescript
const balances = await polymarket.fetchBalance();
console.log(balances);
// [{ currency: 'USDC', total: 1000, available: 950, locked: 50 }]
```

**Returns**: `Balance[]`
```typescript
interface Balance {
  currency: string;   // e.g., 'USDC'
  total: number;      // Total balance
  available: number;  // Available for trading
  locked: number;     // Locked in open orders
}
```

### `fetchPositions()`
Get your current positions across all markets.

```typescript
const positions = await kalshi.fetchPositions();
positions.forEach(pos => {
  console.log(`${pos.outcomeLabel}: ${pos.size} @ $${pos.entryPrice}`);
  console.log(`Unrealized P&L: $${pos.unrealizedPnL}`);
});
```

**Returns**: `Position[]`
```typescript
interface Position {
  marketId: string;
  outcomeId: string;
  outcomeLabel: string;
  size: number;           // Positive for long, negative for short
  entryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  realizedPnL?: number;
}
```

---

## Trading Methods

### `createOrder(params)`
Place a new order (market or limit).

**Limit Order Example**:
```typescript
const order = await polymarket.createOrder({
  marketId: '663583',
  outcomeId: '10991849228756847439673778874175365458450913336396982752046655649803657501964',
  side: 'buy',
  type: 'limit',
  amount: 10,        // Number of contracts
  price: 0.55        // Required for limit orders (0.0-1.0)
});

console.log(`Order ${order.id}: ${order.status}`);
```

**Market Order Example**:
```typescript
const order = await kalshi.createOrder({
  marketId: 'FED-25JAN',
  outcomeId: 'FED-25JAN-YES',
  side: 'sell',
  type: 'market',
  amount: 5          // Price not needed for market orders
});
```

**Parameters**: `CreateOrderParams`
```typescript
interface CreateOrderParams {
  marketId: string;       // Use market.marketId from market data
  outcomeId: string;      // Use outcome.outcomeId from market data
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  amount: number;         // Number of contracts/shares
  price?: number;         // Required for limit orders (0.0-1.0)
}
```

**Returns**: `Order`
```typescript
interface Order {
  id: string;
  marketId: string;
  outcomeId: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  price?: number;
  amount: number;
  status: 'pending' | 'open' | 'filled' | 'cancelled' | 'rejected';
  filled: number;         // Amount filled so far
  remaining: number;      // Amount remaining
  timestamp: number;
  fee?: number;
}
```

### `cancelOrder(orderId)`
Cancel an open order.

```typescript
const cancelledOrder = await polymarket.cancelOrder('order-123');
console.log(cancelledOrder.status); // 'cancelled'
```

**Returns**: `Order` (with updated status)

### `fetchOrder(orderId)`
Get details of a specific order.

```typescript
const order = await kalshi.fetchOrder('order-456');
console.log(`Filled: ${order.filled}/${order.amount}`);
```

**Returns**: `Order`

### `fetchOpenOrders(marketId?)`
Get all open orders, optionally filtered by market.

```typescript
// All open orders
const allOrders = await polymarket.fetchOpenOrders();

// Open orders for specific market
const marketOrders = await kalshi.fetchOpenOrders('FED-25JAN');

allOrders.forEach(order => {
  console.log(`${order.side} ${order.amount} @ ${order.price}`);
});
```

**Returns**: `Order[]`

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
const outcome = market.outcomes[0];

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

---

## Quick Reference

- **Prices**: Always 0.0-1.0 (multiply by 100 for %)
- **Timestamps**: Unix milliseconds
- **Volumes**: USD
- **IDs**: Use `outcome.outcomeId` for deep-dive methods (fetchOHLCV, fetchOrderBook, fetchTrades), and `market.marketId` for trading operations
- **Authentication**: Required for all trading and account methods

For more examples, see [`examples/`](examples/).

