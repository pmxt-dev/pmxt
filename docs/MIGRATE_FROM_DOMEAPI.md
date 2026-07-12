# Migrating from DomeAPI to pmxt

> **DomeAPI shut down on March 31, 2025.** Polymarket acquired DomeAPI and discontinued the service. If you relied on DomeAPI for market data or trading, you need to migrate to a replacement.

This guide helps you migrate your prediction market integration from [DomeAPI](https://docs.domeapi.io/) to pmxt.

## Why migrate?

| | DomeAPI | pmxt |
|---|---|---|
| **Authentication** | API key (paid tiers) | No API key for market data |
| **Exchanges** | Polymarket, Kalshi | Supported venue catalog (Polymarket, Kalshi, Limitless, Smarkets, Opinion, and more) |
| **Trading** | Order router (linked wallet) | Native (your private key, direct on-chain) |
| **License** | Proprietary service | Open source (MIT) |
| **Rate limits** | Tiered (10-300 QPS) | Exchange-native |

---

## Installation

**Before (DomeAPI):**
```bash
# TypeScript
npm install @dome-api/sdk

# Python
pip install dome-api-sdk
```

**After (pmxt):**
```bash
# TypeScript
npm install pmxtjs

# Python
pip install pmxt
# Also requires Node.js for the local server:
npm install -g pmxtjs
```

---

## Client initialization

**Before (DomeAPI):**
```typescript
// TypeScript
import { DomeClient } from '@dome-api/sdk';
const dome = new DomeClient({ apiKey: 'your-api-key-here' });
```
```python
# Python
from dome_api_sdk import DomeClient
dome = DomeClient({"api_key": "your-api-key-here"})
```

**After (pmxt):**
```typescript
// TypeScript
import pmxt from 'pmxtjs';
const poly = new pmxt.Polymarket();
const kalshi = new pmxt.Kalshi();
```
```python
# Python
import pmxt
poly = pmxt.Polymarket()
kalshi = pmxt.Kalshi()
```

No API key required for market data. The pmxt server starts automatically on first use.

---

## Method mapping

### Market price

**Before (DomeAPI):**
```typescript
const price = await dome.polymarket.markets.getMarketPrice({ token_id: '...' });
```
```python
price = dome.polymarket.markets.get_market_price({"token_id": "..."})
```

**After (pmxt):**
```typescript
const markets = await poly.fetchMarkets({ query: 'Trump' });
const price = markets[0].yes?.price; // 0.0 to 1.0
```
```python
markets = poly.fetch_markets(query='Trump')
price = markets[0].yes.price  # 0.0 to 1.0
```

> Note: DomeAPI returns price as a raw value. pmxt prices are always 0.0-1.0 (probability). Multiply by 100 for percentage.

---

### Markets search

**Before (DomeAPI REST):**
```
GET https://api.domeapi.io/v1/polymarket/markets
  ?search=Trump
  &status=open
  &min_volume=10000
  &limit=20
  &pagination_key=<cursor>
```

**After (pmxt):**
```typescript
const markets = await poly.fetchMarkets({
  query: 'Trump',
  status: 'active',
  limit: 20,
  offset: 0,   // offset-based, not cursor-based
});
```
```python
markets = poly.fetch_markets(
    query='Trump',
    status='active',
    limit=20,
    offset=0,
)
```

**Pagination change**: DomeAPI uses cursor-based pagination (`pagination_key`). pmxt uses offset-based pagination (`offset`).

**Filter by slug/condition_id:**
```typescript
// DomeAPI: filter by market_slug or condition_id query params
// pmxt: use the slug param
const markets = await poly.fetchMarkets({ slug: 'will-trump-win-the-2024-election' });
```

---

### Events

**Before (DomeAPI):**
```
GET https://api.domeapi.io/v1/polymarket/events
  ?search=Fed+Chair
  &status=open
```

**After (pmxt):**
```typescript
const events = await poly.fetchEvents({ query: 'Fed Chair' });
const market = events[0].markets.match('Kevin Warsh');
console.log(market.yes?.price);
```
```python
events = poly.fetch_events(query='Fed Chair')
market = events[0].markets.match('Kevin Warsh')
print(market.yes.price)
```

---

### Candlesticks (OHLCV)

**Before (DomeAPI):**
```
GET https://api.domeapi.io/v1/polymarket/candlestick
  ?condition_id=<condition_id>
  &interval=1h
  &start_ts=<unix_seconds>
  &end_ts=<unix_seconds>
```

**After (pmxt):**

The key difference: pmxt takes an `outcome_id`, not a `condition_id`. Use `outcome.outcomeId` (TypeScript) or `outcome.outcome_id` (Python).

```typescript
const markets = await poly.fetchMarkets({ query: 'Trump' });
const outcomeId = markets[0].outcomes[0].outcomeId; // NOT market.marketId

const candles = await poly.fetchOHLCV(outcomeId, {
  resolution: '1h',                  // '1m' | '5m' | '15m' | '1h' | '6h' | '1d'
  start: new Date('2025-01-01'),     // Date object (not unix seconds)
  end: new Date('2025-02-01'),
  limit: 100,
});

// candle.timestamp is Unix milliseconds (DomeAPI may differ)
```
```python
markets = poly.fetch_markets(query='Trump')
outcome_id = markets[0].outcomes[0].outcome_id  # NOT market.market_id

candles = poly.fetch_ohlcv(
    outcome_id,
    resolution='1h',
    start='2025-01-01',
    end='2025-02-01',
    limit=100,
)
# candle.timestamp is Unix milliseconds
```

**Interval name changes:**

| DomeAPI | pmxt |
|---------|------|
| `1m` | `1m` |
| `5m` | `5m` |
| `15m` | `15m` |
| `1h` | `1h` |
| `6h` | `6h` |
| `1d` | `1d` |

---

### Order book

**Before (DomeAPI):**
```
GET https://api.domeapi.io/v1/polymarket/orderbook-history
  ?token_id=<token_id>
  &start_ts=...
  &end_ts=...
```

> DomeAPI historical orderbook snapshots map to PMXT Archive-backed `fetchOrderBook` / `fetch_order_book` with `since` / `until` params where supported; omit archive params for the current live order book.

**After (pmxt):**
```typescript
const markets = await poly.fetchMarkets({ query: 'Trump' });
const outcomeId = markets[0].outcomes[0].outcomeId;

const book = await poly.fetchOrderBook(outcomeId);
console.log('Best bid:', book.bids[0].price);
console.log('Best ask:', book.asks[0].price);

const history = await poly.fetchOrderBook(outcomeId, undefined, {
  since: 1710000000000,
  until: 1710003600000,
  outcome: 'yes',
  limit: 100,
});
const snapshots = Array.isArray(history) ? history : [history];
console.log('Historical snapshots:', snapshots.length);
```
```python
markets = poly.fetch_markets(query='Trump')
outcome_id = markets[0].outcomes[0].outcome_id

book = poly.fetch_order_book(outcome_id)
print('Best bid:', book.bids[0].price)
print('Best ask:', book.asks[0].price)

history = poly.fetch_order_book(
    outcome_id,
    params={
        "since": 1710000000000,
        "until": 1710003600000,
        "outcome": "yes",
        "limit": 100,
    },
)
print("Historical snapshots:", len(history))
```

**Calculate execution price** (new in pmxt, not in DomeAPI):
```typescript
const price = poly.getExecutionPrice(book, 'buy', 100); // avg price for 100 shares
```
```python
price = poly.get_execution_price(book, 'buy', 100)
```

---

### Trade history

**Before (DomeAPI):**
```
GET https://api.domeapi.io/v1/polymarket/trade-history
  ?token_id=<token_id>
  &start_ts=<unix_seconds>
  &end_ts=<unix_seconds>
```

**After (pmxt):**
```typescript
const trades = await poly.fetchTrades(outcomeId, {
  start: new Date('2025-01-01'),
  end: new Date('2025-02-01'),
  limit: 100,
});
```
```python
trades = poly.fetch_trades(
    outcome_id,
    start='2025-01-01',
    end='2025-02-01',
    limit=100,
)
```

**Time format change**: DomeAPI uses Unix seconds. pmxt uses `Date` objects (TypeScript) or ISO strings (Python). Returned timestamps are Unix **milliseconds** in both.

---

### Positions

**Before (DomeAPI):**
```
GET https://api.domeapi.io/v1/polymarket/positions
  ?wallet=<address>
```
DomeAPI fetches positions for any wallet address publicly.

**After (pmxt):**
```typescript
// Requires authentication - fetches YOUR positions
const positions = await poly.fetchPositions();
positions.forEach(pos => {
  console.log(`${pos.outcomeLabel}: ${pos.size} @ $${pos.entryPrice}`);
  console.log(`Unrealized P&L: $${pos.unrealizedPnL}`);
});
```
```python
positions = poly.fetch_positions()
for pos in positions:
    print(f"{pos.outcome_label}: {pos.size} @ ${pos.entry_price}")
    print(f"Unrealized P&L: ${pos.unrealized_pnl:.2f}")
```

> pmxt does not support looking up arbitrary wallet positions by address. It only returns your own positions via authenticated requests.

---

### Wallet P&L

DomeAPI provides `wallet/pnl` for realized P&L by wallet address. pmxt does not have a direct equivalent - use `fetchPositions()` which includes `unrealized_pnl` and `realized_pnl` fields for your own account.

---

### Real-time data (WebSocket)

**Before (DomeAPI):**
```typescript
// DomeAPI WebSocket for Polymarket order data
const ws = dome.polymarket.websocket.subscribe({ token_id: '...' });
```

**After (pmxt):**
```typescript
const outcomeId = markets[0].outcomes[0].outcomeId;

// Stream order book updates
for await (const book of poly.watchOrderBook(outcomeId)) {
  console.log('Best bid:', book.bids[0].price);
}

// Stream trades
for await (const trade of poly.watchTrades(outcomeId)) {
  console.log('Trade:', trade.price, trade.amount);
}
```
```python
# Python (async generator)
async for book in poly.watch_order_book(outcome_id):
    print('Best bid:', book.bids[0].price)
```

---

## Trading (new in pmxt)

DomeAPI has an "Order Router" that requires linking your wallet. pmxt trades directly using your private key.

### Setup (Polymarket)

```typescript
import pmxt from 'pmxtjs';

const exchange = new pmxt.Polymarket({
  privateKey: process.env.POLYMARKET_PRIVATE_KEY,
  funderAddress: process.env.POLYMARKET_PROXY_ADDRESS, // optional
});
```
```python
import os
import pmxt

exchange = pmxt.Polymarket(
    private_key=os.getenv('POLYMARKET_PRIVATE_KEY'),
    proxy_address=os.getenv('POLYMARKET_PROXY_ADDRESS'),  # optional
)
```

### Place an order

```typescript
const markets = await exchange.fetchMarkets({ query: 'Trump' });
const order = await exchange.createOrder({
  marketId: markets[0].marketId,
  outcomeId: markets[0].yes?.outcomeId,
  side: 'buy',
  type: 'limit',
  amount: 10,   // contracts
  price: 0.55,  // 0.0-1.0
});
```
```python
markets = exchange.fetch_markets(query='Trump')
order = exchange.create_order(
    outcome=markets[0].yes,  # shorthand
    side='buy',
    type='limit',
    amount=10,
    price=0.55,
)
```

---

## Data model changes

### Market ID and Outcome ID

| DomeAPI | pmxt |
|---------|------|
| `condition_id` | `market.marketId` / `market.market_id` |
| `token_id` | `outcome.outcomeId` / `outcome.outcome_id` |
| `market_slug` | `market.url` (full URL) |

### Outcome structure

**Before (DomeAPI):**
```json
{
  "side_a": { "id": "...", "label": "Yes" },
  "side_b": { "id": "...", "label": "No" }
}
```

**After (pmxt):**
```typescript
market.outcomes        // all outcomes as array
market.yes             // shorthand for binary Yes outcome
market.no              // shorthand for binary No outcome
market.outcomes[0].outcomeId
market.outcomes[0].label
market.outcomes[0].price  // 0.0 to 1.0
```

### Price scale

| DomeAPI | pmxt |
|---------|------|
| Varies (check docs) | Always 0.0 to 1.0 (multiply by 100 for %) |

### Timestamp format

| DomeAPI | pmxt |
|---------|------|
| Unix seconds (some endpoints) | Unix **milliseconds** (all endpoints) |

```python
# Convert pmxt timestamp to datetime
from datetime import datetime
dt = datetime.fromtimestamp(candle.timestamp / 1000)
```

### Pagination

| DomeAPI | pmxt |
|---------|------|
| Cursor-based (`pagination_key`) | Offset-based (`limit` + `offset`) |

---

## Feature gaps and replacements

Some DomeAPI features map to a different PMXT surface or have no direct equivalent:

| DomeAPI feature | pmxt alternative |
|---|---|
| Wallet positions by address | `fetch_positions()` (own account only) |
| Wallet P&L by address | `fetch_positions()` unrealized/realized P&L |
| Sports cross-platform matching | Not available |
| Binance / Chainlink price feeds | Feed API via `FeedClient` and `/api/feeds/{feed}/...` endpoints |
| Activity feed by wallet | Not available |
| Historical orderbook snapshots | Historical `fetch_order_book(..., params={...})` via PMXT Archive where supported; live `watch_order_book()` for streaming |

---

## Multi-exchange support (new in pmxt)

pmxt uses the same method names across venues that implement each capability:

```typescript
import pmxt from 'pmxtjs';

const poly = new pmxt.Polymarket();
const kalshi = new pmxt.Kalshi();
const limitless = new pmxt.Limitless();

// Same method names where each venue supports the capability
const polyMarkets = await poly.fetchMarkets({ query: 'Fed Chair' });
const kalshiMarkets = await kalshi.fetchMarkets({ query: 'Fed Chair' });
```

---

## Quick reference

| Task | DomeAPI | pmxt (TypeScript) | pmxt (Python) |
|---|---|---|---|
| Get market price | `getMarketPrice({ token_id })` | `fetchMarkets({ query })` then `.yes.price` | `fetch_markets(query=...)` then `.yes.price` |
| Search markets | `GET /polymarket/markets?search=` | `fetchMarkets({ query })` | `fetch_markets(query=...)` |
| Get OHLCV | `GET /polymarket/candlestick?condition_id=` | `fetchOHLCV(outcomeId, { resolution })` | `fetch_ohlcv(outcome_id, resolution=...)` |
| Get order book history | `GET /polymarket/orderbook-history?token_id=` | `fetchOrderBook(outcomeId, undefined, { since, until, outcome })` | `fetch_order_book(outcome_id, params={...})` |
| Get trades | `GET /polymarket/trade-history?token_id=` | `fetchTrades(outcomeId, params)` | `fetch_trades(outcome_id, ...)` |
| Real-time book | WebSocket subscribe | `watchOrderBook(outcomeId)` | `watch_order_book(outcome_id)` |
| Place order | Order Router API | `createOrder(params)` | `create_order(...)` |
| Get positions | `GET /polymarket/positions?wallet=` | `fetchPositions()` | `fetch_positions()` |
| Get balance | N/A | `fetchBalance()` | `fetch_balance()` |
