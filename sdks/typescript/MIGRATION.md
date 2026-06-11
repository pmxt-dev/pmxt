# Migration Guide

## 2.18.0 — Hosted trading mode and the `pmxtApiKey` trust model

If you set `pmxtApiKey` on a `Polymarket` or `Opinion` exchange instance, trade methods now route through `trade.pmxt.dev/v0/*` and execute via PMXT's PreFundedEscrow custody.

### Trust model: `pmxtApiKey` is a service-role credential

`pmxtApiKey` is not app-scoped per-user auth. The key holder can read any user's escrow data and forward signed orders for any wallet. Writes are still gated by the user's EIP-712 signature against their own wallet — the key alone cannot move funds. Reads (`fetchBalance`, `fetchPositions`, etc.) are NOT gated by signature.

Treat `pmxtApiKey` as a backend secret: keep it on a server, never ship it to a browser bundle, never log it.

### `fetchBalance` semantic change

In venue-direct mode (`pmxtApiKey` unset), `fetchBalance()` returns the wallet's CLOB-proxy USDC balance at the venue.

In hosted mode (`pmxtApiKey` set), `fetchBalance()` returns the wallet's USDC balance in PMXT's PreFundedEscrow contract on Polygon — the funds available for hosted trading.

Same `Balance` shape; different source. Audit any code that consumes `fetchBalance()` with venue-direct assumptions.

### `Position` fields now optional

`Position.outcomeLabel`, `entryPrice`, `currentPrice`, `unrealizedPnL` are now optional. Venue-direct mode still populates them; hosted mode surfaces `undefined` when the server doesn't have the data. If your code accesses these fields, handle `undefined`.
