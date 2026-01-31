# Feature Support & Compliance

This document details the feature support and compliance status for each exchange. PMXT enforces a strict compliance standard to ensure protocol consistency across all implementations.

## Functions Status

| Category | Function | Polymarket | Kalshi | Limitless |
| :--- | :--- | :---: | :---: | :---: |
| **Identity** | `name` | ✅ | ✅ | ✅ |
| **Market Data** | `fetchMarkets` | ✅ | ✅ | ❌ |
| | `searchMarkets` | ✅ | ✅ | ✅ |
| | `getMarketsBySlug` | ✅ | ✅ | ✅ |
| | `searchEvents` | ✅ | ✅ | ✅ |
| **Public Data** | `fetchOHLCV` | ✅ | ✅ | ❌ |
| | `fetchOrderBook` | ❌ | ✅ | ❌ |
| | `fetchTrades` | ⚠️* | ✅ | ⚠️* | - *Requires API Key / Authentication to fetch public trade history.
| **Private Data** | `fetchBalance` | ✅ | ✅ | ✅ |
| | `fetchPositions` | ✅ | ✅ | ✅ |
| **Trading** | `createOrder` | ✅ | ✅ | ✅ |
| | `cancelOrder` | ✅ | ✅ | ✅ |
| | `fetchOrder` | ❌* | ✅ | ❌* | - *Status casing mismatch (returns UPPERCASE)
| | `fetchOpenOrders` | ✅ | ✅ | ✅ |
| **Calculations** | `getExecutionPrice` | ✅ | ✅ | ✅ |
| | `getExecutionPriceDetailed` | ✅ | ✅ | ✅ |
| **Real-time** | `watchOrderBook` | ✅ | ⚠️* | ❌ | - *Requires Authentication / WebSocket doesn't exist
| | `watchTrades` | ✅ | ✅ | ❌ | - Limitless not supported


## Legend
- ✅ Compliance Verified (Strict Test Passed)
- ⚠️ No tests
- ❌ No Compliance Test

## Compliance Policy
- **Failure over Warning**: Tests must fail if no relevant data (markets, events, candles) is found. This ensures that we catch API breakages or unexpected empty responses.
