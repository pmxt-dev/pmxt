# Feature Support & Compliance

This document details the feature support and compliance status for each exchange. PMXT enforces a strict compliance standard to ensure protocol consistency across all implementations.

## Functions Status

| Category | Function | Polymarket | Kalshi | Limitless | Notes |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Identity** | `name` | ✅ | ✅ | ✅ | |
| **Market Data** | `fetchMarkets` | ✅ | ✅ | ✅ | |
| | `searchMarkets` | ✅ | ✅ | ✅ | |
| | `getMarketsBySlug` | ✅ | ✅ | ✅ | |
| | `searchEvents` | ✅ | ✅ | ✅ | |
| **Public Data** | `fetchOHLCV` | ✅ | ✅ | ✅ | |
| | `fetchOrderBook` | ✅ | ✅ | ✅ | |
| | `fetchTrades` | ✅ | ✅ | ⚠️ | Limitless: Not Implemented (No public API) |
| **Private Data** | `fetchBalance` | ✅ | ✅ | ✅ | Verified (Real API calls, balances fetched) |
| | `fetchPositions` | ✅ | ✅ | ✅ | |
| **Trading** | `createOrder` | ✅ | ✅ | ❌ | Poly/Kalshi Verified (Funds); Limitless blocked by CLOB lib bug |
| | `cancelOrder` | ⚠️ | ⚠️ | ⚠️ | Tests exist but likely failing Auth/IDs |
| | `fetchOrder` | ⚠️ | ⚠️ | ⚠️ | Tests exist but likely failing Auth/IDs |
| | `fetchOpenOrders` | ✅ | ✅ | ✅ | Verified (Empty results pass for private data) |
| **Calculations** | `getExecutionPrice` | ✅ | ✅ | ✅ | |
| | `getExecutionPriceDetailed` | ✅ | ✅ | ✅ | |
| **Real-time** | `watchOrderBook` | ✅ | ✅ | ⚠️ | Limitless not Implemented (No websocket support) |
| | `watchTrades` | ✅ | ✅ | ⚠️ |  Limitless not Implemented (No websocket support) |

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
