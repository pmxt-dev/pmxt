# Migration Guide

## 2.18.0 — Hosted trading mode and the `pmxt_api_key` trust model

If you set `pmxt_api_key` on a `Polymarket` or `Opinion` exchange instance, trade methods now route through `trade.pmxt.dev/v0/*` and execute via PMXT's PreFundedEscrow custody.

### Trust model: `pmxt_api_key` is a service-role credential

`pmxt_api_key` is not app-scoped per-user auth. The key holder can read any user's escrow data and forward signed orders for any wallet. Writes are still gated by the user's EIP-712 signature against their own wallet — the key alone cannot move funds. Reads (`fetch_balance`, `fetch_positions`, etc.) are NOT gated by signature.

Treat `pmxt_api_key` as a backend secret: keep it on a server, never ship it to a browser bundle, never log it.

### `fetch_balance` semantic change

In venue-direct mode (`pmxt_api_key=None`), `fetch_balance()` returns the wallet's CLOB-proxy USDC balance at the venue.

In hosted mode (`pmxt_api_key=set`), `fetch_balance()` returns the wallet's USDC balance in PMXT's PreFundedEscrow contract on Polygon — the funds available for hosted trading.

Same `Balance` shape; different source. If you've been catching `fetch_balance()` calls and relying on venue-direct semantics, audit your usage.

### `Position` fields now Optional

`Position.outcome_label`, `entry_price`, `current_price`, `unrealized_pnl` are now Optional. Venue-direct mode still populates them; hosted mode surfaces `None` when the server doesn't have the data. If your code accesses these fields, handle `None`.
