# pmxtjs

A unified TypeScript/Node.js SDK for supported prediction markets.
Hosted services are the default, with local sidecar access for self-hosted venue integrations.

> **Note**: Use with a PMXT API key (hosted, recommended) or run a local PMXT service. Get a key at [pmxt.dev/dashboard](https://pmxt.dev/dashboard).

## Installation

```bash
npm install pmxtjs
```

## Quick Start

Get your API key at [pmxt.dev/dashboard](https://pmxt.dev/dashboard). For reads, only `pmxtApiKey` and `walletAddress` are required.

```typescript
import { Polymarket } from "pmxtjs";

// Reads — pmxtApiKey + walletAddress only
const client = new Polymarket({
  pmxtApiKey: "pmxt_live_...",
  walletAddress: "0xYourWalletAddress",
});

// Search for markets
const markets = await client.fetchMarkets({ query: "Trump" });
console.log(markets[0].title);

// Get outcome details
const outcome = markets[0].outcomes[0];
console.log(`${outcome.label}: ${(outcome.price * 100).toFixed(1)}%`);

// Fetch historical data (use outcome.outcomeId!)
const candles = await client.fetchOHLCV(outcome.outcomeId, {
    resolution: '1d',
    limit: 30,
});

// Get current order book
const orderBook = await client.fetchOrderBook(outcome.outcomeId);
const spread = orderBook.asks[0].price - orderBook.bids[0].price;
console.log(`Spread: ${(spread * 100).toFixed(2)}%`);

// Account reads
const positions = await client.fetchPositions();
const balance = await client.fetchBalance();
```

### How it works (hosted)

When you pass `pmxtApiKey`, the SDK talks to PMXT's hosted services: catalog requests go to `api.pmxt.dev`, trading requests go to `trade.pmxt.dev`. The SDK does **not** spawn a local process. For Polymarket, Opinion, and Limitless, PMXT's PreFundedEscrow handles custody — you sign orders with your own key, PMXT settles on-chain.

### How it works (self-hosted)

Omit `pmxtApiKey` to use the local PMXT service. Install `pmxt-core` from npm and supply venue credentials directly. See [Self-hosted trading (advanced)](#self-hosted-trading-advanced) below.

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

### Hosted trading (recommended)

With a PMXT API key, pass `pmxtApiKey`, `walletAddress`, and `privateKey`. The SDK auto-wraps your key into an `EthersSigner` and PMXT settles the order on-chain.

**Polymarket:**
```typescript
import { Polymarket } from "pmxtjs";

const trader = new Polymarket({
  pmxtApiKey: "pmxt_live_...",
  walletAddress: "0xYourWalletAddress",
  privateKey: "0xYourPrivateKey",
});

const balance = await trader.fetchBalance();
console.log(`Available: $${balance[0].available}`);

const order = await trader.createOrder({
  marketId: "market-uuid",
  outcomeId: "outcome-uuid",
  side: "buy",
  type: "market",
  amount: 5.0,
  denom: "usdc",
  slippage_pct: 30.0,
});
console.log(`Order status: ${order.status}`);
```

**Opinion:**
```typescript
import { Opinion } from "pmxtjs";

const trader = new Opinion({
  pmxtApiKey: "pmxt_live_...",
  walletAddress: "0xYourWalletAddress",
  privateKey: "0xYourPrivateKey",
});
```

See the full [hosted trading guide](https://pmxt.dev/docs/concepts/hosted-trading) for venue support, custody model, and limits.

### Self-hosted trading (advanced)

When self-hosting, supply venue credentials directly — no `pmxtApiKey`. The SDK spawns a local PMXT service.

**Polymarket:**
```typescript
import { Polymarket } from "pmxtjs";

const poly = new Polymarket({
    privateKey: process.env.POLYMARKET_PRIVATE_KEY,
    proxyAddress: process.env.POLYMARKET_PROXY_ADDRESS, // Optional
    // signatureType: 'gnosis-safe' (default)
});
```

**Kalshi:**
```typescript
import { Kalshi } from "pmxtjs";

const kalshi = new Kalshi({
    apiKey: process.env.KALSHI_API_KEY,
    privateKey: process.env.KALSHI_PRIVATE_KEY
});
```

**Limitless:**
```typescript
import { Limitless } from "pmxtjs";

const limitless = new Limitless({
    privateKey: process.env.LIMITLESS_PRIVATE_KEY
});
```

### Trading Methods

- `createOrder(params)` - Place a new order
  ```typescript
  // Using outcome shorthand (recommended)
  const yes = market.yes;
  if (!yes) throw new Error("Market has no YES outcome");

  await poly.createOrder({
      outcome: yes,
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
