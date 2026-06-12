## [2.18.0] - 2026-06-08

### Added — Hosted trading mode

Trading methods now work in hosted mode when `pmxtApiKey` is set on `Polymarket` or `Opinion` exchanges. Orders route through `trade.pmxt.dev/v0/*` and execute via PMXT's PreFundedEscrow custody on Polygon.

- `new Polymarket({ pmxtApiKey, privateKey, walletAddress })` and `new Opinion(...)` gain `walletAddress` and `signer` constructor options
- 10 existing methods (`createOrder`, `buildOrder`, `submitOrder`, `cancelOrder`, `fetchOpenOrders`, `fetchMyTrades`, `fetchBalance`, `fetchPositions`, `fetchOrderBook`, `fetchOrder`) work in hosted mode
- New nested namespace: `client.escrow.approveTx()`, `depositTx()`, `withdrawTx()`, `withdrawals()`
- Optional peer dependency: `npm install ethers` (required when using built-in `EthersSigner` via `privateKey`)
- Per-route EIP-712 typed-data validation (schema + economic match + post-sign signer recovery + low-s canonical signature check)
- 9 new hosted exception classes extending semantically-closest legacy parents (`InsufficientEscrowBalance extends InsufficientFunds`, etc.) so `instanceof InsufficientFunds` catch sites work in both modes
- New `isHostedError(e)` helper for catching any hosted error

### Changed (additive, no breaking changes)

- `fetchBalance()` in hosted mode returns escrow USDC balance (not venue CLOB USDC). Same `Balance` shape, different source. See MIGRATION.md.
- `Position.outcomeLabel`, `entryPrice`, `currentPrice`, `unrealizedPnL` are now optional — venue-direct mode populates them; hosted mode leaves undefined when server hasn't enriched.
- POST/PUT/DELETE in hosted mode never auto-retry (idempotency: `built_order_id` and `cancel_id` are single-use server-side).

### Not supported in hosted mode

- `fetchClosedOrders` — throws `NotSupported`; use `fetchMyTrades()`
- `fetchAllOrders` — throws `NotSupported`; use `fetchOpenOrders()` + `fetchMyTrades()`
