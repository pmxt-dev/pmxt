# pmxtjs

A unified TypeScript/Node.js SDK for prediction markets - The ccxt for prediction markets.

## Installation

```bash
npm install pmxtjs
```

## Quick Start

```typescript
import pmxt from 'pmxtjs';

// Initialize exchanges
const poly = new pmxt.Polymarket();
const kalshi = new pmxt.Kalshi();

// Search for markets
const markets = await poly.fetchMarkets({ query: 'Trump' });
console.log(markets[0].title);

// Get outcome details
const outcome = markets[0].outcomes[0];
console.log(`${outcome.label}: ${(outcome.price * 100).toFixed(1)}%`);

// Fetch historical data (use outcome.outcomeId!)
const candles = await poly.fetchOHLCV(outcome.outcomeId, {
    resolution: '1d',
    limit: 30
});

// Get current order book
const orderBook = await poly.fetchOrderBook(outcome.outcomeId);
const spread = orderBook.asks[0].price - orderBook.bids[0].price;
console.log(`Spread: ${(spread * 100).toFixed(2)}%`);
```

## Core Methods

### Market Data

- `fetchMarkets(params?)` - Get active markets
  ```typescript
  // Fetch recent markets
  await poly.fetchMarkets({ limit: 20, sort: 'volume' });

  // Search by text
  await poly.fetchMarkets({ query: 'Fed rates', limit: 10 });

  // Fetch by slug/ticker
  await poly.fetchMarkets({ slug: 'who-will-trump-nominate-as-fed-chair' });
  ```

- `fetchEvents(params?)` - Get events (groups of related markets)
  ```typescript
  await poly.fetchEvents({ query: 'Fed Chair', limit: 5 });
  ```

- `filterMarkets(markets, query)` - Filter markets by keyword
  ```typescript
  const events = await poly.fetchEvents({ query: 'Fed Chair' });
  const warsh = poly.filterMarkets(events[0].markets, 'Kevin Warsh')[0];
  ```

### Deep-Dive Methods

- `fetchOHLCV(outcomeId, params)` - Get historical price candles
- `fetchOrderBook(outcomeId)` - Get current bids/asks
- `fetchTrades(outcomeId, params)` - Get trade history

### Helper Methods

- `getExecutionPrice(orderBook, side, amount)` - Calculate volume-weighted average price
- `getExecutionPriceDetailed(orderBook, side, amount)` - Get detailed execution info

## Trading

### Authentication

**Polymarket:**
```typescript
const poly = new pmxt.Polymarket({
    privateKey: process.env.POLYMARKET_PRIVATE_KEY,
    proxyAddress: process.env.POLYMARKET_PROXY_ADDRESS, // Optional
    signatureType: 'gnosis-safe' // 'eoa' | 'poly-proxy' | 'gnosis-safe' (default: 'gnosis-safe')
});
```

**Kalshi:**
```typescript
const kalshi = new pmxt.Kalshi({
    apiKey: process.env.KALSHI_API_KEY,
    privateKey: process.env.KALSHI_PRIVATE_KEY
});
```

**Limitless:**
```typescript
const limitless = new pmxt.Limitless({
    privateKey: process.env.LIMITLESS_PRIVATE_KEY
});
```

### Trading Methods

- `createOrder(params)` - Place a new order
  ```typescript
  await poly.createOrder({
      marketId: market.marketId,
      outcomeId: outcome.outcomeId,
      side: 'buy',
      type: 'limit',
      amount: 10,
      price: 0.55
  });
  ```

- `cancelOrder(orderId)` - Cancel an open order
- `fetchOrder(orderId)` - Get order details
- `fetchOpenOrders(marketId?)` - Get all open orders

### Account Methods

- `fetchBalance()` - Get account balance
- `fetchPositions()` - Get current positions

## Documentation

For complete API documentation and examples, see:
- [API Reference](../../core/API_REFERENCE.md)
- [Examples](./examples/)
- [Setup Guides](../../core/docs/)

## Important Notes

- **Use `outcome.outcomeId`, not `market.marketId`** for deep-dive methods (fetchOHLCV, fetchOrderBook, fetchTrades)
- **Prices are 0.0 to 1.0** (multiply by 100 for percentages)
- **Timestamps are Unix milliseconds**
- **Volumes are in USD**

## License

MIT
