## [2.18.0] - 2026-06-08

### Added — Hosted trading mode

Trading methods now work in hosted mode when `pmxt_api_key` is set on Polymarket or Opinion exchanges. Routes through `trade.pmxt.dev/v0/*` so orders go through PMXT's PreFundedEscrow custody.

- `pmxt.Polymarket(pmxt_api_key=..., private_key=..., wallet_address=...)` and `pmxt.Opinion(...)` gain `wallet_address` and `signer` constructor kwargs
- 10 existing methods (`create_order`, `build_order`, `submit_order`, `cancel_order`, `fetch_open_orders`, `fetch_my_trades`, `fetch_balance`, `fetch_positions`, `fetch_order_book`, `fetch_order`) work in hosted mode
- New nested namespace: `client.escrow.approve_tx()`, `deposit_tx()`, `withdraw_tx()`, `withdrawals()`
- New optional dependency group: `pip install "pmxt[hosted]"` (adds `eth-account` for the built-in `EthAccountSigner`)
- Per-route EIP-712 typed-data validation (schema + economic match + post-sign recovery + low-s canonical)
- 9 new hosted exception classes inheriting from existing PmxtError tree (`InsufficientEscrowBalance(InsufficientFunds)`, etc.) so existing catch sites work in both modes

### Changed (additive, no breaking changes)

- `fetch_balance()` in hosted mode returns escrow USDC balance (not venue CLOB USDC). Same `Balance` shape, different source. See MIGRATION.md.
- `Position.outcome_label`, `entry_price`, `current_price`, `unrealized_pnl` are now `Optional[...]` — venue-direct mode still populates them; hosted mode surfaces `None` where the server hasn't enriched.
- Network requests in hosted mode never auto-retry on POST/PUT/DELETE (idempotency: built_order_id and cancel_id are single-use).

### Not supported in hosted mode

- `fetch_closed_orders` — use `fetch_my_trades()` instead
- `fetch_all_orders` — use `fetch_open_orders()` + `fetch_my_trades()` separately
- `fetch_positions(with_mtm=True)` — raises NotImplementedError
