# Feature Support & Compliance

This document details the feature support and compliance status for each exchange. PMXT enforces a strict compliance standard to ensure protocol consistency across all implementations.

## Functions Status

| Category | Function | Polymarket | Kalshi | Limitless | Notes |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Identity** | `name` | ✅ | ✅ | ✅ | |
| **Market Data** | `fetchMarkets` | ✅ | ✅ | ❌ | |
| | `searchMarkets` | ✅ | ✅ | ✅ | |
| | `getMarketsBySlug` | ✅ | ✅ | ✅ | |
| | `searchEvents` | ✅ | ✅ | ✅ | |
| **Public Data** | `fetchOHLCV` | ✅ | ✅ | ❌ | |
| | `fetchOrderBook` | ✅ | ✅ | ✅ | |
| | `fetchTrades` | ⚠️ | ✅ | ⚠️ | Requires API Key / Authentication to fetch public trade history |
| **Private Data** | `fetchBalance` | ❌ | ❌ | ❌ | Fails without real Auth  |
| | `fetchPositions` | ❌ | ❌ | ❌ | Fails without real Auth  |
| **Trading** | `createOrder` | ❌ | ❌ | ❌ | Fails without real Auth  |
| | `cancelOrder` | ❌ | ❌ | ❌ | Fails without real Auth  |
| | `fetchOrder` | ❌ | ❌ | ❌ | Fails without real Auth  |
| | `fetchOpenOrders` | ❌ | ❌ | ❌ | Fails without real Auth  |
| **Calculations** | `getExecutionPrice` | ✅ | ✅ | ✅ | |
| | `getExecutionPriceDetailed` | ✅ | ✅ | ✅ | |
| **Real-time** | `watchOrderBook` | ✅ | ⚠️ | ❌ | Requires Authentication / WebSocket doesn't exist |
| | `watchTrades` | ✅ | ✅ | ❌ | Limitless not supported |
| **Lifecycle** | `close` | ⚠️ | ⚠️ | ⚠️ | |

## Legend
- ✅ Compliance Verified (Strict Test Passed)
- ⚠️ No tests
- ❌ No Compliance Test

## Compliance Policy
- **Failure over Warning**: Tests must fail if no relevant data (markets, events, candles) is found. This ensures that we catch API breakages or unexpected empty responses.

## Tests with authentication
requires a dotenv in the root dir with
```
POLYMARKET_PRIVATE_KEY=0x...
# Kalshi
KALSHI_API_KEY=...
KALSHI_PRIVATE_KEY=... (RSA Private Key)
# Limitless
LIMITLESS_PRIVATE_KEY=0x...
```
