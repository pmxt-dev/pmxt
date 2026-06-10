# Changelog

All notable changes to this project will be documented in this file.

## [2.49.8] - 2026-06-10

Hosted trading quickstart actually works now. The SDKs' client-side economics validator was rejecting every server-built market order before signing (`economic mismatch: worst_price expected <= ... got 0.999`), because the hosted trading API deliberately pins market-order `worst_price` to the tick-grid extreme and caps the user with `max_cost_usdc` / `shares_6dec` instead ("textbook market semantics"). Verified live against `trade.pmxt.dev` with a real $5 fill end-to-end.

### Fixed

- **TS `pmxt/hosted-typed-data.ts` + Python `pmxt/_hosted_typeddata.py`**: `validateWorstPrice` / `_validate_worst_price` no longer apply the limit-order slippage bound to **market** orders. For market orders the binding user protection is `max_cost_usdc` (buys) / `shares_6dec` (sells) — both already strictly validated — so the validator now only sanity-checks that `worst_price` lies inside the open `(0, 1)` price domain. Limit orders keep the existing slippage-bound check. This unblocks `create_order` / `createOrder` market orders in hosted mode, which previously failed pre-sign, every time.
- **TS `pmxt/hosted-mappers.ts` + Python `pmxt/_hosted_mappers.py`**: `userTradeFromV0` / `user_trade_from_v0` now normalize the v0 wire `amount` (6-dec micro-shares, e.g. `58139533.0`) to decimal shares (`58.139533`), so `UserTrade.amount` means shares — consistent with `Position.size` and the rest of the SDK. The reverse mappers scale back to micros symmetrically.
- **Python `client.py`**: `create_order` docstring claimed "Not available through the hosted API" — it is; corrected to describe the hosted build → local-sign → submit flow.

### Changed

- **`docs/trading-quickstart.mdx`**: Removed the "use aggressive `slippage_pct`" workaround warning (the validator bug it papered over is fixed); market-order examples no longer pass `slippage_pct` and note that market orders are budget-capped, not price-capped. Fixed the TypeScript `createOrder` example to use `type` (the actual `CreateOrderParams` field) instead of the nonexistent `orderType`. Fixed step-6 verification snippets to use real model fields (`Position.size` / `outcome_label`, `Balance.available`) instead of nonexistent `quantity` / `notional` / `free`. Documented that hosted limit orders currently return `501`.

## [2.49.7] - 2026-06-09

API Reference sidebar reorder: `Trading` and `Orders & Positions` move from near the bottom of the tab to immediately under `Events & Markets`, so the customer's natural path is walkable top-to-bottom — discover (Events & Markets) → act (Trading) → inspect state (Orders & Positions) → niche features.

### Changed

- **`scripts/generate-mintlify-docs.js`**: The API-tab assembly now inserts both `crossExchangeGroups` and the hosted `otherExternalGroups` after `"Events & Markets"`. Because `insertGroupsAfter` pushes the existing target's neighbor down, the second insertion (`otherExternalGroups`) lands between `"Events & Markets"` and `"Cross Exchange"`, producing the order: `Overview → System → Events & Markets → Trading → Orders & Positions → Cross Exchange → Order Book & Trades → Realtime → Data Feeds → Other → Enterprise`. Idempotent — re-running the regenerator produces no diff.

## [2.49.6] - 2026-06-09

Generator-side hotfix for a regression introduced by the v2.49.5 auto-publish: the `generate:mintlify` step (`scripts/generate-mintlify-docs.js`, run by `.github/workflows/publish.yml` on every release tag) was re-injecting self-hosted Group A endpoints as a duplicate `"Trading"` group (with `"Local Only"` badges) into `docs.json`'s API Reference tab, sitting alongside the canonical hosted `"Trading"` group that this release line had just renamed and cleaned up. Result: every release pushed two same-named groups into the rendered sidebar.

### Fixed

- **`scripts/generate-mintlify-docs.js`**: Removed the hardcoded `"Trading"` and `"Orders & Positions"` entries from the `ENDPOINT_GROUPS` matcher array — the generator no longer manufactures those groups from the self-hosted `openapi.json`. Added the matching self-hosted operation ids (`createOrder`, `buildOrder`, `submitOrder`, `cancelOrder`, `editOrder`, `fetchOrder`, `fetchOpenOrders`, `fetchClosedOrders`, `fetchAllOrders`, `fetchMyTrades`, `fetchPositions`, `fetchBalance`, `fetchOrderHistory`) to the `HIDDEN_OPERATIONS` set so they don't fall through to the `"Other"` bucket either. Net effect: the next auto-publish keeps the manually-curated hosted `"Trading"` + `"Orders & Positions"` groups (rendered from `openapi-hosted-trading.json`) and never re-adds the self-hosted equivalents. Self-hosters who want the full reference still consume `openapi.json` directly or reach it via `/guides/self-hosted`.
- **`docs/docs.json`**: Removed two stale duplicate groups (`"Trading (Hosted)"`, `"Orders & Positions (Hosted)"`) that the 2.49.5 auto-publish had left behind after the rename. The generator is now idempotent — regenerating produces a stable group list.

## [2.49.5] - 2026-06-09

Sidebar cleanup: drop "(Hosted)" suffixes everywhere and hide the parallel self-hosted Group A reference. The hosted endpoints are now the only Group A surface in the sidebar; the API reference reads as "Trading → Create Order" instead of "Trading (Hosted) → Create Order (Hosted)."

### Changed

- **Sidebar group labels (`docs.json`)**: `"Trading (Hosted)"` → `"Trading"`, `"Orders & Positions (Hosted)"` → `"Orders & Positions"` inside the API Reference tab. The "(Hosted)" disambiguation made sense when a sibling self-hosted group existed in the same sidebar; with that group removed (see below), the suffix is just noise.
- **Operation summaries (`openapi-hosted-trading.json`)**: All 9 hosted op `summary` fields drop the `(Hosted)` suffix — `"Create Order (Hosted)"` → `"Create Order"`, etc. `"Cancel Order -- Build (Hosted)"` collapses to `"Cancel Order"` (the build / sign / submit two-step is already explained in the operation description; the user-facing name shouldn't telegraph internal mechanics).
- **Operation tags (`openapi-hosted-trading.json`)**: `"Trading (Hosted)"` → `"Trading"`, `"Orders & Positions (Hosted)"` → `"Orders & Positions"` on every op. Mintlify derives URL slugs from the tag, so the rendered hosted endpoint URLs go from `/api-reference/trading-hosted/create-order` to `/api-reference/trading/create-order` (and equivalent for Orders & Positions). No external links pointed at the previous slugs.

### Removed

- **`"Self-host API reference"` sidebar group (`docs.json`)**: The 11-page nested group rendering the self-hosted Group A endpoints from `openapi.json` (each operation flagged with a `"Local Only"` badge) is dropped from the Documentation tab sidebar. It duplicated the hosted endpoints' purpose for most readers and made the sidebar feel cluttered (a "Trading" group with "Local Only"–badged entries sitting alongside the prominent hosted "Trading" group on the API Reference tab). The underlying `openapi.json` file is unchanged — self-hosters who want the full reference can still consume the spec directly or reach the per-method pages via the existing `/guides/self-hosted` narrative. Net effect on the rendered sidebar: one canonical "Trading" group in the API Reference tab, no parallel "Local Only" entries elsewhere.

## [2.49.4] - 2026-06-09

Hosted-trading docs QA pass. This patch also ships the 2.49.2 doc restructure work that had accumulated dirty in the working tree but never landed (Pattern E sidebar split, custody page, prediction-markets-101 glossary, terminology cleanup, etc. — see the 2.49.2 entry below for the full list).

### Changed

- **Hosted op descriptions (`openapi-hosted-trading.json`)**: All 9 hosted Group A operations (`createOrderHosted`, `buildOrderHosted`, `submitOrderHosted`, `cancelOrderHosted`, `fetchBalanceHosted`, `fetchPositionsHosted`, `fetchOpenOrdersHosted`, `fetchMyTradesHosted`, `fetchOrderHosted`) rewritten in a user-friendly style: lead with what the customer gets, demote internals (EIP-712, build/sign/submit decomposition, custodial-flow alternatives) to a final paragraph or remove entirely. `createOrderHosted` now opens with an inline code sample showing the natural `client.fetch_markets() → client.create_order(outcome=market.yes)` chain. No more "EIP-712 typed-data payload" or "PreFundedEscrow balance" in opening sentences.
- **Non-custodial language sweep** across customer-facing concept docs: `docs/concepts/hosted-trading.mdx`, `docs/concepts/hosted-custody.mdx` (new), `docs/concepts/hosted-vs-self-hosted.mdx`, `docs/concepts/prediction-markets-101.mdx` (new), `docs/trading-quickstart.mdx`, `docs/guides/escrow-lifecycle.mdx` all reworded so the escrow story reads "USDC sits in a non-custodial `PreFundedEscrow` smart contract; PMXT cannot move funds without your EIP-712 signature" rather than "PMXT custodies USDC." `docs/security.mdx` left alone — its credential-handling discussion is intentional and scoped correctly.
- **UI-first deposit / withdraw flow on `docs/trading-quickstart.mdx` and `docs/guides/escrow-lifecycle.mdx`**: Both pages now lead the deposit and withdraw sections with a "Recommended: use the dashboard" subsection (connect wallet at [pmxt.dev/dashboard/wallet](https://pmxt.dev/dashboard/wallet) → click Deposit/Withdraw → confirm in your wallet). The previous `client.escrow.approve_tx(...)` / `deposit_tx(...)` / `withdraw_tx(...)` `<CodeGroup>` blocks are preserved verbatim but tucked inside `<Accordion title="Advanced: programmatic ...">` so they're one click away for the scripting / treasury-automation case.
- **`x-mint.content` callouts on all 9 hosted ops (`openapi-hosted-trading.json`)**: The funding-prereq `<Note>` now links directly to [pmxt.dev/dashboard/wallet](https://pmxt.dev/dashboard/wallet) for the one-time deposit (with `/guides/escrow-lifecycle` as the programmatic-flow fallback), replacing the previous link to the lifecycle guide alone. The EVM-key `<Tip>` now reads "Your USDC sits in a non-custodial `PreFundedEscrow` on Polygon — the single funding location for every hosted venue (including Opinion, which PMXT settles cross-chain for you). PMXT cannot move funds without your EIP-712 signature." Previous wording said "PMXT custodies USDC on Polygon for every hosted venue."

### Removed

- **`BuildOrderHostedRequest.outcome_id` (`openapi-hosted-trading.json`)**: Following the same logic as `market_id` (relaxed in 2.49.3), `outcome_id` is no longer documented as a request property. The schema now only documents `venue` + `venue_outcome_id` as the way to identify the target outcome. The hosted trading backend continues to accept `outcome_id` (UUID) for backward compatibility — existing callers that send it keep working — but the spec stops promising it as a supported input. Net effect: a new reader looking at the create-order page sees one clean way to identify the outcome instead of an "EITHER (a) catalog UUID OR (b) venue + venue_outcome_id" fork. Schema description tightened to a single sentence.
- **Dual-identifier framing across the hosted spec**: All "catalog UUID" / "Provide this OR" / "venue-native id from fetch_markets()" / "catalog UUID lookup required" language scrubbed from operation descriptions, schema property descriptions, and `x-codeSamples` header comments. Net `grep -E "catalog UUID|Provide this OR" docs/api-reference/openapi-hosted-trading.json` count went from 14 → 0. Response-side `outcome_id` / `market_id` on `OrderV0`, `UserTradeV0`, `PositionV0` now described as plain "Identifier of the outcome / market this row refers to" without the "catalog UUID" / "cross-venue canonical" framing — readers no longer have to learn an ID-architecture taxonomy before reading a position.

### Added

- **Per-field descriptions across every hosted-trading spec schema (`openapi-hosted-trading.json`)**: ~129 `description` strings added to bare properties across 16 schemas (`BalanceV0`, `BuildOrderHostedRequest`, `BuildOrderHostedResponse` and nested `quote` / `resolved`, `CancelBuildHostedRequest`, `CancelBuildHostedResponse`, `ErrorResponse`, `HostedErrorResponse`, `ListMeta`, `OrderV0`, `PositionV0`, `RateLimitError`, `SubmitOrderHostedRequest`, `UnifiedEvent`, `UnifiedMarket`, `UnifiedOutcome`, `UserTradeV0`). Mintlify now renders meaningful per-field doc strings instead of bare `type | null` rows. Descriptions are grounded in the trading backend's `models_v0.py` Pydantic field semantics — e.g. `fee` is now documented as a USDC dollar amount net of per-fill venue fees, `PositionV0.shares` is documented as the ERC-1155 balance held by `PreFundedEscrow` on behalf of the wallet (*not* the wallet's on-chain balance), and `PositionV0.entry_price` is documented as the v1 cost-basis approximation (`sum(buy_quote_micros) / sum(buy_shares_micros)`, ignoring sells) — with the explicit caveat that `current_price`, `current_value`, and `unrealized_pnl` are reserved and currently return `null` in this release. Verify-grep on bare properties (`jq '... .description == null ...'`) returns zero records.

### Not changed (deliberate)

- **`docs/security.mdx`**: The mode-scoped credential-handling table is intentional — its "credentials hit process memory ephemerally" claim is scoped to **self-hosted** mode and correctly distinguishes from the hosted flow (where the private key never leaves the user's machine). Left alone in the non-custodial sweep.
- **Auto-generated `docs/api-reference/openapi.json`** (self-hosted spec, regenerated by `core/scripts/generate-openapi.js`): the same description / friendly-rewrite passes were not applied because they'd be lost on the next regeneration. If self-hosted reference docs need the same polish later, the source is the `SCHEMAS` literal inside `core/scripts/generate-openapi.js`, not the rendered JSON.
- **Backend `BuildOrderV0Req` Pydantic model** (`pmxt-trading`): `outcome_id` remains an accepted field at the API layer for backward compatibility with pre-2.49.3 callers. The spec-side removal is documentation-only — no breaking change on the wire.

## [2.49.3] - 2026-06-09

Backend-deploy patch for the venue-native outcome ID acceptance feature described in 2.49.2. Includes a follow-up SDK bug fix discovered during end-to-end verification on Polygon mainnet, plus the doc and test deltas that bring this release to a confirmed working state.

### Fixed

- **SDK (`sdks/python/pmxt/client.py`, `sdks/typescript/pmxt/client.ts`)**: When the caller supplies a venue-native outcome identifier (non-UUID string returned by `client.fetch_markets()` on a venue client), `_hosted_build_order_request` / `_hostedBuildOrderBody` now correctly **suppress `market_id` from the wire body** instead of forwarding the (also venue-native) value alongside `venue` + `venue_outcome_id`. Previous behavior caused the backend to reject the request with a UUID-validation error on `market_id` (`Input should be a valid UUID, invalid length: expected length 32 for simple format, found 6`). The catalog-UUID path is unchanged — `market_id` is still forwarded when both the supplied `outcome_id` and the supplied `market_id` are UUID-shaped.

### Changed

- **Docs (`docs/trading-quickstart.mdx`)**: Step 5 collapsed to the natural single-client chain — `client.fetch_markets({"query": "trump 2028"})[0]` → `client.create_order(outcome=market.yes, side="buy", amount=1.0, denom="usdc", order_type="market", slippage_pct=99.9)`. The previous Router round-trip + `<Warning>` against `pmxt.Polymarket().fetch_markets()` results is replaced by a `<Note>` clarifying that both UUID and venue-native ID forms are accepted by the trading API. Step 7 ("Verify the fill") renumbered to Step 6.
- **Docs (`docs/concepts/catalog-uuid-vs-venue-id.mdx`)**: Rewritten (70 lines down from 91). The page no longer frames the two ID spaces as a footgun. New framing: hosted trading accepts either identifier; the catalog UUID matters specifically for cross-venue identity (matched clusters, portfolio analytics that span venues, stability across venue re-listings) and for self-hosted mode where the catalog isn't in the path. The `<Warning>` against `pmxt.Polymarket().fetch_markets()` results is removed.

### Added

- **SDK tests**: Python `tests/test_hosted_dispatch.py` and TypeScript `tests/hosted-dispatch.test.ts` gained `test_build_order_with_venue_native_id_sends_venue_pair` / `buildOrder with venue-native outcomeId sends (venue, venue_outcome_id)` cases asserting the new wire shape (`venue`, `venue_outcome_id` present; `outcome_id`, `market_id` absent). Existing test constants upgraded from `"market-uuid-1"` / `"outcome-uuid-1"` (which the new UUID detection regex would mis-classify as venue-native) to canonical 8-4-4-4-12 UUID strings so the backcompat-UUID test cases continue to assert the right behavior. Net: Python 26/26, TypeScript 18/18.

### Verified

- **End-to-end on Polygon mainnet**: Confirmed the full natural workflow `client.fetch_markets()[0]` → `client.create_order(outcome=market.yes)` → on-chain settlement → `fetch_positions` → `client.create_order(side="sell")` → on-chain settlement → position closed. Round-trip executed against PreFundedEscrow (`0x3ad326f78b1390b9a5dc5f00e7f62f8632de23e2`) on the Spain WC 2026 YES outcome: buy 1.000000 USDC → 6.25 shares (tx `0x16bcfa7e00c49325bd779b044f71a660899e9d0218b11656e2ca9646a208ba10`, block 88201299), sell 6.25 shares → 0.988781 USDC. Net round-trip −0.011 USDC (≈ 1.1%, expected CLOB spread).

### Deploy prerequisite met

- **`pmxt-trading` (`BuildOrderV0Req` accepts `(venue, venue_outcome_id)`)**: deployed in `pmxt-dev/pmxt-trading@9983e35`.

## [2.49.2] - 2026-06-09

Per-method docs follow-up to 2.49.1 paired with a terminology cleanup. Every Group A method (`createOrder`, `buildOrder`, `submitOrder`, `cancelOrder`, `fetchBalance`, `fetchPositions`, `fetchOpenOrders`, `fetchMyTrades`, `fetchOrder`, `fetchClosedOrders`, `fetchAllOrders`) now has a synchronized `Hosted (recommended)` / `Self-hosted` tab toggle on its reference page, so customers see the hosted endpoint and the v2.49 SDK constructor shape by default and can flip to the local-service variant in place. Mintlify synchronizes tab selection across pages via shared label keys, so the choice persists as the user navigates the API Reference. In parallel, per the 2026-05-27 ADR "Avoid Sidecar Terminology" in the company brain, user-facing references to the local PMXT runtime now use **"local PMXT service"** (or **"local service"** when unambiguous) across the READMEs and `concepts/hosted-vs-self-hosted.mdx`. Internal implementation identifiers and historical changelog entries from earlier releases are intentionally left as-is.

### Added

- **Docs (`docs/api-reference/`)**: 11 new shadow MDX files — one per Group A method — wrapping the existing OpenAPI auto-render in a `<Tabs>` toggle. `Hosted (recommended)` tab listed first on every page so it's the default; `Self-hosted` second. Tab labels are byte-identical across all 11 files for cross-page sync.
- **Core (`openapi-hosted.json`)**: 9 new operations documenting the `trade.pmxt.dev/v0/*` trading surface — `buildOrderHosted` (POST `/v0/trade/build-order`), `submitOrderHosted` (POST `/v0/trade/submit-order`), `createOrderHosted` (SDK-convenience POST `/v0/trade/create-order` documentation entry), `cancelOrderHosted` (POST `/v0/orders/cancel/build`), `fetchBalanceHosted` (GET `/v0/user/{address}/balances`), `fetchPositionsHosted` (GET `/v0/user/{address}/positions`), `fetchOpenOrdersHosted` (GET `/v0/orders/open`), `fetchMyTradesHosted` (GET `/v0/user/{address}/trades`), `fetchOrderHosted` (GET `/v0/orders/{order_id}`). Each carries Python + TypeScript `x-codeSamples` using the v2.49 hosted constructor (`pmxtApiKey`, `walletAddress`, `privateKey`), error responses covering 401/403/404/410/422/503, and bearer auth via the existing `bearerAuth` security scheme. Plus 10 new component schemas for the v0 request/response shapes, all referencing existing components (`Order`, `Balance`, etc.) from 2.49.1.
- **Docs (`docs.json`)**: Trading and "Orders & Positions" sidebar groups now reference the 11 shadow MDX slugs directly, so Mintlify renders the toggle pages instead of auto-generating from `openapi.json`.

### Changed

- **READMEs (`readme.md`, `sdks/python/README.md`, `sdks/typescript/README.md`)**: Every user-visible "sidecar" reference replaced with "local PMXT service" or "local service" depending on context. The Quick Start, "How it works (self-hosted)", and "Self-hosted trading (advanced)" sections now use the canonical terms.
- **Docs (`docs/concepts/hosted-vs-self-hosted.mdx`)**: "...or run a sidecar" → "...or run a local PMXT service" in the "When hosted is the right choice" list.

### Fixed

- **Core (`createOrder` / `buildOrder` code samples)**: Pre-existing JSDoc rot — the auto-generated reference pages showed `type="market"` combined with `price=0.55`, an incoherent combination since price is only meaningful for limit orders. Replaced with coherent limit-order samples across all 16 venues (32 createOrder + 32 buildOrder samples, 64 line changes total). The fix lives in `core/scripts/generate-openapi.js`'s `PARAM_OVERRIDES` map so future regeneration emits the correct shape.

### Not addressed (out of scope, flagged for follow-up)

- **`fetchClosedOrdersHosted` / `fetchAllOrdersHosted`**: no underlying hosted endpoint exists — both methods raise `NotSupported` in hosted mode (closed orders are modeled as trades; use `fetchMyTrades` for historical fills). The shadow MDX files surface this via a `<Warning>` on the Hosted tab linking to `fetchMyTrades`.
- **Escrow methods**: `client.escrow.{approve, deposit, withdraw, withdrawals}` aren't in Group A and so don't have toggle pages yet. They're hosted-only (no self-hosted variant exists), so a follow-up could add single-tab reference pages.
- **Generator capability map gap**: `buildCapabilityMap()` in `core/scripts/generate-openapi.js` only instantiates 13 of the 16 exported exchange classes, omitting `Hyperliquid`, `GeminiTitan`, and `Mock`. Re-running the generator drops their `x-codeSamples`. The merged main spec retains the missing samples from a prior generator run; the surgical fix here didn't disturb them. Worth a real fix in a follow-up.

### Not changed (deliberate)

- **Internal implementation identifiers** (`_resolve_sidecar_host`, `_kill_orphan_sidecars`, `sidecarReadRequest`, `pmxt-ensure-server`, etc.) — per the ADR's scope ("Existing internal implementation identifiers may remain unchanged unless they are user-visible in generated outputs").
- **Historical changelog entries** for 2.49.1 and earlier — they accurately describe what shipped at the time using the terms in use then.
- **Auto-generated files** (`docs/api-reference/openapi.json`, `docs/llms-full.txt`, `docs/llms.txt`) — these are emitted by the generator pipeline. The terminology fix flows through the next regeneration via the source files; not hand-editing the artifacts here.

## [2.49.1] - 2026-06-08

Positioning-shift patch on top of 2.49.0 — the hosted trading mode shipped in 2.49.0 but the docs, READMEs, and OpenAPI schemas still defaulted to the self-hosted sidecar path. This release flips the default everywhere the SDK + docs surface a customer hits: hosted PMXT is the primary experience; self-hosting becomes the advanced escape hatch. No SDK runtime behavior changes — pure documentation, schema, and copy work. Marketing-site changes ship separately in a sibling pmxt-website PR.

### Added

- **Docs**: 11 new MDX pages on the Mintlify site covering the hosted trading mode end-to-end — `trading-quickstart` (60-second walkthrough), `concepts/hosted-trading` (feature landing), `concepts/hosted-vs-self-hosted` (one-pager comparison), `concepts/catalog-uuid-vs-venue-id` (the UUID/venue-id gotcha), `guides/escrow-lifecycle` (PreFundedEscrow walkthrough), `guides/signing` (EthAccountSigner / EthersSigner + EIP-712), `guides/hosted-errors` (the 5 most-common subclasses with `try/except` cookbook), `guides/migrate-to-hosted-trading` (ported `MIGRATION.md` content with language tabs), `guides/self-hosted` (consolidated local-sidecar story), `api-reference/errors` (full `HostedTradingError` tree with dual-parent semantic-map), `api-reference/configuration` (`ExchangeOptions` + env vars + base-URL resolution).
- **Docs**: New "Hosted Trading" and "Self-host" sidebar groups in `docs.json`, plus a "Reference" group at the top of the API Reference tab. `sdk/server` moved out of the previous "SDK" group into "Self-host" (without slug rename — link-stability preserved for this release).
- **Core**: New `ExchangeOptions` component schema in `core/src/server/openapi.yaml` documenting constructor-level options (`pmxtApiKey`, `walletAddress`, `signer`, `privateKey`, `baseUrl`, etc.) — previously only `ExchangeCredentials` (per-request body credentials) existed at the schema level.
- **Core**: `BuiltOrder.expiry` field added to the OpenAPI schema (the TTL that triggers `BuiltOrderExpired` at submit time was implicit in the SDK and undocumented at the spec level).

### Changed

- **Docs**: `introduction.mdx` "It runs two ways" bullet order inverted — hosted listed first as the default, self-hosted second as the advanced path. First code block swapped from a dual-variant local/hosted snippet to a single hosted-default `pmxt.Polymarket(pmxt_api_key=...)` constructor.
- **Docs**: `authentication.mdx` venue-credentials section reframed — "Hosted writes (recommended)" subsection added on top showing the `pmxt_api_key + wallet_address + private_key` constructor with a one-line `client.escrow.deposit()` example. The raw-private-key prose was preserved but relabeled as "Self-hosted / direct venue credentials (advanced)". Status/body/meaning error table picked up a fourth "SDK exception" column cross-linking to the new `/api-reference/errors` page.
- **Docs**: `security.mdx` "Run pmxt locally" callout downgraded from `<Warning>` to `<Note>` and reworded — self-hosting is positioned as one option among several rather than the implicit "safer choice". PreFundedEscrow custody surfaced as the hosted alternative.
- **Docs**: `sdk/server.mdx` got a top `<Note>` banner clarifying that the page applies to self-hosted mode only and hosted-mode users can skip it. (File location and slug intentionally not renamed in this release to preserve external links.)
- **Docs**: `concepts/venues.mdx` gained a third table at the bottom — "Hosted-trading venues" — listing Polymarket and Opinion with custody type, cross-chain support, and minimum-order-size columns.
- **READMEs (root, Python, TypeScript)**: All three flipped to hosted-default. Subtitles, "Why pmxt?" bullets, Quick Start, and Trading sections now lead with `pmxt.Polymarket(pmxt_api_key=...)`. Per-venue raw-credentials blocks preserved verbatim but moved into "Self-hosted trading (advanced)" subsections. Root README's "No API key required" bullet (actively anti-hosted-positioning) replaced with a "Hosted API" lead bullet. Net +176 lines across the three files.

### Fixed

- **Core**: `Order` schema in `core/src/server/openapi.yaml` (and the generated `docs/api-reference/openapi.json`) now includes the nullable `txHash`, `chain`, and `blockNumber` fields the SDK has been returning in hosted mode since 2.49.0. Previous spec was silent on these and downstream codegen consumers missed them.
- **Core**: `UserTrade` schema gained the same `txHash` / `chain` / `blockNumber` nullable trio.
- **Core**: `Position` schema — `required` list trimmed from `[marketId, outcomeId, outcomeLabel, size, entryPrice, currentPrice, unrealizedPnL]` to `[marketId, outcomeId, size]`. The other four became optional in 2.49.0 when the SDK stopped fabricating mark-to-market defaults for positions without a known current price; the schema kept claiming they were required, so generated clients with strict-null checking were rejecting valid responses. New `currentValue` field added (`size * currentPrice` when available). `txHash` / `chain` / `blockNumber` enrichment added.
- **Core**: `Balance` schema gained the optional `venue` field that hosted-mode responses already carry on multi-venue queries.
- **Core**: `ErrorDetail` schema expanded from `{ message: string }` to the full envelope shipping in production responses — `code` (with a populated enum covering all `HostedTradingError` codes plus the pre-existing tree), `retryable: boolean`, optional `exchange`, optional free-form `detail` object. Downstream codegen can now branch on `code`.

### Docs

- **`docs.json`**: First-time `redirects` array added (empty for this release; reserves the structure for future slug renames).

## [2.49.0] - 2026-06-08

### Added

- **SDK (Python + TypeScript)**: Hosted trading mode now works end-to-end against `trade.pmxt.dev`. Constructing the client with a `pmxt_api_key` / `pmxtApiKey` switches every Group A public method — `create_order` / `createOrder`, `build_order` / `buildOrder`, `submit_order` / `submitOrder`, `cancel_order` / `cancelOrder`, `fetch_balance` / `fetchBalance`, `fetch_positions` / `fetchPositions`, `fetch_open_orders` / `fetchOpenOrders`, `fetch_my_trades` / `fetchMyTrades`, `fetch_order` / `fetchOrder` — to dispatch through PMXT's PreFundedEscrow custody on `trade.pmxt.dev/v0/*` instead of the local sidecar. Read methods that require a wallet raise `MissingWalletAddress` locally before any network call when neither an explicit `address` argument nor `wallet_address` on the client is set. `fetch_closed_orders` and `fetch_all_orders` raise `NotSupported` in hosted mode (settled orders are modeled as trades; callers should use `fetch_my_trades`). Both SDKs auto-wrap a raw `private_key` / `privateKey` into the venue signer (`EthAccountSigner` for Python via `eth-account`, `EthersSigner` for TypeScript via the optional `ethers >= 6` peer dep) so the user never has to construct a signer manually.
- **SDK (Python + TypeScript)**: New `Escrow` namespace on hosted-mode Polymarket clients (`client.escrow.build_approve_tx(...)`, `build_deposit_tx`, `build_withdraw_tx`, `withdrawals(...)`) for the PreFundedEscrow deposit/withdraw flow. Mirrors the `/v0/escrow/*` surface; only instantiated on hosted-trading-allowlisted venues.
- **SDK (Python + TypeScript)**: New hosted-mode error hierarchy (`HostedTradingError`, `InsufficientEscrowBalance`, `OrderSizeTooSmall`, `InvalidApiKey`, `OutcomeNotFound`, `CatalogUnavailable`, `BuiltOrderExpired`, `InvalidSignature`, `NoLiquidity`, `MissingWalletAddress`). Each hosted error keeps a semantic parent so existing catch-sites still work — e.g. `InsufficientEscrowBalance` extends `InsufficientFunds`, `OutcomeNotFound` extends `NotFoundError`, `CatalogUnavailable` extends `ExchangeNotAvailable`. Python uses true multi-inheritance; TypeScript uses a `static isHostedError = true` flag plus an `isHostedError(e)` helper to compensate for single-inheritance. The mapper (`raise_from_response` / `raiseFromResponse`) translates `trade.pmxt.dev` status codes and detail strings to the right subclass.
- **SDK (Python)**: New `tests/e2e/hosted_driver.py` — runnable live driver that proves URL routing against prod. Hits `trade.pmxt.dev/v0/*` with a deliberately-bogus key so the server returns 401, captures the URL for every public method via an `httpx`-level transport hook, and asserts each URL starts with `https://trade.pmxt.dev/v0/`. Also verifies local-only failure paths (`MissingWalletAddress`, `NotSupported`, `InvalidOrder`, `InvalidSignature`) raise before any network call.
- **SDK (TypeScript)**: New `tests/e2e/hosted-driver.ts` — equivalent live driver (tsx-runnable) covering the same routing and local-raise assertions, using `global.fetch` instrumentation.
- **SDK (Python + TypeScript)**: 87 new in-process integration tests (`test_hosted_dispatch.py` + `test_hosted_error_mapping.py` in Python, `hosted-dispatch.test.ts` + `hosted-error-mapping.test.ts` in TypeScript). These mock the lowest reasonable HTTP layer (`httpx.MockTransport` / `jest.spyOn(global, 'fetch')`), construct a hosted client, call the public method, and assert exact URL / verb / body shape / response mapping for every Group A method plus the upstream status → SDK exception mapping.
- **SDK (Python + TypeScript)**: Feed listing surface on SDK clients — callers can now enumerate available data feeds from the unified client instead of reaching into the internal feed-client submodule. (#869)

### Changed

- **SDK (Python)**: `pmxt` 2.17.1 → 2.18.0. New constructor kwargs `wallet_address: str | None` and `signer: Signer | None` on every Exchange subclass; both are pass-through to the base class. Existing non-hosted (sidecar) callers see no behavior change.
- **SDK (TypeScript)**: `pmxtjs` 2.17.1 → 2.18.0. New `walletAddress` / `signer` / `privateKey` fields on `ExchangeOptions`. `ethers >= 6.0.0 < 7.0.0` declared as an optional `peerDependency` (only required for hosted writes; hosted reads work without it).
- **SDK (Python + TypeScript)**: `Order`, `UserTrade`, `Position`, and `Balance` now carry optional `tx_hash` / `txHash`, `chain`, and `block_number` / `blockNumber` fields, populated in hosted mode after the trade settles on-chain. Non-hosted callers see `None` / `undefined` for these — unchanged behavior.
- **SDK (Python + TypeScript)**: `Position` mark-to-market fields (`outcome_label`, `entry_price`, `current_price`, `current_value`) are now all `Optional`. Hosted endpoints populate `outcome_label` and `entry_price` from operator-side cost-basis enrichment when available, but downstream consumers must handle the missing case rather than relying on fabricated defaults.
- **SDK (Python + TypeScript)**: Drift parity sweep across the two SDKs — model shapes, method signatures, capability flags, and generated outputs reconciled so the same call against the same venue returns identically-shaped objects regardless of which SDK you use. (#867)
- **SDK (Python + TypeScript)**: Missing event/order parameters propagated through both SDK models so the full set of fields the core surface produces is actually reachable on the SDK objects. (#872)
- **SDK (Python)**: Type annotations tightened across the Python SDK — narrower union types and `Optional` markers replacing implicit `Any` in several public signatures. (#868)
- **Core**: Cached exchange specs (the test fixtures used to detect upstream API drift) reconciled with current live payloads from each venue. (#866)
- **Core**: Magic chain IDs (`137`, `56`, etc.) replaced with named constants throughout the codebase. (#878)
- **Deps**: npm dependency refresh to clear outstanding security advisories. (#864)
- **Deps**: Python security dependency floors raised to clear outstanding security advisories. (#865)

### Fixed

- **SDK (Python)**: `Order` dataclass field ordering — `filled_shares: Optional[float] = None` was declared before the non-default fields `remaining: float` and `timestamp: int`, which Python 3.13 rejects with `TypeError: non-default argument 'remaining' follows default argument 'filled_shares'` on first instantiation. Moved `filled_shares` below the required fields.
- **SDK (Python)**: `_error_detail_from_success_payload` no longer treats a successful 2xx response with a list or scalar JSON payload as an error envelope. Endpoints like `/v0/user/{addr}/balances` return JSON arrays (`[{"currency": "USDC", "amount": 12.5}]`); the previous logic stringified the array and re-raised it as `HostedTradingError`, so every successful read crashed. Only 2xx Mappings with explicit `error` / `errors` / `success: false` markers now count as an error envelope.
- **SDK (Python)**: Duplicate `NotSupported` class in `_hosted_errors.py` was shadowing the canonical one in `errors.py`. Tests that did `from pmxt._hosted_errors import NotSupported` failed to catch raises from `client.py` that used `from .errors import NotSupported`, because the two classes were unrelated. `_hosted_errors.py` now re-exports the canonical `NotSupported` from `errors.py`.
- **SDK (TypeScript)**: `_hostedBuildOrderBody` was writing the user's wallet to `body["wallet_address"]`, but `trade.pmxt.dev`'s `BuildOrderV0Req` expects the field as `user_address`. Every `createOrder` / `buildOrder` via the TS SDK previously 422-ed on a "missing user_address" Pydantic validation error before reaching the chain. Python SDK was already correct.
- **SDK (TypeScript)**: Nine `HOSTED_METHOD_ROUTES.get("…")` lookups in `client.ts` used snake_case keys (`"submit_order"`, `"fetch_balance"`, etc.) against a Map whose keys are camelCase (`"submitOrder"`, `"fetchBalance"`, etc.). Every hosted call would have thrown `TypeError: Cannot read properties of undefined (reading 'method')` at runtime. `tsc` and Jest didn't catch this because the existing unit tests stub out the lookup. Fixed by switching all nine sites to the camelCase keys actually defined in the map.
- **SDK (TypeScript)**: Removed the `errors.ts → hosted-errors.ts` re-export block that created a circular import. `tsc` and `ts-jest` tolerated the cycle, but `tsx` / Node CJS crashed at module load with `ReferenceError: Cannot access 'PmxtError' before initialization` because `errors.ts`'s body re-exports from `hosted-errors.ts`, which extends `PmxtError` defined later in the same `errors.ts` body. Hosted error classes are now re-exported once from `index.ts` instead of via `errors.ts`. The public surface is unchanged for consumers importing from `pmxtjs`.
- **Server (Python sidecar)**: Bare and overly-broad `except:` handlers in the sidecar manager tightened to specific exception types, so genuine bugs surface instead of getting swallowed and reported as opaque "server failed to start" errors. Closes #813-#821. (#871)
- **Server**: WebSocket and feed-client hygiene issues surfaced rather than swallowed — disconnects, malformed frames, and feed-side errors now propagate to the caller instead of silently dropping events. (#870)
- **Core**: Exchange normalizers across all venues realigned with current live payload shapes; addresses cumulative drift that had been quietly producing inconsistent unified objects between SDKs and the server. (#873)
- **Kalshi**: Pagination capped to prevent unbounded scrolling on `fetchMarkets` / `fetchEvents`, and `status=all` is now serialized as a single value rather than the array form that some Kalshi endpoints reject. (#874)
- **Limitless**: Explicit fetch timeouts on every outbound HTTP call (and the local test server) so a slow upstream can no longer hang the entire SDK request indefinitely. (#875, #876)
- **Limitless**: Throttler now rejects new work when its queue overflows instead of growing the queue unbounded — prevents memory blow-up under burst load. (#877)
- **Myriad**: Balance precision preserved end-to-end by performing integer math in `bigint` before converting to JS number, matching the fix shipped for Limitless in 2.48.2. Raw on-chain balances above `Number.MAX_SAFE_INTEGER` (~9 × 10¹⁵) no longer lose low-order digits. (#879)
- **SuiBets**: Four review-feedback fixes in the SuiBets venue integration: restored `fetchSeries: false` capability flag in series-fetch paths, added `params.series` guard to prevent an undefined spread, removed the unused `SuiBetsApiResponse` import, and wired a new `SuiBetsOptions.walletAddress` through the TypeScript client. (#663)

### Docs

- **API reference**: Historical fetch order book usage clarified — the docs previously implied the historical depth endpoint covered current state, leading to wrong assumptions about caller-side throttling. (#837)
- **API reference**: hosted-pmxt custom endpoints (the value-add routes layered on top of the unified surface) documented in-tree so they show up in the published Mintlify docs. (#842)



### Fixed

- **Opinion**: `resolutionDate` on Opinion markets no longer collapses to `1970-01-01T00:00:00Z` when the upstream `cutoffAt` is missing or `0`. Root cause: `toMillis(0)` returned `0`, which the normalizer then wrapped in `new Date(0)` and emitted as a valid-looking past date. Categorical child markets (e.g. `2026 FIFA World Cup Winner - Spain`) are the common case — Opinion publishes `cutoffAt` only on the parent, not on each child — so every child silently inherited epoch and was filtered out by any downstream `closes_at > now()` guard. Concretely, hosted-pmxt's `fetchMarketMatches` was dropping all Opinion ↔ Polymarket pairs (407 in the catalog, 13 FIFA-specific) because the Opinion side looked already-closed.
- **Opinion**: `normalizeChildMarket` now inherits `parent.cutoffAt` via `child.cutoffAt || parent.cutoffAt`, so the fallback introduced in commit `6ac8cd1` actually fires for the `cutoffAt = 0` case (the upstream literal, not a missing field).
- **Core**: `toMillis(ts)` in `opinion/utils.ts` now returns `null` for falsy input instead of `0`, so callers can distinguish "no timestamp" from "epoch" and stop materializing bogus 1970 dates. Trade/order normalizers preserve old behavior with `?? 0`.
- **Core**: `UnifiedMarket.resolutionDate` is now `?: Date`. Not every venue publishes a resolution date on every market, and the optional type lets normalizers emit `undefined` instead of fabricating an epoch sentinel. `BaseExchange.filterByCriteria` and the Baozi normalizer handle the optional case (markets without a known resolution date pass an `active`-status filter, fail a `closed`-status filter, and sort last under `sort=newest`).

## [2.48.5] - 2026-06-02

### Fixed

- **Opinion**: `outcome.metadata` on every market returned by `fetchEvents` / `fetchMarkets` / `fetchMarket` now carries `opinionMarketId` (Opinion's source-native integer market id), mirroring the `clobTokenId` shape Polymarket already exposes. Downstream consumers (notably `pmxt-trading`'s `/trade/build-order`, which keys Opinion orders by integer marketId) can now recover the id from a unified outcome without bypassing pmxt-api. (#838)
- **Opinion**: `fetchMarkets({ marketId })` now rejects non-integer values (e.g. accidentally passing a pmxt UUID) with a `BAD_REQUEST` instead of silently returning an unrelated market. (#838)

## [2.48.4] - 2026-06-02

### Fixed

- **Python SDK**: `FeedClient` is now exported from the top-level `pmxt` package, so `from pmxt import FeedClient` (and `pmxt.FeedClient(...)`) work without reaching into the internal `pmxt.feed_client` submodule. (#835)
- **TypeScript SDK**: `FeedClient` is now exported from the top-level `pmxtjs` package alongside its related types (`Ticker`, `Tickers`, `OHLCV`, `OracleRound`, `FeedClientOptions`), and is exposed on the default `pmxt` object. Consumers can now `import { FeedClient } from 'pmxtjs'` or call `pmxt.FeedClient(...)` directly. (#835)

## [2.48.3] - 2026-06-01

### Fixed

- **SDK (TS + Python)**: `sourceMetadata` is now declared on `UnifiedMarket` and `UnifiedEvent` model classes in both SDKs (it was previously declared only on `UnifiedSeries`). Closes a schema-drift gap so the venue-specific raw metadata that core already attaches via `buildSourceMetadata` actually surfaces on the SDK objects rather than being dropped at the model boundary.
- **Core (`addBinaryOutcomes`)**: Promoting `Yes`/`No` labels to the market title now mutates the existing outcome object instead of replacing it with a spread copy. This restores reference identity between `market.yes` / `market.no` and `market.outcomes[0]` / `market.outcomes[1]` — an invariant the unified-market contract assumes. Consumers diffing by object equality no longer see split snapshots after title promotion.
- **Kalshi**: The event-title contamination heuristic now also counts sub-market ticker tails (e.g. `PSG` from `KXUCL-26-PSG`) as candidate labels. Previously, titles like `"Champions League Winner: PSG vs Arsenal"` only matched a single full label (`Arsenal`) and fell short of the `>= 2`-match threshold, so the contaminated title was kept instead of falling back to the series title. The threshold itself is unchanged.

## [2.48.2] - 2026-06-01

### Fixed

- **Limitless**: `fetchBalance` no longer loses precision when raw on-chain balances exceed `Number.MAX_SAFE_INTEGER` (≈ 9 × 10¹⁵ USDC raw units). Replaced `parseFloat(rawBalance.toString()) / Math.pow(10, decimals)` with a `scaledIntegerToNumber` helper that performs integer division/modulo in bigint before converting to a JS number. Affects `LimitlessExchange.fetchBalance` and `LimitlessClient.getBalance`. (#683)
- **Python SDK**: Server auto-start failure message now points users at the correct package (`pmxt-core`) instead of the stale `pmxtjs` (the TypeScript SDK package, which does not provide the sidecar). Added a regression test that scans `client.py` source for any future `pmxtjs` reintroduction. Also cleaned up the same stale reference in `QUICKREF.py`. (#764)
- **Python SDK**: `pmxt.SuiBets` is now exported with the matching cross-SDK casing (was `Suibets`). The fix lives in `core/scripts/generate-python-exchanges.js` via a new `className` override pattern so it survives regeneration; `pmxt.Suibets` remains as a backwards-compatible alias. (#774)

## [2.48.1] - 2026-05-30

### Fixed

- **Server**: `POST /api/<exchange>/<method>` now tolerates flat-body requests like `{"slug":"wta"}` in addition to the existing `{"args":[{"slug":"wta"}]}` envelope. Previously, flat bodies caused all filter parameters to be silently dropped (the method was invoked with no arguments). The Python and TypeScript SDKs were not affected — they always wrap params in `args` — but raw `curl` callers and documentation examples hit this. Empty bodies still behave as `args:[]`.

## [2.48.0] - 2026-05-30

### Added

- **Core**: New `UnifiedSeries` type representing recurring event groupings — the fourth tier above Event -> Market -> Outcome. Examples: Kalshi `KXATPMATCH` (every ATP match), Polymarket `wta` (every WTA match).
- **Core**: `fetchSeries(params?)` method on `BaseExchange` with vendor implementations for Kalshi (`GetSeriesList`), Polymarket and Polymarket US (Gamma `/series` + `/series/{id}`), Opinion (emulated from raw `collection` field), and Gemini-Titan (emulated from raw `series` field). Venues without a series concept return `[]` and report `has.fetchSeries: false`.
- **Core**: New `series?: string` parameter on `fetchEvents` for filtering by venue-native series id / ticker / slug. Passes through to vendor APIs where supported (Kalshi `?series_ticker=`, Polymarket Gamma `?series_id=`); venues without one return `[]` rather than silently ignore the filter.
- **Core**: `Router.fetchSeries()` and `Router.fetchEvents({series})` for cross-venue queries by normalized PMXT series id (e.g. `tennis-atp-match`, `nfl`, `crypto-btc-15m`). Backed by a curated venue-id map at `core/src/router/series-map.ts` covering tennis, American sports, soccer, esports, and crypto.
- **Core**: `ExchangeHas.fetchSeries` capability flag.

## [2.47.0] - 2026-05-30

### Added

- **Core**: Optional `sourceMetadata` field on `UnifiedEvent` and `UnifiedMarket` (`Record<string, unknown>`) — captures venue-specific raw fields that are not promoted to first-class unified columns. Populated by every exchange normalizer (Kalshi, Polymarket, Polymarket US, Limitless, Smarkets, Opinion, Myriad, Probable, Metaculus, Baozi, Gemini-Titan, Hyperliquid, SuiBets) via a shared `buildSourceMetadata` helper at `core/src/utils/metadata.ts`. Includes recurring-series identifiers where the venue exposes them (Kalshi `series_ticker`/`series_title`, Polymarket `series`/`seriesSlug` when present, Opinion `collection`, Gemini-Titan `series`).

## [2.46.14] - 2026-05-26

### Fixed

- **Docs**: Simplify the raw WebSocket Python example for `watchAllOrderBooks()` to use the hosted PMXT URL directly and drop the local relay override from that section.

## [2.46.13] - 2026-05-26

### Fixed

- **Docs**: Replace the raw WebSocket curl examples for `watchAllOrderBooks()` with a direct Python WebSocket example for non-SDK users.

## [2.46.12] - 2026-05-26

### Fixed

- **Release**: Recover npm package publishing after repeated provenance/transparency-log failures left registry versions split across `2.46.9` and `2.46.10`.

## [2.46.11] - 2026-05-26

### Fixed

- **Release**: Republish the curl WebSocket documentation patch after a transient npm provenance error interrupted the `2.46.10` npm package publish.

## [2.46.10] - 2026-05-26

### Fixed

- **Docs**: Clarify raw curl WebSocket API key usage for `watchAllOrderBooks()`, including the common mistake of placing quote characters inside the `apiKey` query parameter.

## [2.46.9] - 2026-05-26

### Fixed

- **Docs**: Make raw `watchAllOrderBooks()` WebSocket usage actionable with runnable curl examples, a raw Python WebSocket example for direct `ws://` / `wss://` connections, and clearer wire protocol guidance for non-SDK clients.

## [2.46.8] - 2026-05-26

### Fixed

- **Docs**: Use "local server" terminology consistently across the docs, including generated `llms.txt` docs and WebSocket/server management pages.

## [2.46.7] - 2026-05-26

### Fixed

- **Docs**: Add raw `curl` WebSocket examples for `watchAllOrderBooks()`, including all-venue and single-venue subscription payloads, local relay URL shape, and the curl version requirement for sending WebSocket frames from stdin.

## [2.46.6] - 2026-05-26

### Fixed

- **Docs**: Clarify `watchAllOrderBooks()` venue defaults. SDK `Router` examples now show all-venue streams, venue-client examples show single-venue defaults, and raw WebSocket examples remain explicit about omitting `args` for all venues.

## [2.46.5] - 2026-05-26

### Fixed

- **SDK streaming**: Default `watchAllOrderBooks()` / `watch_all_order_books()` to the instantiated venue for venue clients. `Kalshi`, `Polymarket`, `Limitless`, and `Opinion` now stream only their own venue unless an explicit venue list is provided, while `Router` continues to stream all venues by default.

## [2.46.4] - 2026-05-26

### Fixed

- **SDK streaming**: Queue WebSocket data events in FIFO order in both the TypeScript and Python SDKs so bursty `watchAllOrderBooks()` / `watch_all_order_books()` streams are drained event-by-event instead of overwriting intermediate updates.
- **Python SDK streaming**: Improve hosted WebSocket reliability by preferring IPv4 for `api.pmxt.dev`, retrying transient handshake failures, and clearing the connect timeout after the handshake so quiet periods do not close an otherwise healthy stream.

## [2.46.3] - 2026-05-25

### Fixed

- **Limitless**: Preserve parent event context when normalizing grouped child markets. `fetchEvents()` and `fetchMarkets({ query })` now return full grouped market titles such as `World Cup, USA vs Paraguay, Jun 13, 2026 - USA` while keeping outcome labels as `USA` / `Not USA`, improving cross-venue matching and avoiding ambiguous one-word market titles.

## [2.46.2] - 2026-05-25

### Fixed

- **CLI color UX**: Add restrained semantic colors for human-readable help, auth status, local PMXT status, and hosted/local remediation guidance while keeping `--json`, non-TTY, and `NO_COLOR` output plain.

## [2.46.1] - 2026-05-25

### Fixed

- **CLI mode selection**: Add explicit `--local` and `--hosted` flags. Commands now use hosted PMXT when an API key is configured and otherwise fall back to a local PMXT instance.
- **CLI auth guidance**: Hosted auth errors now show both paths forward: configure a PMXT API key for hosted mode, or run the command with a local PMXT instance.
- **CLI local UX**: Local mode now fails fast when `pmxt-core` is not installed and explains how to install it or switch to hosted PMXT.
- **CLI copy**: Replace production CLI wording around local server management with "local PMXT instance" language.

## [2.46.0] - 2026-05-25

### Added

- **Cross Exchange**: Add `complement` to the matched event and market cluster relation types in the core router types and TypeScript/Python SDK models, matching the hosted API's complement relation filter.

## [2.45.1] - 2026-05-25

### Fixed

- **CLI UX**: Replace the raw oclif root command dump with a curated onboarding help screen focused on exchange-first commands, auth setup, and common workflows.
- **CLI defaults**: Default standalone CLI API calls to hosted PMXT instead of localhost, keeping local runtime use explicit via `--base-url` or `pmxt server`.
- **CLI install**: Remove the runtime dependency on `pmxtjs` from `@pmxt/cli`, keeping hosted CLI installs lightweight and avoiding SDK/core dependency warnings during global install.
- **CLI auth errors**: Show actionable PMXT API key setup guidance on hosted `401`/`403` responses, including `pmxt auth login`, `PMXT_API_KEY`, and one-shot `--pmxt-api-key` usage.
- **CLI aliases**: Keep duplicate fetch/v0 aliases working through the explicit alias layer while hiding them from command help output.
- **Core packaging**: Move test/dev-only packages out of `pmxt-core` runtime dependencies so downstream installs do not pull Jest or tsx.

## [2.45.0] - 2026-05-25

### Added

- **CLI**: Introduced the standalone `@pmxt/cli` package with the `pmxt` executable. It can be installed globally with `npm install -g @pmxt/cli` or run with `npx @pmxt/cli`.
- **CLI commands**: Added command coverage for the documented PMXT API surface, including markets, events, order books, trades, balances, positions, order build/create/submit/cancel/get, router matches, data feeds, feed streaming, WebSocket watch commands, enterprise commands, and local server management.
- **CLI aliases**: Added an explicit alias layer for exchange-first UX such as `pmxt polymarket fetchMarkets --query Trump`, direct camelCase method aliases such as `pmxt fetchMarkets`, and space-separated command groups such as `pmxt order create` and `pmxt feed fetchTicker`.
- **CLI auth**: Added `pmxt auth` commands for PMXT API keys and exchange credentials. Commands support saved auth, environment variables, and one-shot flags so automation can avoid interactive prompts.
- **CLI packaging**: Added a dedicated `sdks/cli` workspace, oclif command discovery, package validation, and npm package metadata for publishing `@pmxt/cli`.

### Changed

- **TypeScript SDK**: Decoupled the command-line interface from `pmxtjs`. Installing `pmxtjs` now provides the SDK only; installing `@pmxt/cli` provides the CLI.
- **Release workflow**: Updated CI/CD versioning, dry-run publishing, npm publishing, local release scripts, and GitHub release notes to include `@pmxt/cli` alongside `pmxt-core`, `pmxtjs`, and the Python `pmxt` package.

### Fixed

- **Package metadata**: Normalized `pmxt-core` npm metadata so publish dry-runs no longer rely on npm auto-correcting repository and bin path fields.
- **Release dry run**: Updated the local version-update dry-run helper to validate CLI package versioning, `pmxtjs` dependency pinning, Python `__init__` versioning, and generated SDK version arguments.
- **CLI auth**: `pmxt auth status` now dispatches correctly while preserving the existing `pmxt auth:status` command.

## [2.44.7] - 2026-05-25

### Fixed

- **SDK streaming**: Remove TypeScript and Python REST fallbacks for `watchOrderBook`, `watchOrderBooks`, `watchTrades`, and `unwatchOrderBook`. Streaming methods now require the hosted `/ws` transport and fail fast if WebSocket transport is unavailable, preventing accidental 30s REST long-poll calls to `/api/{exchange}/watch*`.
- **Python SDK**: Add regression coverage proving streaming methods use WebSocket transport and do not invoke HTTP fallbacks.

## [2.44.6] - 2026-05-25

### Fixed

- **Kalshi**: Use enriched series titles to normalize contaminated broad-future event titles. Multi-market futures such as Champions League Winner and conference championship winner events no longer inherit current-matchup labels like `PSG vs Arsenal` or `Cleveland vs New York` as their PMXT event title, while true match events keep their matchup titles.
- **Kalshi**: Add regression coverage for contaminated futures, already-sane futures, and true matchup events.

## [2.44.5] - 2026-05-25

### Fixed

- **Mock exchange**: Respect `limit` in `fetchOrderBook()` and `fetchTrades()`, and expose the documented `fetchOrderBooks()` batch method.
- **Local sidecar**: Expose documented `/api/feeds`, `/v0/sql`, and `/ws` surfaces from `createApp()`/local servers with clearer unsupported-capability and missing-environment errors.
- **Router**: Resolve local mock market, outcome, and event IDs locally for `/api/router` match lookups instead of sending fixture IDs to the hosted catalog.

## [2.44.4] - 2026-05-24

### Fixed

- **Docs publishing**: Preserve `Cross Exchange` directly after `Events & Markets` during release-time Mintlify regeneration instead of appending hosted groups near the bottom.

## [2.44.3] - 2026-05-24

### Fixed

- **Cross Exchange docs**: Add Python, TypeScript, and curl examples for matched market and event cluster API reference pages.
- **Relation filters**: Document valid matched-cluster relation values (`identity`, `subset`, `superset`, `overlap`, `disjoint`) and expose the single-relation enum in OpenAPI.

## [2.44.2] - 2026-05-24

### Fixed

- **Docs navigation**: Move API Reference `Cross Exchange` directly after `Events & Markets` so matched-cluster endpoints sit next to catalog discovery.
- **Hosted docs sync**: Insert synced Cross Exchange hosted routes after `Events & Markets` instead of appending them near the bottom of the sidebar.

## [2.44.1] - 2026-05-24

### Fixed

- **Docs navigation**: Move hosted cross-exchange matching endpoints from the Enterprise sidebar group into the API Reference `Cross Exchange` group.
- **Hosted docs sync**: Preserve the `Cross Exchange` / `Enterprise` split when hosted endpoint metadata is synced from hosted-pmxt.

## [2.44.0] - 2026-05-24

### Added

- **Router SDKs**: Add cluster-first cross-venue matching methods to both TypeScript and Python SDKs: `fetchMatchedMarketClusters` / `fetch_matched_market_clusters` and `fetchMatchedEventClusters` / `fetch_matched_event_clusters`.
- **Matching docs**: Document the new cluster-first market and event matching workflows with query-based and anchor-object examples.

### Changed

- **Hosted docs**: Promote the cluster-first matching endpoints in the generated docs while hiding the legacy pairwise matching routes from public navigation.
- **SDK responses**: Preserve live `bestBid` / `bestAsk` fields on converted market outcomes so cluster responses include executable-price context.

## [2.43.25] - 2026-05-24

### Added

- **Polymarket**: Expose `initAuth()` / `init_auth()` in both TypeScript and Python SDKs — previously only available in core. Fixes #505.

## [2.43.24] - 2026-05-24

### Fixed

- **Build**: Revert `FetcherContext.callApi` return type from `Promise<unknown>` back to `Promise<any>` — the `unknown` change broke all 33 exchange fetchers that access `callApi` return values without type narrowing.
- **Build**: Revert `Ticker.info`, `Market.info`, `FundingRate.info` from `Record<string, unknown>` back to `any` in feeds types — broke Binance normalizer and Chainlink feed assignments.
- **Build**: Fix Chainlink feed logger calls to pass structured context object instead of bare string.
- **Build**: Revert `ERROR_CODE_MAP` constructor type from `(...args: string[])` back to `(...args: any[])` — `RateLimitExceeded` takes `(string, number?, string?)` which doesn't match `string[]`.

## [2.43.22] - 2026-05-24

### Fixed

- **Build**: Revert `FetcherContext.callApi` return type from `Promise<unknown>` back to `Promise<any>` — the `unknown` change broke all 33 exchange fetchers that access `callApi` return values without type narrowing. Internal interface, not user-facing.

## [2.43.21] - 2026-05-24

### Fixed

- **Auth guards**: Replace non-null assertions with explicit credential guards in kalshi (#217), limitless (#222), smarkets (#220), polymarket (#203, #213), and polymarket fetcher (#209). Missing credentials now throw immediately with clear error messages.
- **Unhandled async**: Add `.catch()` handlers to fire-and-forget `connect()`/`ensureConnected()` calls in Binance feed (#280, #288) and Chainlink feed (#293, #300). Add concurrency guard + `.catch()` to GoldSky subscriber poll interval (#255).
- **GoldSky type safety**: Replace 8 unsafe `any` types with typed interfaces (`GoldskyOrderFilledEvent`, `GoldskyTransfer`, `GoldskyGraphQlResponse`). Fixes #348.
- **WebSocket safety**: Catch `JSON.parse` in ws-client `onmessage` to prevent malformed frames from killing the connection (#276).
- **SDK timeouts**: Add 30s timeout to `fetchWithRetry()` (#207), 5s timeout to server-manager health checks (#210, #214), 30s timeout to feed-client fetch calls (#218). Replace 2 unsafe `any` types in feed-client (#226).
- **Type safety (core)**: Replace unsafe `any` types in errors.ts (#224), args.ts (#228), models.ts (#232), interfaces.ts (#258), feeds/types.ts (#262), error-mapper.ts + 11 exchange error subclasses (#331), kalshi/normalizer.ts (#302), router/client.ts (#254).
- **Python SDK**: Add `ExecutionPriceResult` to exports, return type annotations on `status()`/`logs()` (#180, #233). Typed `List`/`Dict` in server_manager.py and errors.py (#238, #241). Add `outcome_id`/`market_id` to `UserTrade`, make `PaginatedResult.total` optional (#169, #170, #171). Add `page`/`similarity_threshold` to `MarketFetchParams`, align `fetchOHLCV` timeframe default (#172, #177).
- **Order.status**: Normalize spelling from `'cancelled'` to `'canceled'` across core types, 10 exchange normalizers, OpenAPI specs, both SDKs, and tests (#152).
- **Mock exchange**: Replace non-null assertions with guard checks (#273).

## [2.43.20] - 2026-05-24

### Fixed

- **Kalshi**: Non-null assertion guards on WebSocket resolver maps + 30s connection timeout. Fixes #230, #231.
- **Gemini Titan**: Non-null assertion guards on resolver maps + 30s handshake timeout. Fixes #235, #236.
- **Opinion**: Non-null assertion guards on resolver maps + 30s connection timeout. Fixes #239, #249.
- **Myriad**: Non-null assertion guards on WebSocket resolver/rejecter maps. Fixes #240.
- **Polymarket**: Non-null assertion guards, bounded `pendingTrades` (1000/asset), `userCallbacks` dedup + cap (100), 30s connection timeout on both channels. Fixes #243, #245, #247, #334, #380.
- **Polymarket US**: Non-null assertion guards on WebSocket socket reference. Fixes #284.
- **Polymarket**: Guard `Map.get()` on candle buckets in normalizer. Fixes #321.
- **Limitless**: Non-null assertion guards on websocket resolvers/buffers + stale resolver cleanup on timeout + client orderClient/signer guards + normalizer param narrowing. Fixes #257, #290, #303, #372.
- **Kalshi/Limitless/GoldSky**: Remove unsafe `as` casts on nullable fields — use type predicates, null guards, optional chaining. Fixes #336.
- **TypeScript SDK**: Non-null guards on `ws-client.ts` send + 30s fetch timeout on router `compareMarketPrices`. Fixes #223, #281.
- **Chainlink/Binance feeds**: Add 30s connection timeout to WebSocket `establishConnection()`. Fixes #252, #253.
- **Server**: Replace console calls with structured logger in `server/index.ts`. Fixes #306, #308, #310, #311, #312.
- **TypeScript SDK**: Replace `console.warn` with structured logger in SDK router. Fixes #396.
- **Utils**: Non-null guards on `market-utils.ts` + max queue depth (1000) on throttler + watcher resolver safety. Fixes #269, #296, #329.

### Performance

- **Kalshi**: Replace O(n²) `concat()` with `push()` in fetcher pagination (3 loops, MAX_PAGES=1000). Fixes #343.
- **Opinion**: Replace O(n²) spread with `push()` in fetcher pagination (MAX_PAGES=500). Fixes #347.
- **Smarkets**: Replace O(n²) spread with `push()` in fetcher pagination + map building (MAX_PAGES=100). Fixes #355.

## [2.43.19] - 2026-05-24

### Fixed

- **Myriad**: Read `eventId` instead of deprecated `questionId` in normalizer and utils. Fixes #556.

## [2.43.18] - 2026-05-24

### Fixed

- **Python SDK**: Python 3.8-compatible annotations in `errors.py` (`from __future__ import annotations`). Fixes #561.
- **Python SDK**: Replace bare `list[T]` with `List[T]` in `models.py` for Python 3.8 compat. Fixes #562.
- **Python SDK**: Add missing exports (`MarketFilterCriteria`, `EventFilterCriteria`, `SortOption`, `OrderSide`, etc.) to `__init__.py` and `__all__`. Add return type annotations to `stop_server()`/`restart_server()`. Fixes #565, #471.
- **Python SDK**: Remove dangerous defaults (`side="buy"`, `amount=0`) from `create_order`/`build_order` — now required keyword-only params. Fixes #466.
- **Python SDK**: Rename `type` parameter to `order_type` to avoid shadowing Python built-in. Add `_convert_params_to_camel()` for `MarketFetchParams`/`EventFetchParams`. Rename `OrderBook.dt` to `datetime`. Add concrete return types to 9 router proxy methods. Fixes #563, #449, #452, #456, #496.
- **Python SDK**: Add `SubscriptionOption` type, typed `BuiltOrder.params`/`BuiltOrder.tx`, `MatchResult`/`EventMatchResult` inheritance from unified types. Fixes #467, #500, #501, #497, #498.
- **Server**: Validate query params in `feed-routes.ts` with runtime `typeof` checks instead of unsafe `as string` casts. Fixes #558.
- **Server**: Validate `parsed.method` in WebSocket handler before use. Fixes #559.
- **Limitless**: Replace 9 non-null assertions on optional interface methods with guard-and-throw checks. Fixes #560.
- **Hyperliquid**: Correct `allMids` lookup key — use `@{outcomeId}` instead of `#{encoding}`, fixing prices hardcoded to 0.5. Fixes #441.
- **Hyperliquid**: Add `quoteToken` to `HyperliquidRawOutcome` interface. Fixes #555.
- **Hyperliquid**: Add `builderFee` to `HyperliquidRawFill`, `users` to `HyperliquidRawTrade`, make `origSz` optional. Fixes #547, #546, #520.
- **Kalshi**: Read `liquidity_dollars` instead of deprecated `liquidity` field. Fixes #554.
- **Kalshi**: Remove deprecated `mututals_description` from event normalizer. Fixes #443.
- **Kalshi**: Handle missing `image_url` in event normalizer. Fixes #442.
- **Kalshi**: Sync spec — add `ts_ms` to Order, remove `client_order_id` from Fill, add `balance_dollars` to GetBalance, add `subaccount` query param. Fixes #542, #517, #522, #433.
- **Polymarket**: Use camelCase `endDateIso` instead of snake_case `end_date_iso` in normalizer. Fixes #557.
- **Polymarket US**: Map `cashValue` to `unrealizedPnL` and `currentPrice` instead of hardcoding 0. Fixes #533.
- **Gemini Titan**: Use dedicated `volume24h` field instead of `volume` for 24h volume. Fixes #444.
- **Gemini Titan**: Type `GeminiRawEvent.series` as `Record<string, any> | null` to match live API. Fixes #439.
- **Metaculus**: Handle 403 `api_forecasting_not_enabled` error. Fixes #515.
- **Baozi**: Correct category field mapping — was returning tier instead of topic category. Fixes #540.
- **Opinion**: Update base URL from `openapi.opinion.trade` to `proxy.opinion.trade:8443`. Fixes #516.
- **Smarkets**: Sync spec — add CFTC jurisdiction, `cftc` object, `original_price`, `original_bets`, relax fullcover required fields. Fixes #543, #544, #545, #527, #528.
- **GoldSky**: Add 30s timeout to subscriber fetch. Fixes #512.
- **Probable**: Clean up `orderBookResolvers` after resolution to prevent memory leak. Fixes #550.
- **TypeScript SDK**: Add `question` getter, `bestBid`/`bestAsk` on `MarketOutcome`, type `fetchMarketsPaginated` params, sync `getExecutionPrice` to match core. Fixes #453, #454, #462, #470, #502, #503.

### Changed

- **Router**: `compareMarketPrices`, `fetchRelatedMarkets`, and `fetchHedges` now accept optional `params`. Fixes #448.

### Performance

- **Metaculus**: Replace O(n²) `array.concat()` with `push()` in `fetchMarkets` and `fetchEvents` pagination. Fixes #551, #552.

### Infrastructure

- **RPC endpoints**: Add `LIMITLESS_RPC_URL` and `OPINION_RPC_URL` env var fallbacks for hardcoded blockchain RPC URLs. Fixes #507.
- **Service URLs**: Add `PMXT_API_URL`, `POLYMARKET_GOLDSKY_URL`, `OPINION_API_URL`, `OPINION_WS_URL` env var fallbacks. Fixes #508.

## [2.43.17] - 2026-05-24

### Added

- **Kalshi**: Added cursor-aware event page fetching for bounded catalog ingestion. `fetchEventsPage()` returns a normalized event batch plus the next Kalshi cursor, and the underlying fetcher caps each upstream page to the remaining requested rows.

## [2.43.16] - 2026-05-24

### Fixed

- **Baozi**: Initialize order book resolver queues to eliminate unsafe non-null assertion on `Map.get()` in WebSocket handler. Fixes #261.
- **Probable**: Initialize order book resolver queues to eliminate unsafe non-null assertion on `Map.get()` in WebSocket handler. Fixes #264.
- **Python SDK**: Export `FirehoseEvent` and `SubscribedAddressSnapshot` from package entry point and `__all__`. Fixes #461.
- **Python SDK**: Generate correct class names for underscore-delimited exchanges (`Polymarket_us` -> `PolymarketUS`), with legacy alias preserved for backward compatibility.
- **SDK generators**: Preserve hand-written `fetchOrderBook` return type (`OrderBook | OrderBook[]`) and positional argument handling during client regeneration.

### Added

- Regression tests for Baozi and Probable WebSocket resolver queue initialization.
- Python public export list regression test.

## [2.43.15] - 2026-05-24

### Fixed

- **Kalshi**: Market normalization now preserves the venue's market-level title instead of replacing it with the parent event title. Kalshi market slugs now use the market ticker, and raw market status is carried through to the unified market.

## [2.43.14] - 2026-05-24

### Fixed

- **Docs**: Updated the `fetchOrderBook` API reference examples to show the recommended historical order book flow: fetch a market by slug, pass `market_id` / `marketId`, and select the side with `params.outcome: "yes"` or `"no"`.

## [2.43.13] - 2026-05-24

### Fixed

- **fetchOrderBook**: `params.outcome` now accepts `"yes"`/`"no"` outcome aliases when the first argument is a market ID. The alias is resolved to the venue's actual outcome token ID before fetching live or historical order books, while raw outcome token IDs continue to work unchanged.

## [2.43.12] - 2026-05-23

### Fixed

- **fetchTrades**: Polymarket fetcher now forwards the `limit` parameter to the CLOB API. Previously, `limit` was silently ignored and Polymarket's API defaulted to 100 results per request — making it impossible to fetch more than 100 trades in a single call.
- **fetchTrades**: Removed hardcoded `limit: 100` defaults from Kalshi, Myriad, and Smarkets fetchers. When no limit is specified, the upstream API's own default is used instead of our arbitrary cap.
- **fetchTrades**: Smarkets fetcher now respects the user-provided `limit` parameter instead of ignoring it entirely.
- **fetchTrades**: Added `MAX_TRADES_LIMIT = 1000` validation across all venues (Polymarket, Kalshi, Smarkets, Myriad, Probable). Passing `limit > 1000` now throws a `ValidationError` instead of silently returning fewer results.

## [2.43.11] - 2026-05-23

### Fixed

- **Cleanup**: Removed `testDummyMethod` stubs from `BaseExchange.ts`, TypeScript SDK client, and Python SDK client. Regenerated OpenAPI spec and method-verbs.

## [2.43.10] - 2026-05-23

### Fixed

- **Logging**: Replaced all remaining raw `console.log/warn/error` calls in production code with the structured `logger` from `core/src/utils/logger.ts`. 17 files, 50 replacements across kalshi, opinion, limitless, polymarket, baozi, probable, smarkets, myriad, metaculus, server/ws-handler, and subscriber/goldsky. Controlled by `PMXT_LOG_LEVEL` env var.

## [2.43.9] - 2026-05-23

### Fixed

- **Docs**: `fetchOrderBook` API reference examples now show `side="yes"` instead of `side="buy"`. The OpenAPI example generator checked parameter names before schema enums, so the `side` fallback (`"buy"`) shadowed the actual enum (`['yes', 'no']`).

## [2.43.8] - 2026-05-23

### Fixed

- **Build**: Commit missing `core/src/utils/logger.ts` and related file changes that were breaking CI.

## [2.43.7] - 2026-05-23

### Added

- **Docs**: `fetch-order-book.mdx` with Python, JavaScript, and curl examples for live, historical snapshot, and historical range queries. Uses the 2028 Presidential Election market.

## [2.43.6] - 2026-05-23

### Improved

- **Docs**: `fetchOrderBook` description now includes a 2028 Presidential Election example, explains historical query modes, and documents default/max limits (100/1000) for range queries.

## [2.43.5] - 2026-05-22

### Fixed

- **Python SDK**: `fetch_order_book` now works — fixed `_compat_kwargs` typo, added `None` placeholder for params positioning, and array response handling for range queries.
- **Python SDK**: Added `dt` field to `OrderBook` model (maps to `datetime` in API response).

## [2.43.4] - 2026-05-22

### Fixed

- **Docs**: Add `FetchOrderBookParams` to `GENERATED_SCHEMA_ORDER` so the AST parser builds the schema from the interface. `TYPE_REF_MAP` alone was not enough — the generator also needs the schema order entry to enumerate properties as query params.

## [2.43.3] - 2026-05-22

### Fixed

- **Docs**: Register `FetchOrderBookParams` in `TYPE_REF_MAP` so the OpenAPI generator emits `side`, `since`, `until` as query parameters on the fetchOrderBook endpoint.

## [2.43.2] - 2026-05-22

### Fixed

- **Docs**: `fetchOrderBook` params (`side`, `since`, `until`) now appear in auto-generated API docs. Replaced `Record<string, any>` with typed `FetchOrderBookParams` interface so the OpenAPI generator can enumerate the properties.

## [2.43.1] - 2026-05-22

### Fixed

- **SDK**: `fetchOrderBook` now correctly inserts a `null` placeholder for `limit` when only `params` is provided, ensuring `params` lands at `args[2]` for the hosted API.
- **SDK**: `fetchOrderBook` now handles array responses from range queries (`since` + `until`) instead of treating them as a single `OrderBook`.

## [2.43.0] - 2026-05-22

### Added

- **fetchOrderBook**: Historical order book support via `params.since` and `params.until`. CCXT-compatible signature `(outcomeId, limit?, params?)` across all exchanges and SDK.
  - `{ since }` — single L2 snapshot at or before the given timestamp (hosted API only, backed by ClickHouse archive).
  - `{ since, until }` — array of fully reconstructed L2 books from tick-level deltas. Default 100 snapshots, max 1000.
  - Full reconstruction for all 4 archived venues: Polymarket (absolute deltas), Kalshi (additive deltas), Limitless, Opinion.
- **OrderBook.datetime**: ISO 8601 datetime field on the `OrderBook` type (CCXT-compatible).

### Changed

- **fetchOrderBook** signature widened from `(outcomeId, side?)` to `(outcomeId, limit?, params?)`. Backwards compatible — `side` moved to `params.side`. All 14 exchange implementations, Router, and SDK updated.
- SDK `fetchOrderBook` return type widened to `OrderBook | OrderBook[]` (array when `since` + `until` are both provided).

## [2.42.7] - 2026-05-22

### Fixed

- **Publish**: Re-release of v2.42.6 (failed due to expired npm token; provenance record burned in Sigstore).

## [2.42.6] - 2026-05-22

### Fixed

- **Polymarket**: Pagination now uses PAGE_SIZE 100 (Gamma silently clamps responses to 100 items; the old 500 value stopped pagination after one request).
- **Polymarket**: Null-safe parsing for `outcomePrices`, `outcomeLabels`, and `clobTokenIds` — resolved markets return `"null"` (string) which `JSON.parse` turns into JS `null`, bypassing the `|| []` fallback.
- **Polymarket**: Cap pagination offsets at 10,000 (Gamma's server-enforced maximum).

## [2.42.5] - 2026-05-20

### Added

- **Docs**: Added `watchTicker` WebSocket endpoint to Data Feeds documentation with subscribe/unsubscribe protocol and SDK code samples.

## [2.42.4] - 2026-05-20

### Fixed

- **Docs**: Moved Data Feeds group to the bottom of the API Reference sidebar. Prediction market endpoints come first.

## [2.42.3] - 2026-05-20

### Added

- **Docs**: Data feed endpoints (Binance + Chainlink) now auto-generated in OpenAPI spec and Mintlify docs. 9 new endpoints under `/api/feeds/{feed}/`, FeedTicker/FeedMarket/FeedOracleRound schemas, SDK code samples for Python and TypeScript FeedClient, and a "Data Feeds" sidebar group.

## [2.42.2] - 2026-05-19

### Fixed

- **Build**: Fixed `FeedClient` constructor to use `resolvePmxtBaseUrl` object signature (TS SDK build failure).

## [2.42.1] - 2026-05-19

### Fixed

- **Build**: Resolved TypeScript compilation errors — renamed conflicting `OrderBook`/`Market` re-exports from feeds module to `FeedOrderBook`/`FeedMarket`, and fixed `req.params.feed` type assertion in feed routes.

## [2.42.0] - 2026-05-19

### Added

- **Data Feeds module** (`core/src/feeds/`): auxiliary price/oracle data alongside prediction markets. CCXT-compatible unified API — same method names, same types (`Ticker`, `OHLCV`, `OrderBook`, `Market`), same return shapes.
- **BinanceFeed**: real-time spot trade tickers via obdata WebSocket relay. Supports `fetchTicker`, `fetchTickers`, `watchTicker`, `loadMarkets`. Symbols: BTC/USDT, ETH/USDT, SOL/USDT, XRP/USDT.
- **ChainlinkFeed**: on-chain oracle prices via pmxt-ohlc REST + WebSocket. Supports `fetchTicker`, `fetchTickers`, `watchTicker`, `loadMarkets`, plus pmxt-specific `fetchOracleRound`, `fetchOracleHistory`, `fetchHistoricalPrices`. Feeds: ETH/USD, BTC/USD, XRP/USD, SOL/USD on Polygon.
- **Server routes** (`/api/feeds/:feed/:method`): REST endpoints for all feed methods, mounted alongside existing exchange routes.
- **SDK (TypeScript)**: `FeedClient` class (`pmxt/feed-client.ts`) with `loadMarkets`, `fetchTicker`, `fetchTickers`, `fetchOHLCV`, `fetchOracleRound`, `fetchOracleHistory`.
- **SDK (Python)**: `FeedClient` class (`pmxt/feed_client.py`) with `load_markets`, `fetch_ticker`, `fetch_tickers`, `fetch_ohlcv`, `fetch_oracle_round`, `fetch_oracle_history`.
- **WebSocket streaming**: `watchTicker` for Binance feeds via hosted-pmxt's WS server.

## [2.41.7] - 2026-05-17

### Fixed

- **Docs**: Updated supported venues list on all WebSocket pages (`watchOrderBook`, `watchOrderBooks`, `watchAllOrderBooks`, `watchTrades`). Now correctly lists `polymarket`, `kalshi`, `limitless`, `opinion`.

## [2.41.6] - 2026-05-16

### Fixed

- **Docs**: Fixed `IndexError` / `TypeError` in WebSocket code examples (`watchOrderBook`, `watchAllOrderBooks`) when orderbook has no bids or asks. All examples now guard against empty orderbooks.

## [2.41.5] - 2026-05-16

### Fixed

- **Docs**: WebSocket pages (Realtime group) no longer disappear from the docs sidebar after CI regeneration. `generate-mintlify-docs.js` now auto-discovers `watch-*.mdx` and `websocket.mdx` pages on disk instead of relying on the OpenAPI spec (which correctly excludes WebSocket methods).
- **Docs**: Removed `testDummyMethod` from the public API docs sidebar.

## [2.41.4] - 2026-05-15

### Fixed

- **Polymarket**: Replaced `@nevuamarkets/poly-websockets` with native WebSocket implementation for `watchTrades` and `watchOrderBook`. The third-party package was silently dropping `last_trade_price` events. Native WebSocket connects directly to `wss://ws-subscriptions-clob.polymarket.com/ws/market` and receives all event types reliably.
- **Polymarket**: `watchTrades` now buffers trades between calls instead of silently discarding them when no promise is waiting. Fixes timeout errors on active markets.
- **Kalshi**: `watchTrades` WebSocket handler updated from API v1 field names (`yes_price`, `count`) to v2 (`yes_price_dollars`, `count_fp`). Fixes silent data corruption where prices and amounts returned as 0.

### Documentation

- Watch methods (`watchOrderBook`, `watchOrderBooks`, `watchAllOrderBooks`, `watchTrades`) moved from OpenAPI spec to dedicated MDX pages with proper WebSocket documentation, per-method parameter tables, response schemas, and SDK code examples.

## [2.41.3] - 2026-05-15

### Fixed

- **Polymarket: market orders now use FOK** instead of fake GTC limit orders with fallback prices. `createOrder({ type: 'market' })` now calls the CLOB's native `createMarketOrder()` and posts with `FOK` (fill-or-kill), matching how all other exchanges handle market orders.
- **Polymarket: fill amounts no longer divided by 1e6**. The CLOB response's `makingAmount`/`takingAmount` are already human-readable values, not raw 6-decimal units. Dividing by 1e6 was turning 12-share fills into 0.000012 dust. This was the root cause of all dust fills on Polymarket.

### Added

- **SDK (TypeScript + Python): non-custodial SOR trading**. `createOrder()` on the SOR exchange now does build/sign/submit internally. The SDK calls `buildOrder` (SOR plans fills), signs locally with the user's private key, then calls `submitOrder` (SOR records fills). No signer webhook needed. Private key never leaves the SDK.

## [2.41.2] - 2026-05-15

### Fixed

- **Docs**: Watch methods are now documented as WebSocket endpoints on a dedicated page, not as misleading HTTP POST endpoints. Removed watch methods from the OpenAPI spec entirely — they belong to the WebSocket protocol, not REST.

## [2.41.1] - 2026-05-15

### Added

- **Docs**: Watch methods (`watchOrderBook`, `watchOrderBooks`, `watchAllOrderBooks`, `watchTrades`, `watchAddress`) now show WebSocket transport documentation with `ws://` / `wss://` URLs, subscribe/unsubscribe protocol, and JSON message examples. Auto-generated by the OpenAPI generator.
- **SDK (TypeScript + Python)**: `watchAllOrderBooks()` / `watch_all_order_books()` — renamed from `firehose()`. Streams all orderbook updates across venues with optional venue filter. `firehose()` kept as deprecated alias.

### Fixed

- **Docs**: Watch methods previously showed as HTTP POST endpoints (`curl --request POST`). Now correctly documented as WebSocket endpoints with connection URLs for both local sidecar and hosted API.

## [2.41.0] - 2026-05-13

### Added

- **SDK (TypeScript + Python)**: Real-time WebSocket streaming via the hosted PMXT API. When `pmxtApiKey` is set, `watchOrderBook()` and `watchOrderBooks()` connect to `wss://api.pmxt.dev/ws` instead of the local sidecar — no venue credentials needed.
- **SDK (TypeScript + Python)**: `firehose()` method streams all orderbook updates across all venues (Polymarket, Limitless, Opinion) through a single connection. Optional venue filter: `firehose(["polymarket"])`.
- **SDK (TypeScript + Python)**: `FirehoseEvent` type with `source`, `symbol`, and `orderbook` fields.

### Fixed

- **SDK (TypeScript)**: Silent WebSocket failures when sidecar is unavailable now fall back to HTTP correctly.
- **SDK (Python)**: `IndexError` in `ws_client.subscribe()` when called with empty args (affected `firehose()` with no venue filter).
- **SDK (Python)**: Silent failures in WS client error handling.
- **Router**: Throw on unexpected `browseMarketMatches` response type instead of returning silently.
- **Core**: Distinguish error types in lock file, port manager, and method verbs loading.
- **Baozi**: Reject pending resolvers on WebSocket parse errors instead of leaving them hanging.
- **Polymarket**: Propagate pagination errors and restore `clobTokenIds` warnings.
- **Core**: Replace stale `qoery-com` GitHub org references with `pmxt-dev`.

### Documentation

- Expanded `.env.example` with all exchange credentials.
- Added version requirements, contributor quickstart, and ESM caveat.
- Added PR process, fixed deprecated `stop_server`, documented server port.
- Fixed stale SDK guides, added regeneration step, corrected prerequisites.

## [2.40.6] - 2026-05-12

### Fixed

- **Polymarket**: Error messages for signature type mismatches now suggest specific alternatives to try (`deposit_wallet`, `gnosis_safe`, `polyproxy`) instead of generic "pass signatureType" guidance.
- **Polymarket**: Setup docs now list all four signature types with era labels and a troubleshooting hint when balance shows $0.

## [2.40.5] - 2026-05-09

### Fixed

- **Myriad**: `fetchOrderBook` for synthetic "Not X" outcomes in multi-outcome AMM markets was returning the price of `outcomes[0]` (the first outcome in the raw API response) instead of the correct NO-side price. For example, "Not Bellingham" in the Ballon d'Or market returned Mbappé's price (11.47c) instead of the correct complement (98.97c), causing pair costs to display as 11.77c instead of ~100c.
- **Myriad**: `normalizeOrderBook` now sums all other outcomes' prices from the AMM pool state when the outcomeId is negative (synthetic NO), producing the correct NO-side price.
- **Myriad**: `fetchOrderBook` now uses the real CLOB orderbook endpoint (`GET /markets/:id/orderbook`) for orderbook-model markets. Returns full bid/ask depth with multiple price levels instead of a single emulated level. Falls back to AMM spot price emulation for markets where the endpoint is unavailable.

## [2.40.4] - 2026-05-09

### Fixed

- **Limitless**: `createOrder` now extracts actual fill data from `makerMatches[].matchedSize` instead of echoing back requested amounts. Reports real post-fee filled shares and `feeRateBps`.
- **Polymarket**: `createOrder` now uses `takingAmount`/`makingAmount` from the CLOB `OrderResponse` instead of echoing back requested amounts. Correctly reports filled shares for immediately matched orders.
- **Order type**: Added optional `filledShares` and `feeRateBps` fields to the `Order` interface for venues that report post-fee fill data.

## [2.40.3] - 2026-05-09

### Fixed

- **Myriad**: `fetchRawEvents` was using the `/questions` endpoint which only returned BNB-chain candle markets. Switched to `/markets` endpoint which returns all active markets across all networks (Abstract, Linea, BNB).
- **Myriad**: Multi-outcome markets (e.g. "Who will win Premier League?" with 6 outcomes) are now expanded into per-outcome binary markets (e.g. "Who will win Premier League? - Arsenal" Yes/No). This matches Polymarket's structure and enables cross-venue identity matching.
- **Myriad**: Map `status` field in `normalizeMarket()` — Myriad API returns `state: 'open'|'closed'|'resolved'` but it was never mapped to the unified `status` field, causing all Myriad markets to be stored with `NULL` status. Uses the existing `mapMarketState()` helper.

## [2.40.1] - 2026-05-08

### Fixed

- **Limitless**: Map `status` field in `mapMarketToUnified()` — Limitless API returns `status: 'FUNDED'` and `expired: boolean` but these were never mapped to the unified `status` field, causing all Limitless markets to be stored with `NULL` status and excluded from cross-venue identity matching in the SOR.

## [2.40.0] - 2026-05-08

### Added

- **Gemini Titan** exchange integration (`gemini-titan`)
  - REST: fetchMarkets, fetchEvents, fetchOrderBook, createOrder, cancelOrder, fetchOpenOrders, fetchClosedOrders, fetchAllOrders, fetchPositions
  - WebSocket: watchOrderBook (L2 depth20), watchTrades
  - HMAC-SHA384 auth with monotonic nonce
  - Independent CFTC-regulated DCM -- not a Kalshi/Polymarket wrapper
  - Supports sports, politics, crypto, commodities, weather markets
  - Sandbox environment support
  - No OHLCV, trade history (REST), fills, or balance endpoints (Gemini does not expose these)
  - REST order book is top-of-book only; full depth via WebSocket

## [2.39.2] - 2026-05-08

### Test suite rewrite and silent failure elimination

Complete rewrite of the test suite and elimination of all bare catch blocks across the codebase.

#### Test suite (rewrite from scratch)

Deleted ~170 test files (17,200 lines) that were vacuously passing, silently skipping, or testing nothing. Replaced with 637 tests across 10 files that run in ~5 seconds:

- **Pipeline contract test** — starts a real Express server with MockExchange, verifies every field on UnifiedMarket/UnifiedEvent/MarketOutcome survives the full path from exchange through server serialization to SDK converter.
- **Schema drift test** — parses types.ts, TS SDK models, and Python SDK models via regex; fails with the exact field name if any SDK diverges from the source of truth.
- **Normalizer fixture tests** — frozen realistic API response fixtures for all 11 exchanges (Polymarket, Kalshi, Limitless, Smarkets, Myriad, Probable, Opinion, Polymarket US, Hyperliquid, Baozi, Metaculus). Tests that every normalizer produces correct UnifiedMarket fields from venue-specific raw data.
- **Order lifecycle tests** — balance math, immediate/resting fills, partial fills, cancellation, position tracking, weighted average entry price, reset, determinism, insufficient balance.
- **Error propagation tests** — unknown exchange/method, health check, GET/POST routing, write-method-via-GET rejection.
- **GET/POST parity tests** — verifies GET and POST requests to the same endpoint return identical results.
- **Python SDK converter tests** — every converter function, every field on every model, distinct sentinel values to catch field transpositions.
- **Python SDK integration tests** — starts real Node sidecar, makes HTTP calls through Python, asserts responses are properly typed dataclass instances with all fields.

#### MockExchange

Added `MockExchange` — a fully offline, deterministic exchange for testing and development. Seeded PRNG produces identical data across runs. Supports fetchMarkets, fetchEvents, fetchOrderBook, fetchOHLCV, fetchTrades, fetchBalance, createOrder, cancelOrder, fetchPositions, and full order lifecycle with resting limit mode. Registered in the exchange factory as `"mock"`.

#### Silent failure elimination (20 bare catches fixed)

Every bare `catch {}` and `.catch(() => null)` in the codebase has been replaced with either error propagation or explicit logging:

- **Router**: `fetchOrderBook` throws on total failure instead of returning phantom empty orderbook; `fetchArbitrageBulk` only catches 404/501 (rethrows all other errors); missing arbitrage price fields throw instead of defaulting to 0; `fetchMarketsImpl`/`fetchEventsImpl` validate array responses.
- **Myriad WebSocket**: polling errors logged with outcomeId; after 5 consecutive failures, rejects pending promises instead of hanging forever.
- **Baozi**: market account fetch failure re-throws instead of returning wrong prices; malformed on-chain accounts logged with pubkey and skip count.
- **Probable**: balance RPC failure re-throws; locked balance failure re-throws; missing marketId throws instead of returning empty array.
- **Polymarket**: signature discovery failure logged (default preserved for network resilience); on-chain balance failure logged.
- **Polymarket US**: unknown order intent throws instead of defaulting to `'buy'`.
- **Smarkets**: volume batch failure logged with batch IDs.
- **Kalshi**: series tag failure logged with ticker.
- **Metaculus**: slug-to-event only catches 404; rethrows all other errors.
- **Limitless**: missing marketId throws instead of returning empty.
- **WebSocket handler**: stream errors send error frame to client before cleanup; exchange close failures logged.

#### Python SDK fix

Added missing `event_id` field to Python `UnifiedMarket` dataclass — was silently dropped by `_auto_convert` for every market response.

### Migration

No breaking API changes. Error behavior is stricter: methods that previously returned empty/default data on failure now throw or log warnings. If your code was relying on silent empty responses from failed fetches, you may need to add error handling.

## [2.39.1] - 2026-05-08

### Feat: Polymarket authenticated user channel WebSocket

- Added `watchUserFills(conditionIds, callback)` to `PolymarketWebSocket`
  for real-time fill and order event notifications via Polymarket's native
  authenticated user channel (`wss://ws-subscriptions-clob.polymarket.com/ws/user`).

- Supports two event types:
  - **Trade events**: fired when orders fill (status: MATCHED → CONFIRMED/FAILED)
  - **Order events**: fired on placement, partial fill (UPDATE), cancellation

- Requires `userChannelCreds` (apiKey, secret, passphrase) in
  `PolymarketWebSocketConfig`. These are the same L2 API credentials
  derived by `PolymarketAuth`.

- Auto-reconnects on disconnect (5s delay), pings every 10s to keep
  the connection alive.

- New exported types: `UserChannelCallback`, `UserChannelEvent`,
  `UserTradeEvent`, `UserOrderEvent`, `PolymarketUserChannelCreds`.

### Migration

No breaking changes. The `userChannelCreds` config field is optional.
Existing WebSocket usage (order book, trades) is unaffected.

## [2.39.0] - 2026-05-08

### DX: SDK type safety, passthrough converters, and outcome ID consistency

A developer experience overhaul across core, TypeScript SDK, and Python SDK.

**Typed SDK params** -- Generated SDK methods now have real parameter types
instead of `any`. `fetchMarkets(params?: MarketFilterParams)` replaces
`fetchMarkets(params?: any)`, giving consumers full IDE autocomplete and
compile-time validation. Affected params: `MarketFilterParams`,
`EventFetchParams`, `MyTradesParams`, `OrderHistoryParams`, `OHLCVParams`,
`TradesParams`.

**Passthrough converters** -- SDK converter functions (`convertMarket`,
`convertEvent`, etc.) no longer enumerate fields explicitly. TypeScript
uses spread (`{ ...raw }`) and Python uses a new `_auto_convert()` helper
that iterates dataclass fields. New fields added to `types.ts` now flow
through to both SDKs automatically instead of being silently dropped.

**Outcome ID consistency** -- All methods that accept an outcome identifier
now use `outcomeId` (TS) / `outcome_id` (Python) instead of the ambiguous
`id`. Renamed in: `fetchOHLCV`, `fetchOrderBook`, `fetchTrades`,
`watchOrderBook`, `watchOrderBooks`, `unwatchOrderBook`, `watchTrades`.

**MarketOutcome acceptance** -- All outcome-accepting methods now accept
`string | MarketOutcome` (TS) / `Union[str, MarketOutcome]` (Python), so
you can pass `market.yes` directly instead of `market.yes.outcomeId`. The
SDK generators auto-apply this to future methods.

**Limitless bug fix** -- `fetchTrades` was missing `resolveSlug()`, so
numeric outcome IDs that worked in `fetchOrderBook` failed silently.
Added `resolveSlug` to `fetchTrades`, `watchOrderBook`, and `watchTrades`.

### Migration

No breaking changes. Python callers using the old `id=` keyword argument
will see a `DeprecationWarning` but the call still works:

```python
# Old (deprecated, still works)
ex.fetch_order_book(id="token123")

# New (preferred)
ex.fetch_order_book(outcome_id="token123")
ex.fetch_order_book(market.yes)  # MarketOutcome object
```

TypeScript is fully backwards compatible -- parameter names are positional
in JS/TS so the rename has no runtime impact.

### Files

- `core/src/BaseExchange.ts` -- param renames
- `core/src/exchanges/*/index.ts` -- param renames (15 exchange files)
- `core/src/exchanges/limitless/index.ts` -- resolveSlug bug fix
- `sdks/typescript/pmxt/client.ts` -- passthrough converters, new imports
- `sdks/typescript/pmxt/models.ts` -- added param types, fixed missing fields
- `sdks/typescript/scripts/generate-client-methods.js` -- typed params, MarketOutcome widening
- `sdks/python/pmxt/client.py` -- _auto_convert helper, compat shim, MarketOutcome widening
- `sdks/python/scripts/generate-client-methods.js` -- typed params, compat shim generation

## [2.38.0] - 2026-05-08

### Feat: Hyperliquid prediction market (HIP-4 Outcome Markets)

Added Hyperliquid as the 12th supported exchange. Hyperliquid's HIP-4
outcome markets are binary contracts that trade on the same HyperCore
matching engine as their perps and spot, settling in USDH.

**Read-only (no credentials required):**
- `fetchMarkets` / `fetchEvents` -- discovers outcomes via `outcomeMeta`
- `fetchOrderBook` -- L2 book via `#coin` notation
- `fetchOHLCV` -- candle snapshots (1m through 1M intervals)
- `fetchTrades` -- recent trades

**User data (wallet address required):**
- `fetchBalance` / `fetchPositions` / `fetchOpenOrders` / `fetchMyTrades`

**Trading (private key required):**
- `buildOrder` / `submitOrder` / `createOrder` / `cancelOrder`
- Full EIP-712 phantom agent signing (msgpack + keccak256 action hash)
- Outcome market orders use `grouping: "na"` per HIP-4 spec

**Environment variables:**
- `HYPERLIQUID_WALLET_ADDRESS` -- wallet address for read-only user data
- `HYPERLIQUID_PRIVATE_KEY` -- EVM private key for trading (EIP-712)

**New dependency:** `msgpackr` for Hyperliquid action hash serialization.

### Files

- `core/src/exchanges/hyperliquid/` -- 7 files (config, utils, errors,
  fetcher, normalizer, auth, index)
- `core/src/server/exchange-factory.ts` -- added `case "hyperliquid"`
- `core/src/index.ts` -- added exports

## [2.37.14] - 2026-05-08

### Feat: Polymarket deposit wallet support (signatureType 3)

- **CLOB client upgrade**: `@polymarket/clob-client-v2` upgraded from
  1.0.2 to 1.0.5, adding support for `POLY_1271` (signatureType 3)
  deposit wallet order signing with ERC-7739 wrapped ERC-1271 signatures.

- **New signature type**: Added `SIG_TYPE_POLY_1271 = 3` to
  `PolymarketAuth`. Accepted via `signatureType: 3`,
  `signatureType: "deposit_wallet"`, or `signatureType: "poly_1271"`.

- Deposit wallet accounts (the default for new Polymarket users) can
  now place orders via the standard CLOB API. Previously only EOA (0),
  Poly Proxy (1), and Gnosis Safe (2) were supported.

### Migration

No breaking changes. Pass `signatureType: 3` (or `"deposit_wallet"`)
and `funderAddress: "0xYourDepositWallet"` in credentials. Existing
signature types are unaffected.

## [2.37.13] - 2026-05-08

### Fix: Complete baseUrl wiring across all exchanges

Audited every exchange and fixed cases where `credentials.baseUrl` was
silently ignored:

- **Smarkets**: `fetchOrderBook` read `SMARKETS_BASE_URL` env var
  directly instead of using the configured `config.apiUrl`.
- **Limitless**: `fetchMyTrades` read `LIMITLESS_BASE_URL` env var
  directly instead of using `this.apiUrl`. Unauthenticated callers
  with `baseUrl` had it silently dropped.
- **Metaculus**: `createOrder` and `cancelOrder` had silent fallbacks
  to the default URL when `baseUrl` was missing. Made `baseUrl`
  required in both context interfaces.
- **Dead exports**: Removed unused env-var-aware `BASE_URL` exports
  from Metaculus, Probable, Myriad, Opinion, and Limitless utils/config
  files. These gave the false impression that setting the env var would
  take effect, but nothing imported them.

## [2.37.11] - 2026-05-08

### Feat: Configurable API base URLs for all exchanges

Every exchange's API base URL is now overridable via environment variable,
enabling proxy setups for geo-restricted venues. No code changes needed —
just set the env var and all API calls route through the proxy.

| Exchange | Env var | Default |
|----------|---------|---------|
| Polymarket CLOB | `POLYMARKET_CLOB_URL` | `https://clob.polymarket.com` |
| Polymarket Gamma | `POLYMARKET_GAMMA_URL` | `https://gamma-api.polymarket.com/events` |
| Polymarket Gamma Markets | `POLYMARKET_GAMMA_MARKETS_URL` | `https://gamma-api.polymarket.com/markets` |
| Polymarket Gamma Search | `POLYMARKET_GAMMA_SEARCH_URL` | `https://gamma-api.polymarket.com/public-search` |
| Polymarket Data | `POLYMARKET_DATA_URL` | `https://data-api.polymarket.com` |
| Polymarket US API | `POLYMARKET_US_BASE_URL` | `https://api.polymarket.us` |
| Polymarket US Gateway | `POLYMARKET_US_GATEWAY_URL` | `https://gateway.polymarket.us` |
| Kalshi | `KALSHI_BASE_URL` | `https://api.elections.kalshi.com` |
| Kalshi Demo | `KALSHI_DEMO_BASE_URL` | `https://demo-api.kalshi.co` |
| Limitless | `LIMITLESS_BASE_URL` | `https://api.limitless.exchange` |
| Opinion | `OPINION_BASE_URL` | `https://proxy.opinion.trade:8443/openapi` |
| Smarkets | `SMARKETS_BASE_URL` | `https://api.smarkets.com` |
| Probable | `PROBABLE_BASE_URL` | `https://market-api.probable.markets` |
| Myriad | `MYRIAD_BASE_URL` | `https://api-v2.myriadprotocol.com` |
| Metaculus | `METACULUS_BASE_URL` | `https://www.metaculus.com/api` |

Backwards compatible — when no env var is set, the default URL is used.

## [2.37.10] - 2026-05-08

### Fix: Router-only methods now fail clearly instead of silently

- **Sidecar 501 guard**: Calling a router-only method (e.g.
  `fetchMarketMatches`, `fetchEventMatches`, `compareMarketPrices`,
  `fetchArbitrage`) on a regular exchange like `polymarket` now returns
  HTTP 501 with a message telling you to use `exchange: "router"`.
  Previously it threw a generic 500 `"Method X not implemented."` with
  no hint about what to do instead.

- **OpenAPI exchange scoping**: The sidecar OpenAPI spec now restricts
  the `exchange` enum to `["router"]` on all 8 router-only operations.
  The MCP tool generator reads this spec, so MCP tools will no longer
  accept invalid exchanges for cross-venue methods. The `{exchange}`
  path template is preserved for sidecar routing; only the enum is
  scoped.

- **SDK Router method name fix**: `Router.fetchMarketMatches` in
  `pmxtjs` was internally dispatching to the deprecated sidecar method
  name `fetchMatches` instead of `fetchMarketMatches`. Since
  `fetchMatches` has no entry in `method-verbs.json`, every call
  incurred a wasted 405 GET probe before falling back to POST. Fixed
  to use the canonical name.

## [2.37.9] - 2026-05-07

### Feat: Limitless HMAC authentication and smart wallet support

- **SDK upgrade**: `@limitless-exchange/sdk` upgraded from 1.0.2 to 1.0.5,
  adding HMAC request signing (`lmts-api-key`, `lmts-timestamp`,
  `lmts-signature` headers). New API tokens generated from the Limitless
  dashboard require HMAC auth; the legacy `X-API-Key` header is no longer
  accepted for these tokens.

- **HMAC auth**: When `apiSecret` is provided in credentials, the
  `LimitlessAuth` HTTP client uses HMAC-signed requests instead of the
  legacy API key header. Existing users who pass only `apiKey` (no
  `apiSecret`) are unaffected — the legacy path is unchanged.

- **Smart wallet signing**: Added `walletAddress` credential field. When
  set, orders use `maker = walletAddress` (the smart wallet) and
  `signer = privateKey address` (the EOA), enabling EIP-712 signing for
  accounts that trade through a smart wallet. Without `walletAddress`,
  the standard `maker = signer = wallet.address` flow is used (backwards
  compatible).

- **ethers v5/v6 compatibility**: Applied `signTypedData` shim
  (`wallet._signTypedData → wallet.signTypedData`) in all code paths
  that pass a wallet to the SDK's `OrderClient` or `OrderSigner`. This
  fixes `TypeError: this.wallet.signTypedData is not a function` when
  pmxt-core's ethers v5 wallet is used with the SDK's v6 internals.

- **Delegated signing support**: When `apiSecret` is provided without
  `privateKey`, the client initializes in delegated mode — orders are
  submitted unsigned via HMAC-authenticated HTTP, and the Limitless
  server signs on behalf of the account. Requires `delegated_signing`
  scope on the API token (partner access).

- **`onBehalfOf` in `CreateOrderParams`**: Added optional field for
  Limitless delegated signing, specifying the profile ID to trade on
  behalf of. Auto-resolved from the wallet address when not provided.

### Migration

No breaking changes. Existing credentials (`apiKey` + `privateKey`)
continue to work exactly as before. To use HMAC auth, add `apiSecret`
to credentials. To use smart wallet signing, add both `apiSecret` and
`walletAddress`.

## [2.37.8] - 2026-05-05

### Fix: Opinion child market titles now include parent event context

- Opinion categorical markets (e.g., "Next James Bond actor?") produce
  child markets with generic titles like "$200M", "Callum Turner", or
  "June 30, 2026". These titles lack the subject context needed for
  cross-venue matching.
- The Opinion normalizer now prepends the parent event title to child
  market titles using the same `${event} - ${market}` pattern Polymarket
  uses. Examples:
  - `$200M` → `Probable FDV above ... one day after launch? - $200M`
  - `Callum Turner` → `Next James Bond actor? - Callum Turner`
  - `June 30, 2026` → `Will Trump visit China by...? - June 30, 2026`
- This prevents the cross-venue matcher from incorrectly pairing generic
  Opinion markets (e.g., Probable FDV "$200M") with unrelated markets on
  other venues that share the same threshold (e.g., Variational FDV
  "$200M", Unit FDV "$200M").

## [2.37.7] - 2026-05-05

### Fix: Kalshi `watchOrderBook` returns empty orderbook for non-existing markets (#124)

- Kalshi's WebSocket sends a valid `orderbook_snapshot` even for
  non-existing market IDs, with `market_id: ""` and no price data. The
  handler parsed this as an empty orderbook and resolved successfully,
  while Polymarket correctly threw a timeout error.
- The snapshot handler now detects the empty `market_id` and rejects the
  resolver with a clear "market not found" error, consistent with the
  timeout behavior on other venues.

## [2.37.6] - 2026-05-05

### Fix: Kalshi `watchOrderBook` always returns empty orderbook (#125)

- Kalshi's V2 WebSocket API changed the snapshot message format from
  cent-denominated `yes`/`no` arrays to dollar-denominated string pairs
  (`yes_dollars_fp`/`no_dollars_fp`). The handler only looked for the old
  fields, so both evaluated to `[]`, producing an empty orderbook.
- The snapshot handler now detects the V2 format and parses the string
  pairs with the same `1 - no_price` ask conversion used by
  `fetchOrderBook`.
- The delta handler now handles V2 `price_dollars_fp`/`delta_dollars_fp`
  fields in addition to the legacy cent-based integers.
- Backward compatible: markets still sending the old format continue to
  work unchanged.

## [2.37.5] - 2026-05-04

### Fix: OpenAPI spec not auto-regenerated on direct pushes to main

- The CI check for OpenAPI spec drift only ran on pull requests. Direct
  pushes to main bypassed the check entirely, allowing the spec (and
  downstream MCP + SDKs) to silently drift from `BaseExchange.ts`.
- The `openapi-check` workflow now auto-regenerates and commits the
  sidecar spec on push to main. The PR check-and-fail behavior is
  unchanged.
- The path trigger now watches all source files the generator reads
  (`types.ts`, `router/types.ts`, `math.ts`, `exchange-factory.ts`),
  not just `BaseExchange.ts`.
- The publish workflow now runs `generate:openapi` before SDK generation
  as a safety net.

### Fix: `fetchOrderBook` `side` parameter missing from OpenAPI spec

- The optional `side` parameter added in v2.37.0 was never propagated to
  the OpenAPI spec because the commit was pushed directly to main
  (bypassing the PR-only CI check above).
- The `paramKind` classifier in `generate-openapi.js` did not recognize
  string literal unions (`'yes' | 'no'`), causing methods with such
  parameters to incorrectly flip from GET to POST. String literal unions
  are now classified as `string`, keeping `fetchOrderBook` as GET with
  `side` as a query parameter.

## [2.37.4] - 2026-05-03

### Fix: Polymarket `fetchOrderBook` returns `timestamp: null`

- Polymarket's CLOB API returns the order book timestamp as a numeric
  string (e.g. `"1777816319919"`). The normalizer treated all string
  timestamps as ISO date strings and passed them to `new Date()`, which
  produced `Invalid Date` for numeric strings. `getTime()` then returned
  `NaN`, which `JSON.stringify` serialized as `null`.
- The normalizer now detects numeric strings and parses them with
  `Number()` instead of `new Date()`.

Fixes #120.

## [2.37.3] - 2026-05-03

### Fix: unhelpful error messages for `fetchOrderBook` with wrong ID type

- Users passing market slugs or condition IDs to `fetchOrderBook` now get
  a clear error explaining that the method requires an outcome token ID
  and how to obtain one (`market.yes.outcomeId` or `market.no.outcomeId`
  from `fetchMarkets`).
- Improved both the 400 (validation rejection) and 404 (upstream not found)
  error paths for Polymarket.

Fixes #113.

## [2.37.2] - 2026-05-03

### Fix: `watchOrderBook()` hangs forever on non-existing IDs

- All watch methods (`watchOrderBook`, `watchOrderBooks`, `watchTrades`)
  now reject after a configurable timeout (default 30s) when no data
  arrives. Previously, subscribing to a non-existing ID on Polymarket
  (and most other exchanges) would hang indefinitely because the
  WebSocket never receives data for an unknown asset.
- Added `watchTimeoutMs` config option to every exchange WebSocket
  implementation. Set to `0` to disable the timeout.
- Affected exchanges: Polymarket, Kalshi, Opinion, Probable, Baozi,
  Polymarket US.
- Limitless and Myriad were already safe (Limitless has a built-in
  3s WS timeout with REST fallback; Myriad uses polling).

Fixes #121.

## [2.37.1] - 2026-05-03

### Fix: websocket connection leak during reconnection

- `watchOrderBook()` / `watchTrades()` no longer race with the exchange's
  internal `scheduleReconnect` to create duplicate TCP connections.
- Previously, the sidecar streaming loop retried on error after 1s while
  the exchange's own reconnect timer fired at 5s, causing parallel
  connection attempts under network instability.
- The exchange layer now solely owns its connection lifecycle. Watch
  methods track subscriptions and return a pending promise that resolves
  when data arrives on the (re)established connection. They never throw
  transient connection errors.
- The streaming loop (`streamSingle`/`streamBatch`) no longer retries on
  error — if the exchange throws, it is fatal (terminated, auth failure).
- Affected exchanges: Kalshi, Opinion (both had `scheduleReconnect`).

Fixes #123.

## [2.37.0] - 2026-05-03

### Feat: explicit `side` parameter for `fetchOrderBook`

- `fetchOrderBook(id, side?)` now accepts an optional `'yes'` or `'no'`
  parameter to explicitly indicate which outcome side the caller wants.
- Required for exchanges like Limitless where the API returns a single
  orderbook per market (always the Yes side). When `side` is `'no'`,
  the orderbook is inverted: `noBid = 1 - yesAsk`, `noAsk = 1 - yesBid`.
- Previously, side detection relied on `isNoOutcome()` which requires a
  warm cache populated by `fetchMarkets()`. The cache is often incomplete
  (the default market fetch excludes some markets), causing the inversion
  to silently fail and returning identical Yes-side data for both outcomes.
- Backward compatible: `side` is optional. When omitted, the existing
  cache-based detection is used as a fallback.

## [2.36.1] - 2026-05-03

### Fix: consistent `NotFound` error for missing order books across venues

- `fetchOrderBook()` with a non-existing ID now throws `NotFound`
  (`NOT_FOUND`) on every venue. Previously Polymarket threw
  `OrderNotFound` (`ORDER_NOT_FOUND`) while Kalshi threw `NotFound`
  (`NOT_FOUND`), making cross-venue error handling unpredictable.
- Root cause: the Polymarket CLOB returns a generic "order not found"
  message on 404, which the base `ErrorMapper` heuristic mis-classified
  as an order lookup failure rather than an order-book lookup failure.
- The Polymarket fetcher now catches the mis-classified `OrderNotFound`
  and re-throws it as `NotFound` with a normalised message.
- The base `ErrorMapper.mapNotFoundError` heuristic now excludes
  messages containing "order book" from the `OrderNotFound` path.

Fixes #122.

## [2.36.0] - 2026-05-03

### Feat: OpenAPI path/operation-level server overrides

- `parseOpenApiSpec` now reads `servers` at both the path and operation
  level, per the OpenAPI 3.x spec. When present, the override is stored
  on `ApiEndpoint.baseUrl` and used instead of the top-level base URL
  when resolving implicit API method requests.
- This enables the Polymarket `getGeoblock` endpoint, which lives at
  `https://polymarket.com/api/geoblock` rather than on the CLOB host.
  The `servers` block was already declared in the spec but previously
  ignored by the parser.

## [2.35.32] - 2026-05-01

### Fix: generators broken after `createExchange` extraction

- `generate-openapi.js` and `generate-python-exchanges.js` parsed
  `createExchange()` from `app.ts` by hardcoded file path to discover
  which exchanges exist. The 2.35.31 refactor moved that function to
  `exchange-factory.ts`, breaking `generate:sdk:all` in CI.
- Updated both generators to read from `exchange-factory.ts`. Updated
  stale comments and error messages that still referenced `app.ts`.

## [2.35.31] - 2026-05-01

### Fix: Kalshi WebSocket subscription fan-out causing rate limits

- `KalshiWebSocket.watchOrderBook` re-sent **all** subscribed tickers
  on every new subscription. Watching 100 markets fired 100 subscribe
  messages (1 ticker, then 2, then 3, ..., then 100), totalling 5,050
  ticker strings in rapid succession. Kalshi rate-limits WebSocket
  commands, so this triggered 429s almost immediately.
- Now sends a single subscribe message containing only the **new**
  ticker. Same fix applied to `watchTrades`.

### Feat: batch `watchOrderBooks` method

- New `watchOrderBooks(ids, limit?)` method subscribes to multiple
  order books in a single WebSocket message. Returns a record/dict
  keyed by ticker.
- Kalshi implementation sends one `orderbook_delta` subscribe frame
  for all new tickers. Other exchanges fall back to parallel
  `watchOrderBook` calls.
- Added to BaseExchange, KalshiExchange, Python SDK
  (`watch_order_books`), and TypeScript SDK (`watchOrderBooks`).

### Feat: sidecar WebSocket endpoint for streaming

- The sidecar now exposes a `/ws` WebSocket endpoint for push-based
  streaming. SDKs can subscribe to `watchOrderBook`,
  `watchOrderBooks`, and `watchTrades` over a persistent connection
  instead of HTTP long-polling.
- Protocol: clients send `{"action": "subscribe", ...}` /
  `{"action": "unsubscribe", ...}` messages; the server pushes
  `{"event": "data", ...}` updates per symbol.
- Auth via `?token=` query parameter or `x-pmxt-access-token` header.
- Subscriptions are cleaned up automatically on disconnect.
- `startServer` auto-attaches the handler; `createApp` is unchanged.

### Feat: SDK WebSocket transport (Python + TypeScript)

- Both SDKs now try a WebSocket connection to the sidecar for watch
  methods before falling back to HTTP POST. The WS connection is lazy,
  shared across all subscriptions on an exchange instance, and
  reconnects automatically.
- **Python**: new `pmxt/ws_client.py` module. Uses `websocket-client`
  when available; falls back to HTTP transparently if not installed.
- **TypeScript**: new `pmxt/ws-client.ts` module. Uses native
  `WebSocket` in browsers, `ws` in Node.
- Existing HTTP-based `watch_order_book` / `watchOrderBook` continues
  to work identically. No breaking changes.

### Refactor: extract exchange factory

- Moved `createExchange` from `app.ts` to `server/exchange-factory.ts`
  for reuse by the new WebSocket handler. No public API changes.

## [2.35.30] - 2026-04-30

### Docs: cross-venue browse examples for event and market matches

- Updated the browse example on `fetchEventMatches` and
  `fetchMarketMatches` to show grouped cross-venue output (one entry
  per event/market concept, all venues listed underneath).

## [2.35.29] - 2026-04-30

### Fix: cross-venue docs examples lost on regeneration

- `generate-mintlify-docs.js` always emitted OpenAPI path refs for
  every endpoint in `docs.json`. Mintlify routed tagged operations
  (like `fetchEventMatches`) to a tag-derived URL (`hosted/event-matches`)
  that didn't match the MDX file at `fetch-event-matches.mdx`, silently
  dropping the hand-written examples.
- The generator now checks for an existing MDX file per operationId
  (camelCase to kebab-case convention). When one exists, it emits a
  file-path ref instead of an OpenAPI path ref, so Mintlify loads the
  MDX body content alongside the spec. Groups where every page is an
  MDX file omit the `openapi` key entirely.
- Fixed the sort comparator to track operationIds alongside refs, so
  the `order` array in `ENDPOINT_GROUPS` works regardless of ref format.

## [2.35.28] - 2026-04-30

### Fix: `fetchTrades` crashes with `start`/`end` params on Polymarket

- `fetchRawTrades` and `fetchRawMyTrades` in the Polymarket fetcher
  called `.getTime()` directly on `params.start`/`params.end`, assuming
  Date objects. When values arrive through the sidecar HTTP layer they
  are strings or numbers, causing `params.start.getTime is not a
  function`.
- Added a module-level `ensureDate()` that coerces strings (ISO 8601),
  epoch numbers (seconds or milliseconds), and Date passthroughs.
  Applied it to all four `.getTime()` call sites in the fetcher
  (`fetchRawTrades` start/end, `fetchRawMyTrades` since/until).
  Replaced the duplicate inline helper in `fetchRawOHLCV`.
- **TS SDK**: `fetchTrades` only forwarded `resolution` and `limit`,
  silently dropping `start` and `end`. Now forwards both, serializing
  Date objects to ISO strings.
- **Python SDK**: `fetch_trades` had no `start`/`end` parameters.
  Added them as named kwargs accepting strings or epoch integers.

## [2.35.27] - 2026-04-29

### Fix: "Hosted" tag missing on cross-venue MDX pages

- Removing the `openapi` field from the Cross-Venue group in
  `docs.json` (to fix extra dropdowns) also dropped the "Hosted" tag.
  Added `tag: Hosted` frontmatter to `fetchEventMatches` and
  `fetchMarketMatches` MDX pages.

## [2.35.26] - 2026-04-29

### Fix: docs.json MDX overrides lost during rebase

- `docs.json` was reverted to auto-generated OpenAPI paths during a
  rebase conflict resolution, removing all custom MDX page overrides.
  Restored references for `fetchEvents`, `fetchEvent`, `fetchMarkets`,
  `fetchMarket`, `fetchEventMatches`, `fetchMarketMatches`, and
  `fetchOHLCV` so use-case examples render on the production docs site.

## [2.35.25] - 2026-04-28

### Fix: `auto_start_server` fix lost on publish

- The `generate-python-exchanges.js` script hardcoded
  `auto_start_server: bool = True`, overwriting the 2.35.24 fix on
  every publish. Changed the generator to emit
  `auto_start_server: Optional[bool] = None` so the fix survives
  regeneration.

## [2.35.24] - 2026-04-28

### Fix: Hosted mode ignored when `pmxt_api_key` is set on exchange classes

- Every exchange class (`Polymarket`, `Kalshi`, `Limitless`, etc.)
  defaulted `auto_start_server=True`, which always started the local
  sidecar and overrode the hosted URL with `localhost`. The parent
  `Exchange.__init__` had correct hosted-mode logic (`auto_start_server
  = not is_hosted`) but it only triggered when `None` was passed.
- All exchange classes now default `auto_start_server=None`, letting
  the parent decide: True for local, False for hosted.
- Also fixed `_resolve_sidecar_host` to skip the lock file in hosted
  mode, preventing stale sidecar processes from hijacking hosted
  requests.
- Effect: `pmxt.Polymarket(pmxt_api_key="...")` now correctly routes
  to `api.pmxt.dev`, enabling OHLCV volume data and deep history via
  pmxt-ohlc.

## [2.35.23] - 2026-04-28

### Docs: Use-case example on fetchOHLCV endpoint

- `fetchOHLCV` API reference page now includes a Python, JavaScript,
  and curl example showing how to fetch hourly candles for a market.
- Added info box explaining that a PMXT API key unlocks volume data
  and deeper history (via pmxt-ohlc) compared to Polymarket's native
  API which has short history windows and no volume.

## [2.35.22] - 2026-04-28

### Docs: Use-case examples on cross-venue matching endpoints

- `fetchEventMatches` and `fetchMarketMatches` API reference pages now
  include Python, JavaScript, and curl examples for lookup mode (pass
  an event/market object or ID), and browse mode (search the catalog by
  keyword).

### Fix: TS Router prefer slug over venue-native ID for matching

- `fetchEventMatches({ event })` and `fetchMarketMatches({ market })`
  in the core Router now prefer the slug when extracting from a full
  object, matching the Python SDK fix from 2.35.19.

### Fix: Market matches browse mode uses `/v0/matched-markets`

- `fetchMarketMatches` browse mode (no identifier) previously routed
  through the arbitrage endpoint, which dropped the `query` param and
  had compliance issues. Now routes through `/v0/matched-markets` with
  full query/category support.

## [2.35.21] - 2026-04-28

### Feat: Browse mode for `fetchEventMatches`

- `fetchEventMatches` now supports browse mode — omit the event
  identifier and pass `query`, `category`, or `limit` to browse all
  cross-venue event match pairs from the catalog. Same pattern as
  `fetchMarketMatches` already supported.
- Python SDK: added `query` and `category` params to
  `fetch_event_matches`, `fetch_market_matches`, and `fetch_matches`.
- Core Router: browse path calls new hosted `/v0/events/matches`
  endpoint instead of requiring an event ID.

## [2.35.20] - 2026-04-28

### Fix: `sourceMarket` missing from `MatchResult` in both SDKs

- The OpenAPI spec and core Router correctly return `sourceMarket` on
  `MatchResult` in browse mode (when no specific market is given to
  `fetchMarketMatches`), but both hand-written SDK models silently
  dropped the field.
- Python: added `source_market: Optional[UnifiedMarket]` to
  `MatchResult` dataclass and parser.
- TypeScript: added `sourceMarket?: UnifiedMarket` to `MatchResult`
  interface and parser.

## [2.35.19] - 2026-04-28

### Fix: Router matching fails when passing venue-fetched event/market objects

- `fetch_event_matches(event=event)` and `fetch_market_matches(market=market)`
  extracted the venue-native ID (e.g. Polymarket Gamma numeric ID `31552`)
  and sent it to the hosted Router catalog, which only recognizes PMXT
  catalog UUIDs. Result: "event not found" / "market not found".
- The Router SDK now prefers the slug (which the catalog can resolve)
  over the venue-native ID when extracting from a full object. Falls
  back to the ID only when no slug is available.
- Same fix applied to `fetch_matches`, `compare_market_prices`, and
  `fetch_hedges`.

## [2.35.18] - 2026-04-28

### Fix: Polymarket market slug lookup broken without API key

- `fetchMarket({ slug: "..." })` on Polymarket was querying the Gamma
  `/events` endpoint, which only recognizes event-level slugs. Market
  slugs (e.g. `will-gavin-newsom-win-the-2028-us-presidential-election`)
  returned "Market not found".
- Now queries the correct Gamma endpoint (`/markets/slug/{slug}`),
  matching the behavior of the catalog-backed path.
- Event slug lookups (`fetchEvent`) are unaffected — they use a
  separate code path.

### Docs: Real-world examples on category and tag fields

- `category` and `tags` descriptions on `fetchEvents`, `fetchMarkets`,
  `fetchEvent`, `fetchMarket`, and their `filter` counterparts now list
  real venue values (e.g. "Sports", "Bitcoin", "Economic Policy" for
  Polymarket; "Sports", "Mentions" for Kalshi) instead of
  implementation jargon.

## [2.35.17] - 2026-04-28

### Docs: Catalog speed notice on discovery endpoints

- API reference pages for catalog-backed endpoints now show an `<Info>`
  callout explaining that passing a PMXT API key serves the request from
  the indexed catalog (~10 ms) instead of proxying to the venue (~500 ms).
  Applies to: `fetchMarkets`, `fetchEvents`, `fetchMarket`, `fetchEvent`,
  `fetchMarketsPaginated`, `fetchEventsPaginated`, `loadMarkets`.
- Uses Mintlify's `x-mint.content` extension so the notice renders as a
  proper info box rather than a plain blockquote.

### Fix: `unwatchOrderBook` doc page 404

- The OpenAPI generator collapsed single-exchange paths (e.g.
  `/api/{exchange}/unwatchOrderBook` to `/api/polymarket/unwatchOrderBook`)
  which broke the `docs.json` navigation reference. Path collapsing is
  now limited to Router-only endpoints, which are architecturally
  permanent. Methods that happen to have one implementation today keep
  the `{exchange}` template so the docs stay stable as venues add support.

## [2.35.16] - 2026-04-28

### Fix: Sidecar 401 Unauthorized when orphan occupies default port

- The launcher and `ServerManager` hardcoded `DEFAULT_PORT` (3847) for
  health checks. An orphaned sidecar on that port would pass the check,
  causing the client to connect with the wrong access token.
- Launcher now waits for the lock file to appear and health-checks the
  actual port the new sidecar bound (`waitForLockAndHealth`).
- `ServerManager._wait_for_health()` reads the port from the lock file
  on each poll iteration instead of using the default.
- New `_kill_orphan_sidecars()` kills all stale pmxt sidecar processes
  before spawning so the new sidecar always gets the default port.
  ([#119](https://github.com/pmxt-dev/pmxt/issues/119))

### Feat: `best_bid` / `best_ask` on Python SDK `MarketOutcome`

- `MarketOutcome` now exposes `best_bid` and `best_ask` fields from
  the API response (populated when `include_prices=True`).

## [2.35.15] - 2026-04-28

### Fix: Generic Yes/No outcome labels break cross-venue price comparison

- Opinion and Limitless markets use the candidate name as the market
  title but leave outcome labels as generic "YES"/"Yes". Polymarket and
  Kalshi put the candidate name on the outcome label. When comparing
  prices across venues by `yes.label`, Opinion and Limitless markets
  all collapsed under the key "YES"/"Yes" instead of matching the
  correct candidate.
- `addBinaryOutcomes()` now promotes the market title into `yes.label`
  when the label is a bare "yes" (case-insensitive), and sets `no.label`
  to `"Not {title}"`. Labels like "up"/"down"/"over"/"under" are left
  unchanged since they carry meaning for financial markets.

## [2.35.14] - 2026-04-28

### Fix: Opinion Trade URLs use slug instead of numeric ID

- Opinion market, event, and child-market URLs now use the venue-native
  `slug` field (e.g. `https://www.opinion.trade/market/democratic-presidential-nominee-2028`)
  instead of the numeric `marketId` (`https://opinion.trade/market/380`).
  Falls back to `marketId` when the API omits the slug.
- Fixed missing `www.` subdomain in all Opinion URLs.
- Added `slug` to `OpinionRawMarket` and `OpinionRawChildMarket` types.
  ([#118](https://github.com/pmxt-dev/pmxt/issues/118))

## [2.35.13] - 2026-04-28

### Fix: Kalshi markets returning price 0 despite active orderbooks

- The normalizer only read Kalshi's deprecated cent-integer fields
  (`last_price`, `yes_ask`, `yes_bid`) which Kalshi has stopped
  populating for many markets. Now prefers the FixedPointDollars string
  fields (`last_price_dollars`, `yes_ask_dollars`, `yes_bid_dollars`)
  with a fallback to the legacy fields.
  ([#117](https://github.com/pmxt-dev/pmxt/issues/117))
- Fixed `priceChange24h` computation that cast FixedPointDollars strings
  as numbers instead of parsing them.
- Removed dead `mapMarketToUnified` from `kalshi/utils.ts`.

### Feat: Arbitrary CandleInterval values

- `CandleInterval` relaxed from a fixed 6-value union to `string`. The
  common values (`1m`, `5m`, `15m`, `1h`, `6h`, `1d`) remain documented,
  but arbitrary intervals matching `^[0-9]+[smhd]$` (e.g. `30s`, `120s`,
  `3h`) are now accepted by venues that support them. Updated core type,
  both SDK types, OpenAPI spec, and JSDoc.

## [2.35.12] - 2026-04-27

### Fix: Router-only path rewriting survives CI

- **CI fix**: The path rewriting that replaces `/api/{exchange}/...`
  with `/api/router/...` for Router-only endpoints previously depended
  on `dist/` to detect exchange capabilities. In CI, `generate:openapi`
  runs before `build`, so `dist/` doesn't exist and the rewriting was
  silently skipped — causing every tag release to overwrite the correct
  paths with `{exchange}`. Added a static `ROUTER_ONLY_OPERATIONS`
  fallback so the generator produces correct paths regardless of build
  state.

## [2.35.11] - 2026-04-27

### Docs: Router-only endpoints show correct paths

- Router-only endpoints (`fetchMarketMatches`, `fetchEventMatches`,
  `fetchMatchedMarkets`) now display `/api/router/...` in the docs
  instead of `/api/{exchange}/...`. The OpenAPI generator detects
  single-exchange endpoints and replaces the `{exchange}` template
  with the concrete value, removing the exchange path parameter.

- Regenerated `docs.json` sidebar navigation to match the updated
  OpenAPI paths, fixing `mint dev` errors where Mintlify couldn't
  find endpoints under the old `{exchange}` template.

## [2.35.10] - 2026-04-27

### Bug Fix: Python SDK Hosted Mode Detection

- **`base_url` default fix**: Generated exchange classes in
  `_exchanges.py` hardcoded `base_url="http://localhost:3847"` which
  overrode `resolve_pmxt_base_url` when `pmxt_api_key` was provided.
  Changed default to `None` so the URL resolver correctly detects
  hosted mode. Without this fix, `is_hosted` was always `False` for
  exchange classes like `Polymarket(pmxt_api_key=...)`, and the trade
  execution guards (added in 2.35.9) never fired.

- **TypeScript SDK dist rebuild**: Rebuilt `dist/` to include the
  trade execution guards from 2.35.9.

## [2.35.9] - 2026-04-27

### API Naming & Compliance

Renamed cross-venue endpoints to use neutral, industry-standard
terminology (aligned with DomeAPI, Predexon, PredictionHunt conventions).
All old method names are preserved as deprecated aliases — no breaking
changes.

- **`fetchArbitrage`** → deprecated. Use `fetchMarketMatches()` without
  a `marketId` (browse mode) instead.
- **`fetchHedges`** → deprecated. Use `fetchRelatedMarkets()` instead.
- **`fetchMatchedMarkets`** / **`fetchMatchedPrices`** → deprecated.
  Merged into `fetchMarketMatches()` browse mode.
- **`compareMarketPrices`** / **`fetchRelatedMarkets`** → still work,
  hidden from docs (convenience aliases on `fetchMarketMatches`).

Response field renames (new endpoints only, old endpoints unchanged):
`spread` → `priceDifference`, `buyVenue`/`sellVenue` → `venueA`/`venueB`,
`buyPrice`/`sellPrice` → `priceA`/`priceB`.

### Browse Mode for Market & Event Matches

`fetchMarketMatches` and `fetchEventMatches` now support **browse mode**:
call without a `marketId`/`eventId` to search the full match catalog.

- New params: `query` (keyword search), `category`, `minDifference`,
  `sort` (`confidence` | `volume` | `priceDifference`).
- Browse results include `sourceMarket` field (both sides of the pair).
- Same method, same return type — lookup vs browse is determined by
  whether an identifier is provided.

### SDK: Trade Execution Blocked in Hosted Mode

`createOrder`, `buildOrder`, `submitOrder`, and `cancelOrder` now throw
`PmxtError` when called in hosted mode (`pmxt_api_key` set). Trade
execution must run locally via the SDK — PMXT never proxies order flow
through its servers. Applies to both Python and TypeScript SDKs.

### Docs & OpenAPI Improvements

- **Badges**: Endpoints tagged `[Hosted]` (catalog-only) or
  `[Local Only]` (trades). Everything else works both ways — no badge.
- **Auth scoping**: Bearer auth only shown on Hosted endpoints.
  Non-catalog endpoints show no auth requirement.
- **Code samples**: Python shown first. Read endpoints show minimal
  constructor (`pmxt_api_key` only). Write endpoints show full venue
  credentials. Comment on each: "API key optional," "API key required,"
  or "Runs locally."
- **Router paths**: Router-only endpoints now show `/api/router/...`
  instead of `/api/{exchange}/...` in the docs.
- Removed all references to arbitrage, hedging, spread scanning, and
  trade signals from public documentation.

## [2.35.8] - 2026-04-27

### Polymarket CLOB V2 Migration

- **SDK upgrade**: Replaced `@polymarket/clob-client` (V1) with
  `@polymarket/clob-client-v2`. The V2 SDK auto-detects the backend
  version via `GET /version` and creates V1 or V2 order structs
  accordingly — no flag or config needed.

- **ClobClient constructor**: Migrated both L1 and L2 client
  initialization from positional arguments to the V2 options object
  (`{ host, chain, signer, creds, signatureType, funderAddress }`).

- **Order building**: Removed `feeRateBps` from order args. Fees are
  now protocol-determined at match time in V2.

- **SignedOrder type**: Replaced the `@polymarket/order-utils` import
  with `SignedOrder` from the V2 SDK (a `SignedOrderV1 | SignedOrderV2`
  union that works against both backends).

- **On-chain balance**: Switched the on-chain balance fallback from
  USDC.e (`0x2791Bca1...`) to pUSD (`0xC011a7E1...`), the V2 trading
  collateral.

- **Error handling**: Updated the Polymarket error mapper for V2
  response format (`{ error: string }` instead of `{ errorMsg }`),
  added HTTP 425 (matching engine restarting) mapping, and expanded
  pattern matching for V2-specific errors (trading disabled, cancel-only
  mode, address banned, post-only, FOK/FAK, duplicate, size/expiration).

## [2.35.7] - 2026-04-26

### Improvements

- **Custom `llms.txt` and `llms-full.txt` for the docs site**: Replaced
  Mintlify's auto-generated LLM context files with a custom generator
  (`scripts/generate-llms.js`) that produces high-quality output for
  AI-assisted development. Key fixes:

  - **Ordering**: Introduction and Quickstart now appear at the top of
    `llms-full.txt` (line 16), not buried after 700+ lines of empty API
    stubs.
  - **API reference**: All 38 endpoints now include method, URL,
    parameters table, response type, and Python + TypeScript code
    samples inline — previously they were one-line stubs with no args
    shape or response example.
  - **JSX stripped**: `<Tabs>`, `<Card>`, `<Info>`, `<Warning>`, and
    `theme={null}` noise removed; Cards converted to bulleted links,
    Tabs to `**Python:**` / `**TypeScript:**` subheadings.
  - **Heading hierarchy**: Code-fragment headings no longer promoted to
    H1; clean H1→H4 nesting throughout.
  - **Absolute links**: All relative `](/path)` links converted to
    `https://pmxt.dev/docs/...`.
  - **Error codes**: Full error code table with HTTP status, retryable
    flag, and description added to the Reference section.
  - **End-to-end recipe**: Inline place-order → poll-until-filled
    example added.

- **CI integration for `llms.txt`**: The generator now runs in three
  pipelines to prevent drift:
  - `publish.yml` — on every release, regenerates and commits alongside
    other docs.
  - `docs-sync-check.yml` — on PRs touching core types, docs, or the
    generator itself, fails CI if `llms.txt` / `llms-full.txt` are
    stale.
  - `sync-docs-to-pmxt.yml` (hosted-pmxt) — after applying hosted
    endpoint manifests, regenerates llms files in the same auto-PR.

## [2.35.6] - 2026-04-26

### Fixes

- **SDK: Router methods now accept market/event as a positional
  argument** (Python & TypeScript): `fetch_market_matches(market)`,
  `fetch_event_matches(event)`, `compare_market_prices(market)`, and
  `fetch_hedges(market)` all accept the primary object directly instead
  of requiring it as a named/keyword argument. The old named style still
  works.

- **SDK: `MatchResult` and `EventMatchResult` proxy through to the
  underlying market/event** (Python & TypeScript): Properties like
  `title`, `slug`, `url`, `source_exchange`, etc. are now accessible
  directly on the result object (`match.title`) instead of requiring
  `match.market.title`.

## [2.35.5] - 2026-04-25

### Improvements

- **Removed deprecated `fetchMatches` from API spec and docs**: The
  deprecated `/api/{exchange}/fetchMatches` endpoint has been removed
  from the OpenAPI spec, Mintlify docs, and MCP tool list. Use
  `fetchMarketMatches` instead. The runtime route still works (logs a
  deprecation warning and delegates to `fetchMarketMatches`) so existing
  callers are unaffected.

- **Added `fetchMarketMatches` to Mintlify docs sidebar**: The
  Cross-Venue section now correctly lists "Find Similar Markets"
  pointing to `fetchMarketMatches`, which was previously missing from
  the sidebar.

## [2.35.4] - 2026-04-25

### Bug Fixes

- **Limitless `fetchOrderBook` returned identical data for Yes and No
  tokens**: The Limitless API returns a single order book per market
  (always the Yes side), but `fetchOrderBook` passed both token IDs
  through `resolveSlug` to the same slug, so callers got the Yes-side
  book regardless of which outcome they asked for. Now detects when the
  requested token is the No outcome and flips the book
  (`noBid = 1 - yesAsk`, `noAsk = 1 - yesBid`). This caused the hosted
  aggregator to report inverted prices for Limitless markets and produce
  false arbitrage signals with ~99% spreads.

## [2.35.3] - 2026-04-25

### Bug Fixes

- **`fetchArbitrage` always returned empty results**: The bulk arbitrage
  endpoint (`GET /v0/arbitrage`) was working correctly on the server, but
  `Router.fetchArbitrageBulk` double-unwrapped the response — `client.getArbitrage()`
  already extracts `.data`, so `res.data` in the Router was `undefined`,
  producing an empty array on every call. The SDK silently fell through to
  the N+1 fallback (`fetchArbitrageFallback`), which fetched matches
  per-market with live order book calls. This masked the bug but made
  arbitrage detection slow and fragile. Fixed by checking whether `res`
  is already an array before accessing `.data`.

## [2.35.2] - 2026-04-24

### Bug Fixes

- **Limitless outcome prices swapped**: The `mapMarketToUnified` helper
  iterated `Object.entries(market.tokens)` by index to look up prices,
  but the Limitless SDK defines `prices` as `[yes, no]` while
  `Object.entries` order depends on key insertion order. When the API
  returned `tokens: { no, yes }`, prices[0] (Yes price) was assigned to
  the No outcome and vice-versa. Fixed by using explicit key-based
  lookup (`market.tokens.yes` / `market.tokens.no`) instead of
  index-based iteration.

## [2.35.1] - 2026-04-24

### Bug Fixes

- **Opinion markets always return price 0.5**: The Opinion API's `/market`
  endpoint does not include price data, so the normalizer hardcoded
  `price: 0.5` for every Yes/No outcome. Now enriches markets with real
  prices by calling `/token/latest-price` for each market's Yes token
  after normalization, deriving the No price as `1 - yesPrice`. Uses
  `Promise.allSettled` so a single failed price fetch never breaks the
  batch. Applies to both `fetchMarkets` and `fetchEvents`. (#112)

## [2.35.0] - 2026-04-24

### New Features

- **`fetchEventsPaginated`**: New cursor-based paginated variant of
  `fetchEvents`, mirroring the existing `fetchMarketsPaginated`. The first
  call builds an in-memory snapshot and returns the first page with an
  opaque cursor; subsequent calls serve pages from the cached snapshot
  with zero additional API calls. Available in core, both SDKs
  (TypeScript: `fetchEventsPaginated`, Python: `fetch_events_paginated`),
  and the REST API. (#105)

- **`fetchEvents` 10k cap removed**: All exchange implementations
  previously hard-capped `fetchEvents` results at 10,000 events,
  silently dropping anything beyond that. Polymarket (which currently
  has ~11k active events) was the first venue to hit this ceiling. The
  internal fetch limits have been raised so all available events are
  returned. (#105)

## [2.34.3] - 2026-04-24

### Bug Fixes

- **Opinion categorical child markets missing `cutoffAt`**: Child markets
  under Opinion categorical events inherited most parent fields but not
  `cutoffAt`, causing them to appear as having no expiry. Now correctly
  inherits the parent's `cutoffAt`. (#110)

- **Sidecar survives updates and crashes require manual restart**: The
  SIGTERM-based shutdown was insufficient — old sidecar processes survived
  SDK updates and kept serving stale code. Now escalates to SIGKILL after
  the grace period. Adds retry with exponential backoff on connection
  failures across both SDKs, and auto-restarts the sidecar on first
  ECONNREFUSED so crashes self-heal on the next request. TypeScript SDK
  now re-reads the lock file port on every request (matching Python)
  so sidecar restarts on a different port are picked up transparently.

- **SDK generators emitted outdated method bodies**: Generated client
  methods did not use retry/backoff or dynamic port resolution, diverging
  from the hand-written methods. Generators now emit `_fetch_with_retry` /
  `fetchWithRetry` calls with typed error propagation (`PmxtError`
  subclasses) instead of generic exceptions.

## [2.34.2] - 2026-04-24

### Bug Fixes

- **Limitless `fetchOHLCV` and `fetchOrderBook` fail with "No entity found"**:
  Both methods passed the numeric outcome token ID as the `slug` path
  parameter to the Limitless API, which only accepts market slugs.
  Added an internal outcomeId-to-slug lookup populated during
  `fetchMarkets`, with a fallback fetch for callers that skip market
  discovery. (#109)

## [2.34.1] - 2026-04-23

### Bug Fixes

- **Router-only endpoints showed all exchanges in API docs**: The
  interactive API reference allowed selecting any exchange (e.g. Kalshi)
  for cross-venue endpoints (`fetchArbitrage`, `fetchMarketMatches`,
  `fetchEventMatches`, `fetchHedges`, `fetchMatches`), which returned a
  500 "not implemented" error. The per-operation exchange scoping logic
  existed in the generator but the spec was stale from a CI run that
  predated it. Regenerated — these endpoints now only show "router" in
  the exchange dropdown and only include Router code samples.

## [2.34.0] - 2026-04-23

### Breaking Changes (with backwards compatibility)

- **`fetchMatches` renamed to `fetchMarketMatches`**: The old name is
  preserved as a deprecated wrapper that emits a warning. Update call
  sites at your convenience — `fetchMatches` will continue to work.

### New Features

- **TypeScript Router class**: New `Router` class in the TypeScript SDK
  with full parity to the Python SDK — `fetchMarketMatches`,
  `fetchEventMatches`, `compareMarketPrices`, `fetchHedges`,
  `fetchArbitrage`.

- **`sourceExchange` on UnifiedMarket / UnifiedEvent**: Both Python and
  TypeScript SDK converters now propagate the `sourceExchange` field so
  callers always know which venue a market/event originated from.

- **Expanded `fetchArbitrage`**: Accepts a `relations` parameter to scan
  for identity, subset, superset, and disjoint opportunities. Response
  includes `relation` and `confidence` on each `ArbitrageOpportunity`.

### Bug Fixes

- **Probable URLs return 404**: Event URLs used `/events/` (plural,
  404) instead of `/event/` (singular). Market URLs used
  `/markets/{slug}` instead of `/event/{eventSlug}?market={id}`.

## [2.33.5] - 2026-04-23

### Bug Fixes

- **Kalshi volume/open_interest always zero**: The Kalshi normalizer only
  read legacy integer fields (`volume`, `volume_24h`, `open_interest`)
  which Kalshi no longer populates. Now parses the fixed-point string
  fields (`volume_fp`, `volume_24h_fp`, `open_interest_fp`) that Kalshi
  actually returns, falling back to the legacy fields for backwards
  compatibility. This was causing ~98% of Kalshi events to be skipped by
  volume-based filters downstream (e.g. the hosted-pmxt matching pipeline
  embedded only 231 of 16,357 Kalshi events).

## [2.33.4] - 2026-04-23

### Improvements

- **API reference sidebar follows Event → Market hierarchy**: Renamed
  "Markets & Events" to "Events & Markets" and reordered so events
  appear before markets, matching the documented data model.

- **Cross-Venue section replaces "Matching"**: Renamed the sidebar group
  from "Matching" to "Cross-Venue" — clearer for users unfamiliar with
  the feature. Endpoint titles rewritten: "Find Similar Events", "Find
  Similar Markets", "Compare Prices Across Venues", "Find Hedging
  Opportunities", "Find Arbitrage Opportunities".

- **Richer API reference descriptions**: Every Cross-Venue endpoint now
  has a plain-language description explaining what it does and why you'd
  use it, instead of terse "Fetch cross-venue matches for a given event."

- **Removed filterMarkets / filterEvents from API docs**: These are
  SDK-only helpers (local filtering), not API endpoints users should call
  directly. Hidden from the sidebar via `HIDDEN_OPERATIONS`.

- **Fixed "Fetch O H L C V" title**: `camelToTitle` now preserves
  acronyms — renders as "Fetch OHLCV" instead of splitting each letter.

## [2.33.3] - 2026-04-23

### Bug Fixes

- **Router ignores user's API key**: The server-side Router was
  hardcoded to `process.env.PMXT_API_KEY` instead of using the caller's
  Bearer token. Every Router request returned "missing api key" unless
  the server had the env var set. Now extracts the API key from the
  request's `Authorization: Bearer` header — exactly what the user
  passes.

## [2.33.2] - 2026-04-23

### Bug Fixes

- **Python SDK missing Router class**: `pmxt.Router()` raised
  `AttributeError: module 'pmxt' has no attribute 'Router'`. Added
  `Router` class to the Python SDK with all 5 matching methods
  (`fetch_matches`, `fetch_event_matches`, `compare_market_prices`,
  `fetch_hedges`, `fetch_arbitrage`) plus the inherited `fetch_markets`
  and `fetch_events`. New data models: `MatchResult`, `EventMatchResult`,
  `PriceComparison`, `ArbitrageOpportunity`, `MatchRelation`.

### Improvements

- **Router docs promoted to dedicated tab**: The Router section is now a
  top-level tab in the docs nav (Documentation | Router | API Reference)
  instead of a sidebar group buried under SDK. New pages: overview, search
  events, search markets, find similar markets, find similar events,
  compare prices & arbitrage.

- **Introduction leads with Router**: The landing page now opens with the
  Router as the headline feature instead of listing it as one of four
  equal cards.

- **Quickstart updated**: Replaced "Router SDK coming soon" note with a
  link to the Router docs — it's here now.

- **Removed `filterMarkets`/`filterEvents` from API Reference**: These
  are internal client-side utilities, not meaningful REST endpoints.

## [2.33.1] - 2026-04-22

### Bug Fixes

- **`MatchRelation` breaks SDK generation**: `MatchRelation` (a type alias for
  `'identity' | 'subset' | 'superset' | 'overlap' | 'disjoint'`) was added to
  `TYPE_REF_MAP`, causing the OpenAPI generator to emit a `$ref` to a
  non-existent component schema. The openapi-generator-cli rejected the spec
  with 4 validation errors. Removed `MatchRelation` from `TYPE_REF_MAP` so it
  resolves inline as a string enum via `TYPE_ALIAS_REGISTRY`, matching how
  `CandleInterval` and other type aliases are handled.

## [2.33.0] - 2026-04-22

### New Features

- **Router is now a first-class exchange**: `Router` extends
  `PredictionMarketExchange`, making it usable with the same interface as any
  venue adapter. `pmxt.Router({ apiKey })` works like `pmxt.Polymarket()` — it
  shows up in the exchange dropdown, gets auto-generated SDK code samples, and
  integrates with the capability system.

- **5 new matching methods on BaseExchange**: `fetchMatches`,
  `fetchEventMatches`, `compareMarketPrices`, `fetchHedges`, and
  `fetchArbitrage` are now part of the base exchange interface. Currently only
  Router implements them; other exchanges report `has.fetchMatches === false`.

- **"Matching" endpoint group in API reference**: The Mintlify docs sidebar now
  has a dedicated Matching section with all 5 cross-venue discovery methods.

### Improvements

- **Per-operation exchange scoping in docs**: The API reference exchange dropdown
  is now scoped per-method using the capability system (`exchange.has`). For
  example, `fetchMatches` only shows Router, `createOrder` excludes read-only
  exchanges, and `fetchOrderBook` excludes Metaculus. Previously every method
  showed every exchange regardless of support. This also reduced the OpenAPI spec
  from 470KB to 368KB by eliminating inapplicable code samples.

- **Router types in OpenAPI spec**: `FetchMatchesParams`, `MatchResult`,
  `EventMatchResult`, `PriceComparison`, `ArbitrageOpportunity`, and related
  types are now fully documented in the API reference with proper JSON schemas.

## [2.32.5] - 2026-04-22

### Bug Fixes

- **Router `fetchMatches` returns `undefined` for `bestBid`/`bestAsk`**: The
  hosted API returns prices nested inside the match's `market` object, but
  `MatchResult` exposes them at the top level. `fetchMatches` now maps them up
  so callers get prices directly on the result without reaching into the market.

## [2.32.4] - 2026-04-22

### Bug Fixes

- **Limitless `fetchOrderBook` outcomeId resolution moved to hosted API**
  ([#104](https://github.com/pmxt-dev/pmxt/issues/104)):
  The 2.32.3 cache-based `resolveToSlug` approach was unreliable because
  `loadMarkets()` only returns active markets (~306). Removed the local
  resolution. The Limitless API requires a slug for `fetchOrderBook`; hosted
  PMXT users (`pmxt_api_key`) get transparent outcomeId-to-slug resolution
  via the hosted API's DB. Direct SDK users should pass `market.marketId`
  (the slug) instead of `outcome.outcomeId`.

## [2.32.3] - 2026-04-22

### Bug Fixes

- **Limitless `fetchOrderBook` rejects `outcomeId` from `fetchMarkets`**
  ([#104](https://github.com/pmxt-dev/pmxt/issues/104)):
  `fetchOrderBook` passed the id directly as a slug to the Limitless API. When
  callers followed the standard PMXT pattern of passing `outcome.outcomeId`
  (a CLOB token ID), the call failed with "Market not found". `fetchOrderBook`
  now detects numeric CLOB token IDs and resolves them to the market slug via
  the market cache before calling the API.

- **Limitless `UnifiedMarket.slug` always `undefined`**: The `mapMarketToUnified`
  helper omitted the `slug` field. It is now populated from the raw market slug.

### New Features

- **Router class** (`pmxt.Router`): A new cross-exchange aggregation layer
  backed by the hosted PMXT API. Provides `fetchMatches`, `fetchEventMatches`,
  `compareMarketPrices`, `fetchHedges`, `fetchArbitrage`, `fetchMarkets`, and
  `fetchEvents`. Order routing is not yet implemented (`createOrder` throws).

## [2.32.2] - 2026-04-22

### Bug Fixes

- **Sidecar reports hardcoded `2.0.2` version**: The bundled sidecar server
  could not resolve `package.json` at runtime in pip/npm packages, so it always
  fell back to a stale hardcoded version string. The version is now injected at
  build time via esbuild `--define`, so `server.status()` reports the real
  release version.

## [2.32.1] - 2026-04-22

### Bug Fixes

- **TypeScript SDK build failure: duplicate method implementations**:
  `submitOrder`, `unwatchOrderBook`, and `unwatchAddress` had hand-written
  implementations that duplicated the auto-generated ones, causing TS2393.
  Removed the hand-written duplicates and added `BuiltOrder` to the generator's
  `SDK_PARAM_TYPES` so `submitOrder` gets the correct parameter type instead of
  `any`.

## [2.32.0] - 2026-04-22

### New Features

- **Polymarket `markets-by-token` endpoint**
  ([#98](https://github.com/pmxt-dev/pmxt/issues/98),
  [#101](https://github.com/pmxt-dev/pmxt/pull/101) — thanks @ndmeiri):
  Added `GET /markets-by-token/{token_id}` to the Polymarket CLOB spec, returning
  the condition ID and both token IDs for a given token. Available via
  `callApi('getMarketsByToken', { token_id })` in both SDKs.

- **New SDK methods: `unwatchOrderBook`, `unwatchAddress`, `submitOrder`**:
  Previously missing from the generated SDK clients, these methods are now
  available in both TypeScript and Python.

- **`fetchPositions` / `fetchBalance` accept optional `address` param** (Python):
  The Python SDK now matches the TypeScript SDK signature, allowing callers to
  pass a wallet address directly.

### Bug Fixes

- **Python `markets_by_slug` never populated**
  ([#102](https://github.com/pmxt-dev/pmxt/issues/102),
  [#103](https://github.com/pmxt-dev/pmxt/pull/103) — thanks @ndmeiri):
  `Exchange.markets_by_slug` was defined but never indexed during `load_markets`.
  Markets are now keyed by slug alongside the existing `markets` dict.

### SDK Regeneration

- Regenerated both TypeScript and Python SDK clients from core. Notable internal
  changes:
  - All read methods now use direct POST calls instead of the `sidecarReadRequest`
    helper (TS) / `_sidecar_read_request` helper (Python).
  - Error handling simplified: `PmxtError` replaced with standard `Error` (TS);
    `_parse_api_exception` replaced with `_extract_api_error` (Python).
  - `fetchOrderBook` signature narrowed from `string | MarketOutcome` to `string`
    in both SDKs.

## [2.31.4] - 2026-04-21

### Bug Fixes

- **`fetchMarkets` / `fetchEvents` ignore `offset` and `limit` without a filter**
  ([#95](https://github.com/pmxt-dev/pmxt/issues/95)):
  When no filter was provided, `BaseExchange` passed `offset`/`limit` through to
  the venue implementation and returned the result without slicing. No venue
  implementation actually honored `offset`, so all offset values returned the
  same results. The no-filter branch now applies `slice(offset, offset + limit)`
  the same way the with-filter branch already did.

## [2.31.3] - 2026-04-21

### Bug Fixes

- **Spurious `noNetwork` errors on `watchAddress` and `fetchBalance`**
  ([#92](https://github.com/pmxt-dev/pmxt/issues/92)):
  ethers v5's `JsonRpcProvider` auto-detects the network via `eth_chainId` on
  every instantiation. When public RPCs are slow or rate-limited, this fails
  with `NETWORK_ERROR` / `noNetwork`. Switched all three provider call sites
  (Polymarket, Limitless exchange, Limitless client) to `StaticJsonRpcProvider`
  with explicit chain IDs, which skips auto-detection entirely.

## [2.31.2] - 2026-04-20

### Bug Fixes

- **Polymarket `fetchPositions` returns empty array when positions exist**
  ([#99](https://github.com/pmxt-dev/pmxt/issues/99)):
  `enrichPositionsWithMarketIds` silently dropped all positions whose
  `conditionId` the Gamma API could not resolve. Positions with unresolvable
  `conditionId`s are now retained with an empty `marketId`.
- **Polymarket `fetchPositions` missing small positions**: The Data API's
  `sizeThreshold` parameter defaults to `1` server-side, filtering out
  fractional positions. Now explicitly set to `0` to return all positions
  regardless of size.

## [2.31.1] - 2026-04-18

### Bug Fixes

- **Python SDK: exchange subclasses reject `pmxt_api_key` kwarg**
  ([#97](https://github.com/pmxt-dev/pmxt/issues/97)):
  Auto-generated classes (`Polymarket`, `Kalshi`, `Limitless`, etc.) did not
  accept `pmxt_api_key`, even though the base `Exchange` class does. Fixed the
  code generator to include `pmxt_api_key` in every subclass `__init__` and
  forward it to `super()`.

### Docs

- **SDK server management page**: new `docs/sdk/server.mdx` covering
  `server.start()`, `stop()`, `restart()`, `status()`, `health()`, and
  `logs()`.

### Housekeeping

- Removed `testDummyMethod` from the OpenAPI spec and method-verbs map.
- Added description to the `close` endpoint in the OpenAPI spec.
- Regenerated OpenAPI spec to include `category` / `tags` shorthand params
  on `fetchEvents` and `fetchEvent` (present in source since v2.31.0 but
  the spec had not been regenerated).

## [2.31.0] - 2026-04-14

### New Features

- **Inline filtering on `fetchMarkets` / `fetchEvents` / `fetchMarketsPaginated`**

  `category` and `tags` are now top-level params on every fetch method:

  ```python
  # Python
  poly.fetch_events(query="election", limit=10, category="Politics")
  poly.fetch_markets(query="Trump", limit=10, tags=["Bitcoin"])
  ```

  ```typescript
  // TypeScript
  await poly.fetchEvents({ query: "election", limit: 10, category: "Politics" });
  await poly.fetchMarkets({ query: "Trump", limit: 10, tags: ["Bitcoin"] });
  ```

  For advanced criteria (volume ranges, price filters, date ranges, etc.), pass
  a `filter` object — it accepts the full `MarketFilterCriteria` /
  `EventFilterCriteria`:

  ```python
  poly.fetch_markets(
      query="election",
      category="Politics",
      filter={"volume24h": {"min": 10000}},
  )
  ```

  Top-level `category` / `tags` take precedence over the same fields inside
  `filter` when both are provided.

  `limit` and `offset` are applied **after** filtering, so
  `fetch_events(limit=10, category="Politics")` returns 10 Politics events —
  not "up to 10 events, some of which happen to be Politics."

- **Express sidecar: deep object coercion**

  The sidecar now recursively coerces nested query-string objects
  (`?filter[volume24h][min]=1000`) and accepts JSON-encoded filter values
  (`?filter={"category":"Politics"}`), so HTTP clients that bypass the SDK can
  use the new filter param directly.

- **OpenAPI spec: `MarketFilterCriteria` and `EventFilterCriteria` schemas**

  Both are now named component schemas in the generated spec, and the `filter`,
  `category`, and `tags` params appear on all relevant endpoints.

## [2.30.9] - 2026-04-14

### Bug Fixes

- **limitless: `fetchWatchedAddressActivity` silently swallows errors**
  ([#85](https://github.com/pmxt-dev/pmxt/issues/85)):
  Two `.catch()` handlers silently replaced errors from `fetchPositions` and
  `getAddressOnChainBalance` with empty arrays. Same pattern as Polymarket #84.
  Removed both so errors propagate naturally.

- **probable: fetcher/normalizer silently convert bad responses to empty arrays**
  ([#86](https://github.com/pmxt-dev/pmxt/issues/86)):
  Nine fallback patterns in the fetcher (`data?.history || data || []`, etc.)
  silently returned empty results for malformed API responses. The normalizer
  compounded this with multi-field fallback chains (`raw.qty || raw.size ||
  raw.amount || '0'`). Replaced all with explicit shape validation and
  single canonical field names.

- **polymarket_us: silent fallbacks on required SDK response fields**
  ([#87](https://github.com/pmxt-dev/pmxt/issues/87)):
  Five data-fetching methods used `|| []` / `|| {}` on fields the SDK types
  declare as required. A missing field always means a broken response, not
  "no results". Replaced with explicit validation that throws. Also removed
  the `submitOrder()` catch-and-synthesize pattern that constructed a fake
  Order with `filled: 0, status: 'open'` when `fetchOrder()` failed.

- **opinion: `normalizeOrder` sets `outcomeId` to `marketId` (wrong ID space)**
  ([#89](https://github.com/pmxt-dev/pmxt/issues/89)):
  `outcomeId` was set to `String(raw.marketId)`, making all orders on the same
  market indistinguishable (Yes vs No). Derived from `raw.outcome` /
  `raw.outcomeSide` instead. Also replaced `|| ''` fallbacks on required token
  IDs with throws.

## [2.30.8] - 2026-04-14

### Bug Fixes

- **limitless: position `marketId` falls back to `conditionId` (wrong ID space)**
  ([#88](https://github.com/pmxt-dev/pmxt/issues/88)):
  Same bug class as Polymarket #83. When `market.slug` was missing from a
  position, the normalizer fell back to `conditionId` — an on-chain bytes32
  hash that the Limitless API does not accept. `fetchMarket(position.marketId)`
  always failed. Fixed by filtering out positions without `market.slug` in the
  fetcher and throwing in the normalizer if one slips through.

## [2.30.7] - 2026-04-14

### Bug Fixes

- **watcher: empty catch block causes promises to hang forever**
  ([#90](https://github.com/pmxt-dev/pmxt/issues/90)):
  `AddressWatcher.handleSubscriptionData` had an empty `catch { }` that
  silently swallowed all errors — network failures, malformed responses,
  `buildActivity` crashes. Pending `watch()` promises were never resolved
  or rejected, causing callers to hang indefinitely with no indication of
  failure. Fixed by rejecting all pending resolvers (both address-level
  and asset-filtered) with the actual error.

- **polymarket: silent `.catch()` hides trades/balances fetch errors**
  ([#84](https://github.com/pmxt-dev/pmxt/issues/84)):
  `fetchWatchedAddressActivity` caught errors from `getTrades` and
  `getAddressOnChainBalance` and silently replaced them with empty arrays.
  Downstream consumers could not distinguish "API is down" from "no data".
  Combined with the watcher empty catch (#90), this formed a double-catch
  chain where errors vanished at two layers. Removed both `.catch()` blocks
  so errors propagate to the watcher, which now rejects waiting promises.

## [2.30.6] - 2026-04-14

### Bug Fixes

- **polymarket: `watchAddress` and `fetchPositions` return wrong `marketId`**
  ([#83](https://github.com/pmxt-dev/pmxt/issues/83)):
  `Position.marketId` contained the on-chain condition ID (a bytes32 hash like
  `0x9191a...`) instead of the Polymarket market ID. Calling
  `fetchMarket({ marketId: position.marketId })` always failed with 422.
  Additionally, the GoldSky on-chain builder guessed `outcomeLabel` as
  `"Yes"`/`"No"` from a binary index, which was wrong for non-binary markets
  (e.g. returning `"No"` instead of `"Not December 31, 2026"`).

  **Fix:** Positions are no longer built from GoldSky on-chain data (which
  lacks real market IDs and outcome labels). `fetchRawPositions` now
  batch-resolves condition IDs to Gamma market IDs via
  `GET gamma-api.polymarket.com/markets?condition_ids=...`. Positions whose
  condition ID cannot be resolved are excluded from the result.
  Removed ~120 lines of dead GoldSky positions/PNL subgraph code.

## [2.30.5] - 2026-04-13

### Added

- **MCP compact responses**: Tool responses are now compacted by default for
  agent-friendly output. Strips URLs, images, slugs, metadata, convenience
  accessors, and deep nested data that bloat context windows. Order books capped
  at 10 levels, trades at 20, OHLCV at 50 candles. Orders trimmed to essential
  fields. `fetchEvents` output reduced ~66%+. All tools accept `verbose=true`
  to opt into full uncompacted output.

## [2.30.4] - 2026-04-13

### Bug Fixes

- **MCP: query parameters dropped for all GET methods**: `fetchEvents`,
  `fetchMarkets`, and other GET-based tools had `flatten: false` on their
  single object arg, causing `reconstructArgs` to look for `input["params"]`
  instead of collecting the flat query properties (`query`, `limit`, etc.).
  All parameters were silently dropped, making the inner API call return
  unlimited results and OOM the hosted Cloud Run instance. Fixed by setting
  `flatten: true` for GET methods with a single object arg in
  `generate-tools.cjs`.

## [2.30.3] - 2026-04-12

### Bug Fixes

- **limitless**: cap search `limit` to 100 (the Limitless API maximum) in
  `searchRawMarkets` and `searchRawEvents`. Previously the defaults were
  250 000 and 10 000 respectively, which caused every search query
  (`fetchMarkets({ query })`, `fetchEvents({ query })`) to return HTTP 400
  (`"limit must not be greater than 100"`).

## [2.30.2] - 2026-04-11

### Fixed

- **MCP agents call fetchMarkets instead of fetchEvents**: Agents didn't understand the Event -> Market -> Outcome hierarchy and defaulted to fetchMarkets for discovery. Updated OpenAPI descriptions for fetchEvents ("start here for discovery and search"), fetchMarkets ("prefer fetchEvents instead"), and UnifiedEvent schema to teach the data model with concrete examples. Also updated MCP server instructions in pmxt-mcp with a new DATA MODEL section and revised WORKFLOW that leads with fetchEvents.

## [2.30.1] - 2026-04-11

### Fixed

- **MCP publish failed on provenance mismatch**: The `--provenance` flag in `sync-mcp.yml` requires the publishing repo to match the package's `repository.url`, but the workflow runs from `pmxt-dev/pmxt` while publishing a package cloned from `pmxt-dev/pmxt-mcp`. Removed `--provenance` from the npm publish step.

## [2.30.0] - 2026-04-11

### Added

- **MCP docs page** (`docs/mcp.mdx`): New documentation page covering the hosted Streamable HTTP MCP server at `api.pmxt.dev/mcp`. Includes step-by-step setup for Claude Code, Cursor, and custom MCP clients, full tool reference table (read-only vs trading), authentication details, and comparison with the `@pmxt/mcp` npm package. Added to Mintlify navigation under Get Started.

## [2.29.0] - 2026-04-11

### Added

- **MCP server for AI agents (`@pmxt/mcp`)**: New standalone repo ([pmxt-dev/pmxt-mcp](https://github.com/pmxt-dev/pmxt-mcp)) that exposes every PMXT REST API endpoint as an MCP tool. Agents running in Claude, ChatGPT, Cursor, or any MCP-compatible client can now discover markets, check prices, and place trades through PMXT with just an API key. 22 tools generated 1:1 from the OpenAPI spec — no abstraction layer. Destructive operations (createOrder, submitOrder, cancelOrder) are annotated for human-in-the-loop confirmation. Server instructions guide agents on setup, workflow, and credential handling. Install: `npx -y @pmxt/mcp` with `PMXT_API_KEY` set.
- **CI/CD sync workflow** (`.github/workflows/sync-mcp.yml`): Every pmxt release automatically copies the latest OpenAPI spec to pmxt-mcp, regenerates tool definitions, bumps the version, and publishes `@pmxt/mcp` to npm. The MCP server stays in sync without manual intervention.

## [2.28.7] - 2026-04-11

### Added

- **Security & Credential Handling docs page**: New `docs/security.mdx` covering the full credential flow (HTTPS → in-memory signing → venue API), per-venue credential type breakdown (which venues require raw wallet private keys vs. scoped API keys), dedicated trading wallet recommendation, liability disclaimer, and guidance to run pmxt locally for maximum custody. Added cross-link from `authentication.mdx` with an info callout warning about on-chain venue key requirements. Added to Mintlify navigation under Get Started.

## [2.28.6] - 2026-04-11

### Fixed

- **Publish workflow docs commit failed on unstaged changes**: The `git pull --rebase` ran before `git add`, but SDK generation leaves unstaged files in the working tree, causing rebase to abort. Reordered to stash unstaged changes before pulling, then pop and re-add after rebase.

## [2.28.5] - 2026-04-11

### Fixed

- **Publish workflow docs auto-commit failed**: The v2.28.3 amend-and-force-push strategy failed for two reasons: tag checkout produced a detached HEAD (so `--amend` created a rootless 458-file commit), and `--force-with-lease` was rejected because the auto-tag workflow had already pushed to main. Replaced with a simpler approach: checkout `main` with full history, `git pull --rebase` to catch any concurrent pushes, then create a normal commit. No force-push needed.

## [2.28.4] - 2026-04-11

### Fixed

- **Publish workflow docs commit failed on detached HEAD**: The v2.28.3 docs auto-commit step ran on a detached HEAD (tag checkout), causing `git commit --amend` to create a rootless commit containing the entire repo. Changed `actions/checkout` to explicitly check out `main` with full history (`fetch-depth: 0`) so the amend targets the actual tagged commit on the branch.

## [2.28.3] - 2026-04-11

### Fixed

- **Mintlify docs not updating on new releases**: The publish workflow ran `generate:mintlify` to regenerate `docs.json` navigation, but never committed the result back to the repo. Since Mintlify reads `docs.json` from git, the navigation stayed stale after every release. Changed the workflow to amend the tagged commit with the regenerated docs (`docs.json`, `openapi.json`, `venues.mdx`) and force-update the tag, so docs stay in sync without creating extra commits.

## [2.28.2] - 2026-04-11

### Changed

- **Docs rebrand from "PMXT Hosted" to "PMXT"**: Updated `docs.json` name field and added combined icon+wordmark logo images (`logo-light.png`, `logo-dark.png`) for Mintlify light/dark mode. Removed invalid `/v0/` Router endpoints from API Reference navigation that had no matching OpenAPI spec paths. Added `unwatchOrderBook` and `testDummyMethod` to Realtime and Other groups respectively.

## [2.28.1] - 2026-04-11

### Changed

- **`exchange.has` capabilities are now derived from method overrides at runtime**: Removed the manual 21-key `override readonly has = { ... }` block from all 10 exchanges (~240 lines deleted). Capabilities are now computed automatically by `BaseExchange` via prototype introspection — if a subclass overrides a method, `has` reports `true`; if not, `false`. The `fetchMarkets`/`fetchEvents` delegation pattern (base class calls `*Impl`) is handled via a delegate map. For the three exchanges that need `'emulated'` annotations (Baozi, Myriad, Smarkets) or `false` overrides on methods that throw custom errors (e.g. "pari-mutuel bets cannot be cancelled"), a minimal `capabilityOverrides` property replaces the full declaration. Adding a new method to `BaseExchange` no longer requires touching non-implementing exchanges. Verified against old manual declarations for all 10 exchanges — exact match.

## [2.28.0] - 2026-04-11

### Added

- **`unwatchOrderBook` / `unwatch_order_book` for per-asset WebSocket unsubscription** (issue #79): Previously the only way to stop receiving order book updates was `close()`, which tore down all WebSocket connections across all assets. Users streaming multiple assets (e.g. rotating through 5-minute Polymarket markets) accumulated subscriptions with no way to release individual ones, causing unbounded bandwidth growth — reported as 300+ Mbps in issue #79. Added `unwatchOrderBook(id)` across the full stack: `BaseExchange` stub, Polymarket implementation (calls `WSSubscriptionManager.removeSubscriptions`, clears pending resolvers and cached order book state), sidecar POST route, and both SDKs (`unwatchOrderBook` in TypeScript, `unwatch_order_book` in Python). All other exchanges declare `unwatchOrderBook: false` in their capabilities until they add support. The method is safe to call on assets that were never watched — it returns successfully with no side effects.

## [2.27.10] - 2026-04-11

### Fixed

- **`fetch_balance` returns $0 for wallets that omit `signature_type`** (issue #80): When `signatureType` was not provided and the Polymarket Data API profile lookup failed (404), `getClobClient()` defaulted to EOA (signature type 0). Since 2023, all new Polymarket accounts use Gnosis Safe (signature type 2), so the EOA default caused the CLOB API to query the wrong on-chain address — returning a zero balance with no error. Changed the fallback default from EOA (0) to Gnosis Safe (2). Users who explicitly pass `signature_type='gnosis_safe'` or `signature_type='eoa'` are unaffected — explicit values are still respected. Also replaced magic numbers 0/1/2 throughout `auth.ts` with named constants (`SIG_TYPE_EOA`, `SIG_TYPE_POLY_PROXY`, `SIG_TYPE_GNOSIS_SAFE`).

## [2.27.9] - 2026-04-10

### Fixed

- **`watch_order_book` returns "Unauthorized: Invalid or missing access token" despite valid credentials** (issue #76): Eight methods in both the Python and TypeScript SDKs — `watchOrderBook`, `watchTrades`, `watchAddress`, `unwatchAddress`, `watchPrices`, `watchUserPositions`, `watchUserTransactions`, `createOrder`, `buildOrder`, and `submitOrder` — were dispatched through the auto-generated `DefaultApi` client, which does not attach the `x-pmxt-access-token` header required by the sidecar's auth middleware. All other methods (e.g. `fetchOrderBook`, `cancelOrder`) already used direct HTTP calls with the access token. Replaced every `self._api.*` / `this.api.*` call site with the same manual `call_api()` / `fetch()` pattern used by working methods, ensuring `_get_auth_headers()` / `getAuthHeaders()` is called on every request.

## [2.27.8] - 2026-04-10

### Fixed

- **Phantom/Solana private keys produce cryptic ethers error instead of actionable message** (issue #78): Passing a Solana-format private key (base58 ed25519, e.g. from Phantom wallet) to the Polymarket exchange threw `INVALID_ARGUMENT: invalid hexlify value` from deep inside ethers.js, with no indication of what was wrong or how to fix it. Added early key format validation in `PolymarketAuth` constructor (`core/src/exchanges/polymarket/auth.ts`) that checks the key is a 64-character hex string (with optional `0x` prefix) before passing it to `new Wallet()`. Non-hex keys now throw a clear error explaining that Polymarket requires a 32-byte hex EVM key and that Solana wallet keys are not compatible.

## [2.27.7] - 2026-04-10

### Changed

- **Auto-generated SDK code samples replace hand-written `@example-ts`/`@example-python` JSDoc tags**: Removed all 78 hand-written example blocks from `BaseExchange.ts` and exchange files (`limitless`, `polymarket`, `probable`). These caused documentation drift — examples fell out of sync with the actual SDK API surface whenever method signatures changed. `extract-jsdoc.js` no longer parses or emits example tags. `generate-api-docs.js` now auto-generates idiomatic Python and TypeScript examples from method names and parameter signatures, using a shared `EXAMPLE_VALUES` lookup table for sensible defaults (with language-aware boolean formatting: `True`/`true`). The Handlebars templates are unchanged — they consume the same `{{this.example}}` slot, now populated by the auto-generator instead of hand-written JSDoc.

- **`generate-openapi.js` emits `x-sdk-constructors` vendor extension**: Parses `createExchange()` in `app.ts` (the same source of truth used by `generate-python-exchanges.js`) to extract per-exchange credential requirements, then embeds the result in the OpenAPI spec as `x-sdk-constructors`. Each entry maps an exchange wire key to its class name and constructor params (with Python snake_case names, TypeScript camelCase names, types, descriptions, and defaults). Adding a new exchange to `app.ts` automatically flows through to the spec — no manual metadata file to maintain. Consumed downstream by `hosted-pmxt/scripts/sync-docs.js` to generate per-exchange Mintlify code samples.

## [2.27.6] - 2026-04-09

### Fixed

- **Kalshi `UnifiedEvent.description` malformed and `MarketOutcome.label` showed `:: Democratic`** (issue #69): Two bugs in `core/src/exchanges/kalshi/normalizer.ts`. (1) `deriveEventDescription` used raw longest-common-prefix/suffix slicing, so if one market in an event had a slightly different trailing date (e.g. `KXCABOUT-26MAR` had markets ending in `Mar 10, 2026` and `Mar 30, 2026`), the suffix loop character-stripped until a match landed mid-token and produced `"If {x}0, 2026, then the market resolves to Yes."`. Replaced with a template-voting algorithm: substitute each market's candidate name with `{x}` in its `rules_primary`, then pick the most frequent template. (2) Outcome labels preferred `market.subtitle` over `yes_sub_title`, but Kalshi sometimes stores structural metadata like `":: Democratic"` in `subtitle` (observed on `KXGOVCA-26`), producing labels like `":: Democratic"` / `"Not :: Democratic"`. Label derivation now prefers `yes_sub_title` and ignores any value starting with `::`. Additional hardening: only templates containing `{x}` are eligible to win the vote (so a rule we failed to template can never leak a specific candidate name into the event description), and templating uses Unicode-aware word boundaries (`(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])`) so non-ASCII candidate names still match. Covered by four regression tests in `core/test/unit/normalizers/kalshi.test.ts`: KXCABOUT suffix-drift case, KXGOVCA structural-subtitle case, no-majority distinct-dates case, and non-ASCII candidate names case.

## [2.27.5] - 2026-04-09

### Changed

- **Documented all 129 previously undocumented interface fields in `core/src/types.ts` and `core/src/BaseExchange.ts`**: After 2.27.3 made the OpenAPI generator AST-derived, fields without JSDoc or trailing `//` comments rendered in the spec (and downstream Mintlify docs) with no description — `offset`, `limit`, every `ExchangeHas` capability flag, all `UnifiedMarket` / `UnifiedEvent` / `Order` / `Position` / `Trade` fields, etc. This release adds concise JSDoc to every undocumented property signature in the two source files, bringing coverage from 68/197 (34.5%) to 197/197 (100%). Regenerated `openapi.yaml` now carries 282 `description:` fields (up from ~155). Pure documentation change — no type signatures, runtime behaviour, or SDK surface modified. The AST walker picks these up automatically, so Mintlify's API playground will now surface field descriptions for every parameter and response model.

## [2.27.4] - 2026-04-09

### Fixed

- **`pmxtjs` build broken by nested `oneOf` in `filterMarkets`/`filterEvents` request schemas**: After 2.27.3 began AST-resolving `EventFilterCriteria`/`MarketFilterCriteria` type aliases, the generated `items.oneOf` wrapped a second anonymous `oneOf` (for `string | Criteria | FilterFunction`). `openapi-generator-cli` emits broken TypeScript for this nested-anonymous-oneOf shape — it generates a `FilterEventsRequestArgsInnerOneOf` class but no matching `instanceOfFilterEventsRequestArgsInnerOneOf` type guard, which breaks `tsc`. Python published fine because its codegen handles nested `oneOf` differently. The generator now flattens nested anonymous `oneOf` schemas into a single flat union inside `items`, which is semantically equivalent (`items` applies to every tuple position) and round-trips cleanly through openapi-generator-cli.

## [2.27.3] - 2026-04-09

### Changed

- **OpenAPI schemas are now AST-derived from `core/src/types.ts` and `core/src/BaseExchange.ts`**: Replaced the hand-maintained 350-line `SCHEMAS` literal in `scripts/generate-openapi.js` with a TypeScript compiler AST walker. Component schemas (`UnifiedMarket`, `UnifiedEvent`, `OHLCVParams`, etc.) now flow directly from the interface definitions, including JSDoc and trailing `//` comments as OpenAPI `description` fields. This removes a major source of documentation drift — adding a field to `types.ts` now lands in the generated spec without a parallel edit to the generator. Also adds `CandleInterval` type-alias resolution (so `resolution` renders as an enum, not `object`), `Date` → `format: date-time`, and `$ref` sibling-description wrapping via `allOf` for OpenAPI 3.0 compliance.

## [2.27.2] - 2026-04-09

### Fixed

- **Object params rendered as `params: string` in the generated OpenAPI spec**: `fetchOHLCV(id, params)` and `fetchTrades(id, params)` have a `[primitive, object]` signature. The GET branch of `scripts/generate-openapi.js` only expanded object props when there was a *single* object arg, so for these mixed signatures the trailing object was emitted as a bare `params` query string — which surfaced in Mintlify's API playground as two required fields (`id` and `params`) with no way to discover `resolution`, `start`, `end`, `limit`. The generator now expands any object-kind param regardless of arity, so the spec and the docs show the real field list.

## [2.27.1] - 2026-04-09

### Fixed

- **Broken 2.27.0 npm build**: `sdks/typescript/pmxt/client.ts` and `sdks/python/pmxt/client.py` imported from a `constants` module that was not committed in 2.27.0, causing `pmxtjs@2.27.0` to fail `tsc` with `TS2307: Cannot find module './constants.js'`. Python published cleanly only because CPython resolves imports at runtime, not at build time. This release commits the missing `sdks/typescript/pmxt/constants.ts` and `sdks/python/pmxt/constants.py` — self-contained modules exporting `HOSTED_URL`, `LOCAL_URL`, `ENV` names, and the `resolvePmxtBaseUrl` / `resolve_pmxt_base_url` helper that `client.ts` / `client.py` already referenced. No behaviour change beyond unbreaking the build.

## [2.27.0] - 2026-04-09

### Added

- **`GET /api/:exchange/:method` for read endpoints**: Every `fetch*` method is now exposed as an idempotent, cacheable HTTP GET in addition to the existing POST. All 15 fetches flip to GET — `fetchMarkets`, `fetchMarketsPaginated`, `fetchEvents`, `fetchMarket`, `fetchEvent`, `fetchOrderBook`, `fetchOHLCV`, `fetchTrades`, `fetchOrder`, `fetchOpenOrders`, `fetchMyTrades`, `fetchClosedOrders`, `fetchAllOrders`, `fetchPositions`, `fetchBalance`. Writes (`createOrder`/`cancelOrder`/`buildOrder`/`submitOrder`), lifecycle (`loadMarkets`/`close`), realtime (`watch*`/`unwatch*`), and in-memory helpers with non-serialisable args (`filterMarkets`/`filterEvents`/`getExecutionPrice*`) remain POST. Lets HTTP caches, CDNs, and browsers treat reads as the reads they actually are — `GET /api/polymarket/fetchMarkets?query=election&limit=3` Just Works.

  Mechanically: `scripts/generate-openapi.js` walks each method's AST parameters, classifies the verb, and emits the right OpenAPI shape (query parameters for GETs, request body for POSTs). The classifier accepts any `fetch*` signature shaped as `[primitive..., object?]`, so multi-arg reads like `fetchOHLCV(id, params)` and `fetchTrades(id, params)` are GET-eligible too — primitive args travel by name and the trailing object is spread into the remaining query slots. Alongside `openapi.yaml` the generator writes a small `method-verbs.json` sidecar; the runtime server loads it at startup to drive its GET dispatcher, translating `req.query` into the positional `args` array. `method-verbs.json` ships in the published tarball at `dist/server/method-verbs.json`.

- **Kind-aware query-string coercion**: Query values are coerced using the declared arg kind from `method-verbs.json`, not a lossy autodetect heuristic. `string` args are left alone (critical for Polymarket's all-numeric CLOB token IDs like `"559652..."`, which must stay strings so `.trim()` and downstream venue code keep working), `number` and `boolean` args parse strictly, and object-arg spreads fall back to the permissive heuristic for unknown fields. Before this fix, `GET /api/polymarket/fetchOrderBook?id=559652...` silently failed with `id.trim is not a function` because the ID was parsed as a JS number.

- **POST continues to work for every method**, including the ones now exposed as GET, so existing SDK clients that unconditionally POST keep running unchanged. The GET surface is purely additive — the server negotiates verbs per method, and clients can probe-then-fall-back.

- **TypeScript and Python SDKs transparently prefer GET for reads**: All 15 `fetch*` methods now route through a shared `sidecarReadRequest` / `_sidecar_read_request` helper that issues GET against the sidecar by default, with automatic POST fallback for (a) instances that carry per-client credentials (so API keys don't leak into query strings or access logs), (b) calls with nested-object params that can't round-trip through a query string, and (c) older sidecars that return 404/405. On a 404/405 the client flips a sticky `_getReadsUnsupported` / `_get_reads_unsupported` flag and every subsequent read on that instance goes straight to POST — one round-trip penalty on the first call, zero overhead after. Fully backward compatible in both directions: new SDKs talking to old sidecars keep working, old SDKs talking to new sidecars keep working.

### Fixed

- **Python SDK: sidecar host re-resolved on every request**: `self._api_client.configuration.host` used to be frozen at SDK construction time, but the local sidecar can pick a new port on restart (e.g. if the previous port is held by a zombie). Combined with the fresh-every-call access token read from the lock file, this produced `Unauthorized: Invalid or missing access token` errors when the sidecar cycled — the new token went to the old port, where a different sidecar was still running with a different token. The new `_resolve_sidecar_host()` helper reads the lock file on every request so host and token always move together. Pre-existing latent bug on the POST path too; now fixed for both.

## [2.26.2] - 2026-04-08

### Added

- **`openapi.yaml` now ships in the published `pmxt-core` tarball** at `dist/server/openapi.yaml`. Previously the spec was generated into `core/src/server/openapi.yaml` and consumed in-repo (by the SDK generators and the openapi drift check) but was excluded from the npm package because only `dist/`, `bin/`, and `API_REFERENCE.md` were in the `files` field. Downstream consumers of `pmxt-core` can now read the spec directly from `node_modules/pmxt-core/dist/server/openapi.yaml` — no git clone, no version-pinned GitHub raw fetch, no drift between the installed package and the spec. Enables documentation sites (Mintlify, Redocly, Stoplight) and type generators to sit on top of the installed package and stay automatically in lockstep with whichever pmxt-core version is pinned.

  Mechanically: `build` now does `tsc && cp src/server/openapi.yaml dist/server/openapi.yaml`. The existing `dist` entry in `files` means it's included in `npm publish` without touching the `files` array. Verified with `npm pack --dry-run` — `dist/server/openapi.yaml` (52 kB) is in the tarball.

## [2.26.1] - 2026-04-08

### Changed

- **`pmxt.stop_server()` / `pmxt.restart_server()` now emit `DeprecationWarning` (Python SDK)**: The flat aliases still work and still call the underlying `ServerManager`, but they now warn that `pmxt.server.stop()` / `pmxt.server.restart()` is the standard. This reverses the "no deprecation, no warnings" stance from 2.26.0 — the namespaced `pmxt.server.*` API is the single canonical surface for sidecar lifecycle management, and the flat helpers are kept only for backwards compatibility.

## [2.26.0] - 2026-04-08

### Fixed

- **`ServerManager.ensureServerRunning()` race condition (TypeScript and Python SDKs)**: Creating multiple `Exchange` instances in parallel (e.g. `const p = new Polymarket(); const k = new Kalshi(); const l = new Limitless();`) caused every request to return `401 Unauthorized`. Each `Exchange` constructed its own `ServerManager` and each one called `ensureServerRunning()` concurrently. Every call saw "no server running", every call spawned its own sidecar via `pmxt-ensure-server`, and the lock file ended up pointing at whichever spawn wrote last — but each `Exchange` had already captured its own `basePath` at construction time, so most requests hit a sidecar whose access token did NOT match the token later read from the lock file.

  Fix is process-wide coalescing inside `ServerManager`:
  - **TypeScript**: `ensureServerRunning()` now uses a static `Promise | null` cache. Concurrent callers await the same in-flight promise; the cache is cleared on settle so later calls can re-check the sidecar state.
  - **Python**: `ensure_server_running()` now holds a class-level `threading.Lock` for the entire check-and-spawn critical section. The "is the server already running?" check is re-evaluated inside the lock so threads that lose the race observe the sidecar that the winning thread just started.

### Added

- **`pmxt.server` namespace for sidecar lifecycle management** (TypeScript and Python SDKs): A single, discoverable namespace for managing the background sidecar. All six commands are available identically in both SDKs:
  - `pmxt.server.status()` — Structured snapshot: `{ running, pid, port, version, uptimeSeconds, lockFile }`. Returns a fresh object on every call (no shared mutable state).
  - `pmxt.server.health()` — Returns `true` if the sidecar responds to `/health`, `false` otherwise. Fast, no side effects.
  - `pmxt.server.start()` — Idempotently starts the sidecar. No-op if one is already running.
  - `pmxt.server.stop()` — Stops the sidecar and removes the lock file.
  - `pmxt.server.restart()` — Stop + start.
  - `pmxt.server.logs(n = 50)` — Returns the last `n` lines from `~/.pmxt/server.log`, or an empty list if the launcher never wrote a log file.

  Motivation: sidecar lifecycle is a real surface users hit regularly — stale lock files, zombie sidecars from crashed parents, version mismatches, and race conditions when multiple `Exchange` instances boot in parallel. Previously users had to reach into `ServerManager` directly or shell out to `ps` / `lsof` to diagnose. `pmxt.server.*` makes the lifecycle observable and controllable from a single entry point. Example:

  ```typescript
  import pmxt from 'pmxtjs';
  const s = await pmxt.server.status();
  if (!s.running) await pmxt.server.start();
  console.log(await pmxt.server.logs(20));
  ```

- **Sidecar writes stdout/stderr to `~/.pmxt/server.log`**: `pmxt-ensure-server` now redirects the spawned sidecar's stdio to a log file in the `~/.pmxt/` directory so `pmxt.server.logs()` has something to read. Previously stdio was dropped (`stdio: 'ignore'`) and any crash during boot left no trace.

Fully backwards compatible: the existing flat helpers `pmxt.stopServer()` / `pmxt.restartServer()` (TypeScript) and `pmxt.stop_server()` / `pmxt.restart_server()` (Python) remain first-class, fully-supported aliases for `pmxt.server.stop()` / `pmxt.server.restart()`. No deprecation, no warnings — both spellings work and will keep working.

## [2.25.3] - 2026-04-08

### Added

- **TypeScript SDK: `Opinion`, `Metaculus`, `Smarkets`, `PolymarketUS` exchange classes**: These adapters already existed in `core/src/exchanges/` and were reachable via the sidecar HTTP API, but the hand-maintained TypeScript SDK client at `sdks/typescript/pmxt/client.ts` (and the package entry point at `sdks/typescript/index.ts`) never exposed them. Anyone using `pmxtjs` would see `pmxt.Opinion === undefined` even though the core adapter had been merged. All four are now exported and work via the standard `new pmxt.Opinion({}).fetchEvents()` consumer path.
- **Python SDK: `Smarkets`, `PolymarketUS` exchange classes**: Same drift in `sdks/python/pmxt/_exchanges.py` and `sdks/python/pmxt/__init__.py`. Both are now exported.
- **`openapi.yaml` `source_exchange` enum**: Added `kalshi-demo` and `polymarket_us`, which were missing even though the sidecar routes accepted them. The generated openapi-fetch TypeScript SDK would have rejected requests targeting these exchanges at the type layer.

### Fixed

- **Hand-maintained allowlists across five layers were silently drifting**: Every layer that exchanges have to cross to reach a consumer had its own allowlist — `generate-openapi.js`, `sdks/typescript/pmxt/client.ts`, `sdks/typescript/index.ts`, `sdks/python/pmxt/_exchanges.py`, `sdks/python/pmxt/__init__.py`. Adding a new exchange to `core/src/exchanges/` required manual edits at up to five places and nothing blocked a PR that forgot them. The immediate symptom was that four exchanges (opinion, metaculus, smarkets, polymarket_us) shipped into core but never reached `pmxtjs`.

### CI

- **New `core/scripts/check-exchange-drift.js` and `.github/workflows/exchange-drift-check.yml`**: Walks `core/src/exchanges/*/index.ts` to discover every concrete `PredictionMarketExchange` subclass, then asserts that each one is exposed by the openapi enum, both TypeScript SDK files, and both Python SDK files. Exits non-zero with a per-layer table of missing entries. Runs on every PR that touches any of the covered files. This makes it structurally impossible to merge a new exchange without wiring it through every layer.

## [2.25.2] - 2026-04-07

### Fixed

- **TypeScript and Python SDKs: dropped fields in `convertMarket` / `convertEvent`**: The hand-maintained converter shims at the top of `sdks/typescript/pmxt/client.ts` and `sdks/python/pmxt/client.py` had their own allowlists and were silently dropping `slug`, `tickSize`, `status`, `contractAddress` on `UnifiedMarket` and `volume`, `volume24h` on `UnifiedEvent` even though the sidecar populates them and the generated OpenAPI client maps them. Both shims now copy the full set, and the corresponding `UnifiedMarket` / `UnifiedEvent` interfaces in `models.ts` / `models.py` declare the new fields. The 2.25.1 release fixed the sidecar end of the pipe; this release fixes the SDK consumer end.

## [2.25.1] - 2026-04-07

### Fixed

- **Polymarket: dropped market fields**: `mapMarketToUnified` now populates `slug` (from Gamma `slug`), `tickSize` (from `orderPriceMinTickSize`), `status` (from `archived` > `closed` > `active` precedence), and `contractAddress` (from `conditionId`). These were silently dropped during normalization and surfaced as `undefined` to consumers.
- **OpenAPI spec drift**: `core/scripts/generate-openapi.js` was missing several `UnifiedEvent` and `UnifiedMarket` fields that already existed in `types.ts` (`UnifiedEvent.volume`, `UnifiedEvent.volume24h`, `UnifiedMarket.slug`, `UnifiedMarket.tickSize`) plus `CreateOrderParams.tickSize` / `CreateOrderParams.negRisk`. The generated `openapi.yaml` and downstream typed SDKs (e.g. `pmxtjs`) stripped these fields at the client boundary, producing NULL columns in catalog ingest pipelines. Generator now declares the full set so they round-trip end-to-end.
- **`UnifiedMarket` type**: Added `status` and `contractAddress` to the type declaration so the new Polymarket fields are visible to TypeScript consumers.

## [2.25.0] - 2026-04-06

### Added

- **Polymarket US Exchange Integration** 🇺🇸: New adapter wrapping the official `polymarket-us` SDK for the US-regulated Polymarket gateway. Supports `fetchMarkets` / `fetchEvents` (by slug, event, or outcomeId), `fetchOrderBook`, `fetchBalance`, `fetchPositions`, `fetchMyTrades`, `fetchOpenOrders`, `fetchOrder`, `createOrder` / `buildOrder` / `submitOrder`, `cancelOrder`, and WebSocket streaming via `watchOrderBook` / `watchTrades` (backed by the SDK's `MarketsWebSocket`; credentials are required because the SDK factory mandates `keyId` + `secretKey` even for the public market socket). Handles the long-side price convention (all API prices are YES-side; short-side inputs are auto-converted via `1 - price`), normalizes outcomes to `${slug}:long` / `${slug}:short`, surfaces live prices from `marketSides[].price` (with `outcomePrices[]` fallback), lifts `orderPriceMinTickSize` onto `UnifiedMarket.tickSize`, and stashes human side labels (e.g. team names) in outcome metadata. Maintains an in-memory `orderId -> marketSlug` cache so `cancelOrder(orderId)` can supply the SDK-required body field. The normalizer reads the real gateway response shape (`question`, `endDate`, `category`, `tags`, `marketSides`) rather than the SDK's declared types. Prices serialize at 3-decimal precision (`"0.864"`) and the default tick size is `0.001`, matching observed live markets. Includes unit tests covering price conversion, normalizer, error mapping, the exchange wrapper, and the WebSocket layer, plus a live-gateway smoke script (`core/scripts/smoke-polymarket-us.ts`).

  Polymarket US is a **distinct exchange** from the international Polymarket adapter — different API, different auth, different price convention. Usage is parallel:

  ```typescript
  import { Polymarket, PolymarketUS } from 'pmxtjs';

  // International Polymarket (USDC on-chain wallet)
  const intl = new Polymarket({
    privateKey: process.env.POLYMARKET_PRIVATE_KEY!,
    funderAddress: process.env.POLYMARKET_FUNDER_ADDRESS!,
  });
  const intlMarkets = await intl.fetchMarkets({ limit: 10 });
  console.log(intlMarkets[0].yes.price);

  // Polymarket US (API key + secret, USD-denominated)
  const us = new PolymarketUS({
    keyId: process.env.POLYMARKET_US_KEY_ID!,
    secretKey: process.env.POLYMARKET_US_SECRET_KEY!,
  });
  const usMarkets = await us.fetchMarkets({ limit: 10 });
  console.log(usMarkets[0].yes.price); // populated from marketSides[].price
  ```

## [2.24.0] - 2026-04-06

### Added

- **Polymarket US Exchange Integration**: New adapter wrapping the official `polymarket-us` SDK. Supports `fetchMarkets` / `fetchEvents` (by slug, event, or outcomeId), `fetchOrderBook`, `fetchBalance`, `fetchPositions`, `fetchMyTrades`, `fetchOpenOrders`, `fetchOrder`, `createOrder` / `buildOrder` / `submitOrder`, `cancelOrder`, and WebSocket streaming via `watchOrderBook` / `watchTrades` (backed by the SDK's `MarketsWebSocket`; credentials are required because the SDK factory mandates `keyId` + `secretKey` even for the public market socket). Handles the long-side price convention (all API prices are YES-side; short-side inputs are auto-converted via `1 - price`), normalizes outcomes to `${slug}:long` / `${slug}:short`, surfaces human side labels (e.g. team names) from `marketSides[].description` in outcome metadata, and maintains an in-memory `orderId -> marketSlug` cache so `cancelOrder(orderId)` can supply the SDK-required body field. The normalizer reads the real gateway response shape (`question`, `endDate`, `category`, `tags`, `marketSides`) rather than the SDK's declared types. Includes unit tests covering price conversion, normalizer, error mapping, the exchange wrapper, and the WebSocket layer.
- **Smarkets Exchange Integration**: Full support for the Smarkets betting exchange with session-based authentication. Browse leaf events and markets via `fetchEvents` and `fetchMarkets`, query order books, place and cancel orders, and read balances. Includes correct array parameter serialization for the Smarkets API and `type_scope=single_event` filtering for leaf events. Comes with unit tests covering price conversion, auth, normalizer, and error translation.

### Fixed

- **Polymarket: Silent Zero Balance**: `fetchBalance` now catches the bundled `@polymarket/clob-client` `TypeError` thrown when `getOpenOrders` spreads an HTTP error envelope and translates it to a clear `AuthenticationError` with onboarding guidance. Also validates `getBalanceAllowance` shape so a swallowed error envelope no longer produces `NaN` and disables the on-chain fallback.
- **Polymarket: Proxy Discovery**: `auth.getClobClient` now runs `discoverProxy` whenever `signatureType` is missing (even if `funderAddress` is set), ignores the synthetic EOA fallback from failed discovery, and defaults to `gnosissafe` (2) when the funder differs from the signer EOA. Fixes silent zero balances for modern Polymarket accounts. Closes #72.
- **Polymarket: Env Configuration**: `server/app.ts` now reads `POLYMARKET_FUNDER_ADDRESS` / `POLYMARKET_PROXY_ADDRESS` and `POLYMARKET_SIGNATURE_TYPE` from the environment so SDK users can configure them without code changes.

## [2.23.0] - 2026-04-04

### Added

- **Metaculus Exchange Integration**: Full support for the Metaculus reputation-based forecasting platform. Browse questions, community predictions, and tournament structures via `fetchMarkets` and `fetchEvents`. Submit probability forecasts via `createOrder` (binary and multiple-choice questions) and withdraw them via `cancelOrder`. Group-of-questions posts are automatically expanded into individual sub-question markets. Token-based authentication via `{ apiToken: "..." }`.
- **Python SDK: Token Auth**: `Exchange` base class and `Metaculus` subclass now accept `api_token` for token-based authentication, with credential forwarding to the sidecar server.
- **Python SDK: Unit Tests**: Comprehensive unit test suite for the Python client wrapper (`test_client.py`, `conftest.py`) covering market fetching, order creation, filtering, error handling, and credential forwarding.

### Fixed

- **Probable Auth: viem Type Mismatch**: Resolved `WalletClient` type disagreement when `@prob/clob` resolves a different viem copy than the host package.

### Changed

- **TypeScript SDK**: Bumped `ts-jest` to `^29.4.9`.

## [2.22.2] - 2026-04-02

### Fixed

- **MarketOutcome Shorthand Consistency**: `fetchOrderBook`, `fetchOHLCV`, `fetchTrades`, `watchOrderBook`, and `watchTrades` now accept a `MarketOutcome` object directly (e.g. `market.yes`) in both Python and TypeScript SDKs, matching the existing behavior of `createOrder` and `buildOrder`.

## [2.22.1] - 2026-03-23

### Fixed

- **Consistent OrderBook Error Handling**: Kalshi, Limitless, and Baozi now throw `NotFound` errors for non-existing orderbooks instead of silently returning empty data. All exchanges now behave consistently with Polymarket.

## [2.22.0] - 2026-03-22

### Added

- **Opinion Exchange Integration**: Full support for Opinion prediction market -- markets, events, OHLCV, order book, positions, orders, execution price, and WebSocket streaming. Includes `fetchMyTrades`, `fetchClosedOrders`, `fetchAllOrders`, and `cancelOrder`. Does not yet support `fetchTrades` or `fetchBalance`.

## [2.21.2] - 2026-03-20

### Fixed

- **Polymarket Per-Market Images**: Multi-market events (e.g. FIFA World Cup, Presidential Nominee) now correctly use each market's own image instead of the parent event image. Image precedence is now `market.image` > `event.image` > OG fallback.

## [2.21.1] - 2026-03-19

### Added

- **Zenodo DOI Integration**: Zenodo now automatically creates a DOI for each release, enabling reliable academic citation.

## [2.21.0] - 2026-03-15

### Added

- **Typed Error Classes (Python SDK)**: 14 error classes (`BadRequest`, `AuthenticationError`, `RateLimitExceeded`, `NotFoundError`, etc.) mirroring `core/src/errors.ts`. Server error responses are automatically parsed into typed exceptions via `from_server_error()`. All catch blocks in the client now raise specific `PmxtError` subclasses instead of generic `Exception`.
- **Typed Error Classes (TypeScript SDK)**: Matching error hierarchy with `fromServerError()` factory. `handleResponse()` and all HTTP error paths now throw typed `PmxtError` subclasses. All error classes exported from the package.

### Fixed

- **Credential Logging (Security)**: Removed plaintext logging of API credentials in Polymarket auth flow.
- **Hardcoded Price Fallbacks**: Replaced `0.5` fallback prices with `0` in Kalshi, Baozi, and Myriad normalizers. Missing price data now correctly indicates "no price" instead of silently fabricating a 50-cent midpoint.

## [2.20.3] - 2026-03-15

### Fixed

- **Kalshi API v2 Compatibility**: Handle renamed trade fields (`yes_price` → `yes_price_dollars`, `count` → `count_fp`). Normalizer now parses both old (cents int) and new (dollar string) formats, fixing `NaN` prices and `undefined` amounts in `fetchTrades` / `fetchMyTrades`.

### Changed

- **Compliance Test Hardening**: `fetchOHLCV` tries multiple resolutions (`1d`, `6h`, `1h`) coarsest-first across top markets by volume instead of giving up early. `watchTrades` filters for markets traded within the last 5 minutes and applies a 10-minute recency gate before attempting WebSocket watches.
- **Broader Skip Conditions**: `isSkippableError` now handles `AuthenticationError`, `PermissionDenied`, missing credentials, and ESM import failures. Individual tests (`createOrder`, `fetchPositions`) cover additional expected rejection messages.
- **KalshiDemoExchange Excluded**: Removed from compliance test matrix (redundant, no separate demo credentials).
- **SDK Integration Tests**: Added server-availability guard so tests skip gracefully when the PMXT server is not running.

## [2.20.2] - 2026-03-14

### Fixed

- **Probable Events API**: Handle raw array response instead of expected `{ events: [] }` wrapper.
- **Test Import**: Remove vitest import from client-args test (project uses Jest).

### Changed

- **3-Layer Architecture**: Introduced fetcher/normalizer/SDK layer separation across all exchanges (Myriad, Polymarket, Kalshi, Limitless, Baozi, Probable).
- **Stale File Cleanup**: Removed superseded `fetchX.ts` files from all exchanges, rewired websocket modules to use the new fetcher layer.

## [2.20.1] - 2026-03-14

### Fixed

- **Error Mapper: SDK Error Extraction** (#56): Third-party SDK errors (e.g. `@polymarket/clob-client`) that attach HTTP metadata (`.status`, `.statusCode`, `.response`) to `Error` instances are now properly mapped to specific error classes (`InsufficientFunds`, `AuthenticationError`, `InvalidOrder`, etc.) instead of falling through to a generic `BadRequest`. The error mapper also extracts the real API error message from `.response.data` instead of using the SDK's generic `.message`.

### Changed

- **Error Mapper: Deduplicated Status Code Mapping**: Extracted shared `mapByStatusCode()` method to eliminate duplicated switch logic across axios, plain-object, and SDK error handling paths.

## [2.20.0] - 2026-03-14

### Added

- **Address Watcher & Subscriber System**: Introduced `watchAddress()` and `unwatchAddress()` methods on `BaseExchange`, along with a new subscriber infrastructure (`core/src/subscriber/`) for monitoring on-chain address activity. Supports optional address parameter for flexible subscription management.
- **GoldSky Integration**: Added GoldSky GraphQL subscription implementation (`core/src/subscriber/external/goldsky.ts`) for real-time on-chain event streaming. Integrated into the Limitless exchange for live data feeds.
- **Whale Tracker Examples**: Added Python and TypeScript example scripts (`core/examples/social/`) demonstrating how to track large-position holders using the SDK.
- **SDK: `buildOrder` / `submitOrder` Support**: Both the Python and TypeScript SDKs now expose `buildOrder()` and `submitOrder()` methods, along with the `BuiltOrder` type, enabling the two-step order workflow introduced in v2.19.0.
- **Trade `outcomeId` Field**: Added `outcomeId` (asset ID) to the `Trade` type for clearer asset-level trade identification.

### Fixed

- **Kalshi Orderbook**: Switched from the removed legacy `orderbook` field to `orderbook_fp`, fixing broken orderbook fetches on the Kalshi exchange.
- **Limitless `baseUrl` Parameter**: Fixed incorrect base URL handling in the Limitless exchange configuration.
- **Exchange Imports**: Fixed missing or incorrect `index.ts` imports across exchange modules.
- **Test Infrastructure**: Replaced vitest imports with Jest globals in price tests to match the project's test runner.
- **Whale Tracker Examples & SDK Bugs**: Fixed issues in example scripts and resolved minor SDK client bugs.
- **TypeScript SDK Merge Conflicts**: Resolved merge conflicts in the TypeScript SDK client.

### Changed

- **Polymarket WebSocket**: Enriched the Polymarket websocket implementation with improved event handling and user position tracking.
- **Limitless WebSocket & GoldSky Integration**: Refactored the Limitless exchange to integrate GoldSky watcher and subscriber, with improved websocket configuration.
- **Exchange Interfaces**: Refactored `BaseExchange` interfaces, updated type names, and standardized exchange interface implementations across Polymarket, Limitless, Myriad, and others.
- **Price Helpers**: Centralized exchange price helpers and standardized argument building across exchanges.
- **Watcher Dispatch Optimization**: Updated the watcher to dispatch events only when there is an actual change, reducing unnecessary notifications.
- **OpenAPI & API Reference**: Auto-regenerated `openapi.yaml` and `API_REFERENCE.md` to reflect all new endpoints and types.
- **SDK Models & Documentation**: Updated Python and TypeScript SDK models, API reference docs, and added client example code.

## [2.19.6] - 2026-03-06

### Added

- **TypeScript SDK Auto-Generation**: Upgraded `sdks/typescript/scripts/generate-client-methods.js` to derive return types and patterns directly from the `BaseExchange.ts` AST, mirroring the Python generator. The manual `METHOD_RETURN_CONFIG` has been eliminated, permanently removing the risk of documentation and signature drift.

### Fixed

- **CI/CD: SDK Drift Guards**: Removed the `paths` filter from `python-client-check.yml` and `typescript-client-check.yml`. These drift guards now run on *every* pull request. Previously, manual edits to `client.py` or `client.ts` would bypass the check if the PR didn't also touch `BaseExchange.ts` or the generator scripts.

## [2.19.5] - 2026-03-06

### Fixed

- **SDK: Resilient Authentication (Python & TypeScript)**: Eliminated "Unauthorized: Invalid or missing access token" errors caused by sidecar server restarts. Both the Python and TypeScript SDKs now read the access token fresh from the `~/.pmxt/server.lock` file on every request via a new `getAuthHeaders` helper. This ensures that if the server rebooted and rotated tokens, existing `Exchange` instances (like `Polymarket`) automatically pick up the new valid token on their next call, removing the need for developers to manually re-instantiate clients.
- **SDK: Generator Persistence (Python & TypeScript)**: Updated both `sdks/python/scripts/generate-client-methods.js` and `sdks/typescript/scripts/generate-client-methods.js` to emit the live header retrieval pattern, ensuring authentication resilience is maintained in all future auto-generated methods.

## [2.19.4] - 2026-03-06

### Added

- **Python SDK Auto-Generation**: Added a reflection script (`sdks/python/scripts/generate-client-methods.js`) to automatically generate Python SDK client methods directly from the TypeScript `BaseExchange.ts` AST. This completely eliminates API structure drift between the TypeScript core and the Python client, ensuring new methods and parameter changes immediately reflect in Python. Added a CI guard (`python-client-check.yml`) to enforce synchronization on all Pull Requests.

### Fixed

- **Compliance Tests: Resilient Exchange Availability Checks**: Compliance tests no longer fail when an exchange's API is temporarily unavailable (e.g., Myriad returning a Heroku 503 error page). Previously, any `ExchangeNotAvailable` or `NetworkError` exception would propagate as a test failure, making CI fragile against external service outages. A new `isSkippableError(error)` helper in `core/test/compliance/shared.ts` returns `true` for these error types (plus the existing "not implemented" and "not supported" string checks), and all 18 compliance test files now call it uniformly instead of ad-hoc string comparisons. Tests now log a skip message and return instead of failing.

- **`generate-openapi.test.ts` Spec Leak**: The OpenAPI auto-generation test temporarily injects a `testDummyMethod` into `BaseExchange.ts` and regenerates the spec to verify the generator works. However, `afterAll` only restored `BaseExchange.ts` — not `openapi.yaml` — leaving the `testDummyMethod` endpoint permanently in the committed spec and silently dropping the `close` endpoint's description. `afterAll` now also restores `openapi.yaml` to its pre-test state.

## [2.19.3] - 2026-03-04

### Fixed

- **TypeScript build failure due to missing `buildOrder` and `submitOrder` in exchange `has` objects**: When the new build-only order methods were added to the `ExchangeHas` interface, several exchange implementations were not updated to include these properties. Added `buildOrder: false` and `submitOrder: false` to BaoziExchange, LimitlessExchange, MyriadExchange, and ProbableExchange to match the interface requirements.

## [2.19.1] - 2026-03-04

### Fixed

- **OpenAPI Schema for `BuiltOrder`**: The `buildOrder` and `submitOrder` endpoints referenced the `BuiltOrder` type in the OpenAPI spec but the schema definition was missing from the components section, causing SDK code generation to fail. The `BuiltOrder` schema is now properly defined in the OpenAPI generator.

## [2.19.0] - 2026-03-04

### Added

- **Build-Only Order Mode**: Introduced `buildOrder()` and `submitOrder()` methods enabling a two-step order workflow. This allows integrators (e.g., Smart Order Routers) to build exchange-native order payloads, inspect or forward them through middleware, then submit them later without reconstructing parameters.
  - **New Type**: `BuiltOrder` interface containing the exchange name, original params, and exchange-native payload (with optional `signedOrder` for CLOB exchanges and reserved `tx` field for future on-chain exchanges).
  - **New Methods**: `buildOrder(params)` constructs the order without submitting; `submitOrder(built)` submits a pre-built order.
  - **Capability Flags**: Both methods exposed in `exchange.has` (e.g., `exchange.has.buildOrder`, `exchange.has.submitOrder`).
  - **Polymarket Support**: `buildOrder` uses the CLOB client's `createOrder()` method to sign the order; `submitOrder` uses `postOrder()` to submit the signed payload. Refactored `createOrder` to delegate to both for backwards compatibility.
  - **Kalshi Support**: `buildOrder` constructs the request body without making an HTTP call; `submitOrder` POSTs the pre-built body to the CreateOrder endpoint. Refactored `createOrder` to maintain compatibility.
  - **Limitless**: Not yet supported (`buildOrder: false`), as the SDK lacks a distinct build-without-submit pattern.

### Changed

- **OpenAPI Auto-generation**: Updated the OpenAPI generator to recognize the new `BuiltOrder` type and auto-generate corresponding REST endpoints for `buildOrder` and `submitOrder`.

## [2.18.1] - 2026-02-28

### Fixed

- **Kalshi `UnifiedEvent.description` always empty**: Kalshi's `mututals_description` field is always `null` in their API responses, so `UnifiedEvent.description` was an empty string for every event. The Kalshi adapter now derives a description from the markets' `rules_primary` text by extracting the longest common prefix and suffix across all child markets and substituting the variable region with `{x}`. For example, a 34-market event produces `"If {x} announces a presidential campaign to contest the presidential nomination of the Democratic party for the 2028 U.S. presidential election, then the market resolves to Yes."` Single-market events return the `rules_primary` text as-is. Events where no meaningful template can be extracted (shared fixed text < 20 chars, or all markets identical) fall back to the first market's `rules_primary`.

## [2.18.0] - 2026-02-27

  ### Fixed
  - `UnifiedEvent` now includes `volume24h` and `volume` fields, summed from child markets at
    normalization time. Previously these fields were absent despite being the natural aggregate
    of each market's volume. Sort-by-volume on event listings now works without manual aggregation
    by the caller.

  ### Changed
  - `UnifiedEvent.volume24h: number` is now a required field (mirrors `UnifiedMarket.volume24h`).
  - `UnifiedEvent.volume?: number` is now an optional field (mirrors `UnifiedMarket.volume`);
    only populated when at least one child market exposes lifetime volume.

## [2.17.9] - 2026-02-25

### Fixed

- **TypeScript SDK: Server startup race condition causes 401 Unauthorized**: After a version mismatch was detected, the `ServerManager` would kill the old server and delete the lock file, then call `waitForServer()`. Because the lock file was gone, `getRunningPort()` fell back to the default port 3847. If any other process (e.g. an unrelated local server) was already responding on that port, `waitForServer()` would return immediately with no lock file present, causing `getAccessToken()` to return `undefined` and all subsequent API requests to be sent without an auth token. Fixed by rewriting `waitForServer()` to read the lock file directly on each poll iteration and only return when a lock file is present *and* the server at that file's port passes a health check. This prevents falsely matching an unrelated server on the default port.

## [2.17.8] - 2026-02-25

### Fixed

- **Python SDK `fetch_ohlcv` deserialization error**: Calling `fetch_ohlcv()` raised `ValueError: Multiple matches found when deserializing... with oneOf schemas: HistoryFilterParams, OHLCVParams` because the OpenAPI spec emitted `oneOf: [OHLCVParams, HistoryFilterParams]` for the `params` argument. Since both schemas are structurally identical in JSON (same four fields, differing only in `resolution` being optional vs. required), pydantic matched both branches and raised an exception. Fixed by removing the deprecated `HistoryFilterParams` union from `fetchOHLCV` in `BaseExchange.ts` and all exchange implementations, then regenerating the OpenAPI spec. The spec now emits only `OHLCVParams` for this parameter. `fetchTrades` is unaffected as its `HistoryFilterParams | TradesParams` union has no structural ambiguity.

## [2.17.7] - 2026-02-25

### Fixed

- **Python SDK Missing Exchange Classes**: `pmxt.Probable`, `pmxt.Baozi`, and `pmxt.Myriad` raised `AttributeError` on import because the Python SDK's exchange subclasses were maintained manually and had drifted from the TypeScript core. All three classes are now available.

### Infrastructure

- **Auto-generated Python SDK exchange classes**: `sdks/python/pmxt/_exchanges.py` is now generated from `core/src/server/app.ts` (the single source of truth for registered exchanges) via `core/scripts/generate-python-exchanges.js`. The generator also keeps `__init__.py` imports and `__all__` in sync. A CI guard (`python-exchanges-check.yml`) fails any PR where the generated file diverges from the committed one.
- **Auto-generated `COMPLIANCE.md`**: The feature support matrix is now generated from exchange implementations via `core/scripts/generate-compliance.js`, replacing the previously manual document. A CI guard (`compliance-check.yml`) keeps it in sync with `core/src/exchanges/*/index.ts`.
- **TypeScript SDK client methods CI guard**: Added `typescript-client-check.yml` to fail PRs where `BaseExchange.ts` changes without regenerating the corresponding methods in the TypeScript SDK `client.ts`.
- All three generators are wired into `generate:sdk:all` and run automatically on every publish.

## [2.17.6] - 2026-02-24

### Fixed

- **Duplicate `eventId` in `UnifiedMarket` causes build failure**: The v2.17.5 fix added `eventId?: string` to `core/src/types.ts` but the field already existed at line 34, resulting in `TS2300: Duplicate identifier 'eventId'` and a broken build. The duplicate declaration is removed.

## [2.17.5] - 2026-02-24

### Fixed

- **`UnifiedMarket.event` circular type corrected to `eventId`**: The `event?: UnifiedEvent` field on `UnifiedMarket` (in both `core/src/types.ts` and the TypeScript SDK `models.ts`) was a design error — storing a full back-reference to the parent event creates a circular structure that breaks `JSON.stringify`. The field is now typed as `eventId?: string`, consistent with how every exchange util already populated it. The TypeScript SDK's `convertMarket` function now also passes `eventId` through from the server response.

## [2.17.4] - 2026-02-24

### Fixed

- **Polymarket Cloudflare WAF Bypass**: The User-Agent header added in v2.17.2 was insufficient to bypass Polymarket's Cloudflare bot detection. Enhanced the Polymarket client with browser-mimicking headers (`Accept`, `Accept-Language`, `Origin: https://polymarket.com`, `Referer`, and `sec-fetch-*` directives). These headers make requests appear as same-site CORS calls from the Polymarket frontend, allowing the API to pass Cloudflare's bot scoring model. `fetchEvents()` now works reliably on all platforms.

## [2.17.3] - 2026-02-24

### Fixed

- **Fatal Circular JSON Crash (`fetchEvents`)**: Fixed a `TypeError: Converting circular structure to JSON` that fatally crashed the sidecar server on every `fetchEvents` call across all exchanges. The v2.17.2 patch injected `market.event = event` inside the core exchange functions, creating an `event → markets[0] → event` reference cycle. Since Express serializes sidecar responses via `JSON.stringify`, this caused an unrecoverable crash propagated to all SDK clients. The `market.event` back-references are now hydrated exclusively client-side inside `convertEvent` in the TypeScript SDK, keeping all sidecar REST payloads strictly acyclic.

## [2.17.2] - 2026-02-24

### Fixed

- **Bi-directional Navigation (`market.event`)**: Added `market.event` back-reference hydration to the TypeScript SDK's `convertEvent` function, enabling navigation from any market to its parent event. Note: this release accidentally also injected the circular reference server-side, causing a fatal JSON serialization crash fixed in v2.17.3.
- **Global User-Agent Header**: Added a default generic `User-Agent` header (`pmxt (https://github.com/pmxt-dev/pmxt)`) to the `BaseExchange` axios configuration. This ensures consistent identification across all exchanges and resolves the **Polymarket Discovery 401 Error** that occurred when calling `fetchEvents()` without parameters, effectively bypassing WAF/CDN restrictions.

## [2.17.1] - 2026-02-24

### Fixed

- **Sidecar Bundle Drift**: The features shipped in 2.17.0 (parameterless `fetchEvents()`, Kalshi client-side sorting) were correctly implemented in TypeScript source but **never reached users** because the publish pipeline was missing the `bundle:server` step for the npm job. The distributed `pmxt-core` package contained a stale pre-compiled sidecar (`bundled.js`) from a previous release that still enforced the old guard `fetchEvents() requires a query, eventId, or slug parameter`. This patch rebuilds and ships the correct bundle.
- **CI/CD: Publish Workflow**: Added `npm run bundle:server` to the `publish-npm` job in `publish.yml`, immediately after the `Build Core` step. Without this, source-level changes to the sidecar server are silently ignored in all npm-distributed packages.
- **CI/CD: Test Workflow**: Applied the same fix to `test-publish.yml` so dry-run publishes and test runs also exercise the correct sidecar, preventing this class of drift from going undetected in future PRs.

## [2.17.0] - 2026-02-24

### Improved

- **Unified Discovery: Unrestricted Event Fetching**: Removed the mandatory requirement for a query, event identification, or slug in `fetchEvents`. Users can now call `fetchEvents()` without parameters to retrieve the "front page" of an exchange (typically top events by volume).
- **Polymarket: High-Performance Discovery**: Redirects no-query `fetchEvents` calls to the specific Gamma `/events` list endpoint, providing a cleaner and faster experience than the fuzzy search path.
- **Kalshi: Client-Side Event Ranking**: Implemented robust client-side sorting for Kalshi events. Since the Kalshi API lacks server-side sorting for the event list, `fetchEvents` now aggregates volume, liquidity, and recency from nested markets to provide consistent `sort` support (`volume`, `liquidity`, `newest`).
- **Limitless: Semantic Event Mapping**: Mapped Limitless "Group Markets" to the unified `fetchEvents` interface. Discovery calls now automatically filter for group markets, aligning Limitless with event-centric discovery patterns.
- **Developer Experience**: Synchronized `fetchEvents` behavior with `fetchMarkets` across all exchanges (Baozi, Myriad, Probable, Kalshi, Polymarket, Limitless).

### Fixed

- **Unit Tests**: Updated core validation suite to reflect the relaxed requirements for event fetching.

## [2.16.1] - 2026-02-24

### Fixed

- **Documentation: Automated Generator**: Fixed a bug in `generate-openapi.js` where certain model fields (like `eventId` and `sort`) were not being correctly reflected in the generated SDK documentation.
- **SDK: Regenerated Reference Docs**: Synchronized `API_REFERENCE.md` for both Python and TypeScript to include the newly added traversal and sorting capabilities.

## [2.16.0] - 2026-02-24

### Added

- **Unified Traversal: Market-to-Event Linkage**: Added `eventId` to the `UnifiedMarket` interface across all exchanges. This allows direct navigation from a market back to its parent event container.
- **Unified Traversal: Outcome-to-Market Linkage**: Ensured `marketId` is consistently populated on all `MarketOutcome` objects.
- **Event Search: Unified Sorting**: Added `sort` parameter support to `fetchEvents` for better developer experience and consistency with `fetchMarkets`.

### Improved

- **Polymarket: Direct Event Lookup**: Enhanced `fetchEvents` for Polymarket to support direct `eventId` and `slug` lookups, removing the previous requirement for a keyword search query when the ID is already known.
- **Cross-Exchange Consistency**: Synchronized `fetchEvents` and `fetchMarkets` behavior across Polymarket, Kalshi, Limitless, Myriad, and Probable.

## [2.15.0] - 2026-02-24

### Added

- **TypeScript SDK: Automated Client Method Generation**: Introduced `sdks/typescript/scripts/generate-client-methods.js`, a script that introspects `BaseExchange.ts` via the TypeScript AST and auto-generates typed client method stubs in `client.ts`. This ensures the TypeScript SDK stays in sync with core method additions without manual updates.
- **TypeScript SDK: SDK Surface Area Tests**: Added `sdks/typescript/tests/surface.test.ts` with 175 tests (25 public methods × 7 exchange classes). These tests verify that every method defined in `BaseExchange` is correctly exposed on all exchange clients (Polymarket, Kalshi, KalshiDemo, Limitless, Myriad, Probable, Baozi). No server required — prototype checks only.

### Fixed

- **TypeScript SDK: Integration Test Reliability**: Refactored `sdks/typescript/tests/integration.test.ts` to use a shared `beforeAll` per describe block (avoiding redundant API calls per test), pass `{ limit: 5 }` to both Polymarket and Kalshi `fetchMarkets` to prevent full-catalog fetches, and set a 120s `beforeAll` timeout to handle Polymarket Gamma API response variance (which can exceed 30s under load). All 6 integration tests now pass reliably.

## [2.14.1] - 2026-02-23

### Fixed

- **Sidecar Server Build**: Resolved a critical TypeScript compilation error in `app.ts` caused by an invalid Express error handler signature. This fix ensures the unified sidecar server can be successfully bundled and published.

## [2.14.0] - 2026-02-23

### Added

- **Kalshi Demo Support**: Introduced full support for the Kalshi Demo (simulated) environment across both TypeScript and Python SDKs.
  - **TypeScript**: New `KalshiDemoExchange` class for direct access to the demo environment.
  - **Python**: Updated `Kalshi` class with a `demo=True` parameter for easy environment switching.
  - **Unified Configuration**: Centralized API and WebSocket URL management to ensure consistency between production and demo environments.
- **Dome API Migration**: Added a dedicated migration guide and landing page for users transitioning from the shut-down Dome API.
- **Kalshi Setup Documentation**: Included a comprehensive setup guide in the core documentation for Kalshi integration.

### Fixed

- **Kalshi Demo Connectivity**: Corrected internal API and WebSocket endpoints for the Kalshi Demo environment to ensure reliable connectivity.
- **Core Stability**: Resolved merge conflicts and performed general code cleanup in the sidecar server.

### Documentation

- **Project Metadata**: Updated download statistics and project badges.

## [2.13.2] - 2026-02-22

### Fixed

- **TypeScript SDK Build**: Resolved type shadowing issues in the auto-generated SDK by ensuring all request body schemas in the OpenAPI specification carry a distinct `title` property.
- **Client Implementation**: Corrected calling conventions and type references in `client.ts` for `fetchBalance`, `cancelOrder`, and `fetchOrder` to align with the latest generated types.

## [2.13.1] - 2026-02-22

### Fixed

- **TypeScript SDK Build**: Resolved critical compilation errors introduced by OpenAPI spec auto-generation (v2.13.0).
  - Added missing `title` fields to inline request schemas in `openapi.yaml` (cancelOrder, fetchOrder endpoints) so the OpenAPI generator creates proper named types.
  - Fixed incorrect type references in `client.ts` `fetchOrder` method (was using `CancelOrderRequest` instead of `FetchOrderRequest`).
  - Enhanced `fix-generated.js` post-processing script to properly handle union type discriminators and TypeScript type narrowing issues in generated code.
  - Fixed type narrowing failures in `FilterEventsRequestArgsInner` and `FilterMarketsRequestArgsInner` by adding explicit type casts in `.every()` and `.map()` calls.

## [2.13.0] - 2026-02-22

### Added

- **Unified Sidecar API Expansion**: Formally exposed `fetchMyTrades`, `fetchClosedOrders`, and `fetchAllOrders` in the sidecar server and generated SDKs, completing the functional rollout of the Order History API.
- **New Public Methods**: Introduced `loadMarkets()` and `fetchMarketsPaginated()` to the public SDKs for stateful market caching and stable pagination support.
- **OpenAPI Auto-Generation**: Implemented a reflection-based specification generator (`core/scripts/generate-openapi.js`) that automatically derives the sidecar API from the `BaseExchange` TypeScript definition.
- **CI Synchronization Check**: Added a GitHub Action workflow to ensure the OpenAPI spec and SDKs stay perfectly in sync with the core library on every contribution.

### Changed

- **SDK Feature Parity**: Regenerated both Python and TypeScript SDKs to include the latest unified methods and data models (e.g., `UserTrade`, `PaginatedMarketsResult`).

### Documentation

- **Contributor Workflow**: Updated `CONTRIBUTING.md` with instructions on using the new automated OpenAPI generation pipeline.


## [2.12.1] - 2026-02-22

### Fixed

- **Security**: Bound the sidecar server to `127.0.0.1` by default to prevent accidental exposure on all network interfaces (`0.0.0.0`).

## [2.12.0] - 2026-02-22

### Added

- **Unified Order History API**: Standardized methods across all exchanges for retrieving private trade and order history.
  - New methods: `fetchMyTrades()`, `fetchClosedOrders()`, and `fetchAllOrders()`.
  - Introduced `UserTrade` type which includes `orderId` for linking trades to specific orders.
- **Exchange Support**:
  - Implemented `fetchMyTrades` for **Polymarket**, **Limitless**, **Myriad**, and **Probable**.
  - Implemented `fetchClosedOrders` and `fetchAllOrders` for **Kalshi**, **Polymarket**, **Limitless**, **Probable**, and **Myriad**.
- **Compliance Testing**: Added comprehensive test suites for validating order and trade history implementations across all exchanges.

### Changed

- **Testing Utilities**: Added `validateUserTrade` to compliance test suite for standardized trade verification.

## [2.12.0] - 2026-02-22

### Added

- **Unified Order History API**: Standardized methods across all exchanges for retrieving private trade and order history.
  - New methods: `fetchMyTrades()`, `fetchClosedOrders()`, and `fetchAllOrders()`.
  - Introduced `UserTrade` type which includes `orderId` for linking trades to specific orders.
- **Exchange Support**:
  - Implemented `fetchMyTrades` for **Polymarket**, **Limitless**, **Myriad**, and **Probable**.
  - Implemented `fetchClosedOrders` and `fetchAllOrders` for **Kalshi**, **Polymarket**, **Limitless**, **Probable**, and **Myriad**.
- **Compliance Testing**: Added comprehensive test suites for validating order and trade history implementations across all exchanges.

### Changed

- **Testing Utilities**: Added `validateUserTrade` to compliance test suite for standardized trade verification.

## [2.11.0] - 2026-02-22

### Added

- **CCXT-Style Rate Limiting**: Implemented automatic rate limiting across all exchanges using a token bucket (leaky bucket) algorithm, preventing 429 errors and request throttling.
  - **Unified Throttling**: All REST requests (both explicit and via `callApi`) automatically respect exchange rate limits through a single axios request interceptor on `this.http`.
  - **Per-Exchange Configuration**: Each exchange sets its own rate limit (e.g., Polymarket: 200ms, Kalshi: 100ms, Myriad/Baozi/Probable: 500ms).
  - **User Control**: Developers can override rate limits per-instance (`exchange.rateLimit = 50`) or disable entirely (`exchange.enableRateLimit = false`).
  - **Leaky Bucket Implementation**: Queue-based token refill with no busy spinning, maintaining simplicity while ensuring fair request spacing.
- **Throttler Utility**: New `Throttler` class in `core/src/utils/throttler.ts` providing a standalone, exchange-agnostic token bucket implementation for queue-based async throttling.

### Changed

- **BaseExchange**: Added `rateLimit` property (default 1000ms) and `enableRateLimit` property (default true) to match CCXT conventions.

## [2.10.0] - 2026-02-19

### Added

- **Low-Level API Access (`callApi` / `call_api`)**: Exposed a new method on all exchange instances that allows direct invocation of any exchange-specific REST endpoint by its OpenAPI `operationId`. This gives advanced users full access to every underlying API endpoint (Polymarket CLOB/Gamma/Data, Kalshi, Limitless, Probable, Myriad) without leaving the unified SDK interface.
  - TypeScript: `await exchange.callApi('operationName', { param: 'value' })`
  - Python: `exchange.call_api('operation_name', {'param': 'value'})`
- **Low-Level API Reference Documentation**: Both Python and TypeScript API reference docs now include a comprehensive "Low-Level API Reference" section listing every available endpoint per exchange, with method, path, parameters, and auth requirements.

### Documentation

- **API Reference Templates**: Updated Handlebars templates and the doc generation pipeline to render per-exchange endpoint tables and detailed parameter listings from OpenAPI specs.

## [2.9.2] - 2026-02-19

### Documentation

- **Pagination Stability Guidance**: Clarified that repeated `fetchMarkets()` calls with different `offset` values do not guarantee stable ordering. Added guidance and examples on using `loadMarkets()` as the correct approach for stable iteration over the entire market catalog. (Closes #41)
- **Automatic Statistics**: Updated specific total download badges and metadata.

## [2.9.1] - 2026-02-18

### Documentation

- **Internal Links in API Reference**: Return types and complex parameters in the Python and TypeScript API reference documentation are now linkified. Clicking on a data model (e.g., `Order`, `UnifiedMarket`) now jumps directly to its detailed field definition at the bottom of the page.

## [2.9.0] - 2026-02-18

### Fixed

- **TypeScript SDK (Windows)**: Fixed a crash when spawning `pmxt-ensure-server` on Windows where the `.js` launcher must be invoked via `node` explicitly. The SDK now detects the platform and spawns `node <path>` when the resolved launcher ends in `.js`. (Closes #29)

### Added

- **Implicit API Generation**: Implemented automatic HTTP method generation from OpenAPI specifications in `BaseExchange`. Exchange classes can now register an OpenAPI spec and have typed HTTP methods created dynamically, significantly reducing boilerplate when adding new exchanges or API endpoints.
  - Added `ApiDescriptor` interface and `parseOpenApiSpec` utility.
  - Added `initAuth()` method for credential initialization and HMAC-SHA256 signing for Polymarket L2 API authentication.
  - API credentials are cached for synchronous signing operations.
  - Full implicit API support added to `PolymarketExchange` for all three services (CLOB, Gamma, Data APIs).

### Changed

- **Centralized Request Handling (`callApi`)**: Refactored all major exchange implementations (Kalshi, Polymarket, Limitless, Probable, Myriad) to route API calls through a unified `callApi` method on `BaseExchange`. This ensures consistent error mapping, logging, and interceptor behavior across all exchanges.
- **Consolidated Exchange Methods**: Moved standalone per-feature files (`fetchPositions.ts`, `fetchOrderBook.ts`, `fetchTrades.ts`, `fetchOHLCV.ts`) into their respective exchange class files. Deleted the now-redundant standalone files.
- **Centralized OpenAPI Specs**: Migrated API specifications from the root directory into structured `core/specs/` subdirectories (kalshi, limitless, myriad, polymarket, probable). The `fetch-openapi-specs` script now supports both remote URL fetching and local file reading.
- **Myriad**: Inlined `fetchTrades` logic directly into WebSocket polling and migrated to `callApi`. Fixed outcomeId parsing for composite IDs.
- **OpenAPI Utility**: Operations without explicit security definitions now correctly inherit top-level security settings.

### Documentation

- **SubParams in API Reference**: Sub-parameters for methods like `fetchMarkets` and `fetchEvents` (e.g., `query`, `slug`, `limit`, `offset`, `sort`, `searchIn`) are now rendered as nested bullet points directly under the method in both Python and TypeScript API reference docs.
- **Implicit API Pattern**: Added detailed documentation of the Implicit API pattern to `ARCHITECTURE.md`.
- **Exchange Integration Guide**: Refactored `core/ADDING_AN_EXCHANGE.md` to reflect the new `callApi`-based implementation approach.

## [2.8.0] - 2026-02-17

### Added

- **CCXT-Style Market Caching (`loadMarkets`)**: Implemented stateful market caching in `BaseExchange` to improve performance and enable synchronous-like metadata lookups.
  - New `loadMarkets(reload: boolean)` method fetches and caches all market definitions (by ID and slug).
  - Updated `fetchMarket` to check the local cache first, enabling 0ms lookups for frequently accessed markets.
  - Added `slug` property to `UnifiedMarket` for consistent multi-identifier caching.
- **Testing Infrastructure**: Added comprehensive unit tests and a cross-exchange manual verification script for the market caching system.

### Changed

- **Increased Default Market Limits**: Raised the default `fetchMarkets` limit from 10,000 to **250,000** results across Polymarket, Kalshi, and Limitless.

## [2.7.0] - 2026-02-17

### Changed

- **Centralized HTTP Architecture**: Refactored all major exchange clients (Polymarket, Kalshi, Limitless, Probable, Myriad) to route API requests through a shared `this.http` instance in `BaseExchange`.
- **Enhanced Verbose Logging**: The `exchange.verbose = true` flag now provides consistent, detailed logging for *all* HTTP requests and responses, including parameters, status codes, and error bodies across all exchanges.
- **Improved Internal Reliability**: 
  - Standardized error mapping and request interceptors across the library.
  - Fixed syntax errors and prop-drilling issues in Myriad and Probable exchange implementations.
  - Updated Kalshi unit tests to support robust `axios.create` mocking patterns.

## [2.6.0] - 2026-02-17

### Added

- **CCXT-Style Capability Map (`exchange.has`)**: Introduced a unified capability mapping system across all exchanges. This allows developers to programmatically check which features (e.g., `fetchOHLCV`, `watchOrderBook`, `createOrder`) are supported or emulated by a specific exchange.
  - Added the `.has` property to `BaseExchange` and all exchange implementations (Polymarket, Kalshi, Limitless, Probable, Myriad, Baozi).
  - New `/api/:exchange/has` endpoint in the sidecar server for remote capability discovery.
  - Python SDK updated to expose these capabilities on exchange instances.

### Changed

- **Repository & SDK Optimization**: Significantly reduced repository size and improved developer workflow by untracking generated server bundles in the Python SDK. These are now excluded from version control and managed during the build/dist process.
- **Improved Workspace Cleanliness**: Updated `.gitignore` and `.gitattributes` to ensure temporary files, generated SDK code, and build artifacts stay out of the repository.

### Fixed

- **Baozi**: Refined internal documentation regarding pari-mutuel odds calculation status.
- **Documentation**: Updated project statistics and download badges to reflect latest growth.

## [2.5.0] - 2026-02-16

### Added

- **Baozi Exchange Integration**: New exchange adapter for [baozi.bet](https://baozi.bet), a decentralized pari-mutuel prediction market on Solana. NOTE: Not fully working.
  - **Market Data**: `fetchMarkets`, `fetchEvents`, `fetchOrderBook` (synthetic from pool ratios).
  - **Trading**: `createOrder` via on-chain Solana instructions (`place_bet_sol` / `bet_on_race_outcome_sol`).
  - **Account Management**: `fetchBalance` (SOL), `fetchPositions` (PDA-based position lookup).
  - **Real-time Data**: `watchOrderBook` via Solana `onAccountChange` subscriptions.
  - Note: No `fetchOHLCV`, `fetchTrades`, or `cancelOrder` (pari-mutuel bets are irrevocable).

- **Myriad Markets Integration**: Full support for Myriad Markets, an AMM-based prediction market platform.
  - **Market Data**: `fetchMarkets`, `fetchEvents`, `fetchOHLCV`, `fetchOrderBook` (synthetic from AMM), `fetchTrades`.
  - **Trading**: `createOrder` (returns quote + calldata for on-chain execution), `fetchPositions`, `fetchBalance`.
  - **Real-time Data**: Poll-based `watchOrderBook` and `watchTrades`.
  - **Multi-chain Support**: Abstract (2741), Linea (59144), BNB (56) with composite IDs (`{networkId}:{marketId}:{outcomeId}`).
  - Key difference from CLOB exchanges: AMM-based, no limit orders or open order cancellation.

- **`fetchMarket` / `fetchEvent` Singular Lookup Methods**: Convenience methods for fetching a single market or event by ID, slug, or ticker. Throws `MarketNotFound` / `EventNotFound` if not found.
  - Extended `MarketFilterParams` with `marketId`, `outcomeId`, `eventId` for direct lookups.
  - Extended `EventFetchParams` with `eventId`, `slug` for direct lookups.
  - Exchange-specific implementations for Kalshi, Probable, and Limitless.

- **Improved Market Search**: Deduplication logic and exact-match fetching in parallel for Kalshi, Limitless, and Polymarket. Queries resembling tickers or slugs now prioritize exact matches.

### Fixed

- **Baozi**: Improved robustness of order parsing and position data.
- **Probable**: Added fallback lookup logic for slug search in `fetchMarkets`.

### Changed

- **Windows Compatibility**: Cross-platform process checking in LockFile and Python SDK.
- **Compliance Tests**: Enhanced with authentication support for Myriad and Baozi; refactored to use `initExchange` helper.
- **Generated SDK Code**: Now gitignored instead of committed.

## [2.4.0] - 2026-02-15

### Added

- **Probable Exchange Integration**: Initial release of the Probable exchange integration, bringing full support for the Probable prediction market platform.
  - **Market & Event Discovery**: Implemented `fetchMarkets` and `fetchEvents` for comprehensive market discovery.
  - **Trading**: Full trading support including `createOrder`, `cancelOrder`, `fetchOrder`, and `fetchOpenOrders`.
  - **Market Data**: Access to `fetchOrderBook`, `fetchTrades`, and `fetchOHLCV` for historical and real-time market analysis.
  - **Account Management**: Implemented `fetchBalance` and `fetchPositions` to track portfolio performance.
  - **Real-time Data**: Added WebSocket support for live order book updates via `watchOrderBook`. (Note: `watchTrades` is not yet supported).
  - **Examples**: Added comprehensive examples in `core/examples/api-reference` covering all major functionality.


## [2.3.0] - 2026-02-14

### Features

- **Outcome Shorthand for Trading**: You can now pass a `MarketOutcome` object directly to `createOrder` (TS) or `create_order` (Python) instead of manually specifying `marketId` and `outcomeId`.
- **`marketId` in `MarketOutcome`**: Market outcome objects now include the `marketId` they belong to, enabling the new shorthand functionality and better data traceability.

### Changed

- **Improved Type Safety**: Enhanced input validation for order creation to ensure consistent behavior across different parameter combinations.
- **Documentation & Examples**: Updated trading examples to demonstrate the new recommended shorthand pattern.

## [2.2.0] - 2026-02-14

### Features

- **MarketList Convenience Class**: Introduced a new `MarketList` class to simplify market discovery and filtering. This provides a more ergonomic way to search and interact with collections of markets across different exchanges.
- **Developer Experience**: Added `npm run dev` command to support streamlined local development with automatic rebuilding and sidecar management.

### Documentation

- **Architecture Overview**: Added a comprehensive `ARCHITECTURE.md` guide explaining the project's internal structure and core principles.
- **Exchange Contribution Guide**: Created `core/ADDING_AN_EXCHANGE.md` to provide clear instructions for developers looking to integrate new prediction markets.
- **Improved Onboarding**: Updated `CONTRIBUTING.md` with detailed monorepo structure and prerequisites. Added `.env.example` to simplify local environment setup.
- **Node.js Environment**: Explicitly defined supported Node.js versions in `package.json` to ensure development environment consistency.


## [2.1.3] - 2026-02-14

### Features

- **Polymarket Performance Optimization**:
  - Implemented `preWarmMarket` in the `PolymarketExchange` class. This allows for caching market metadata (such as `tokenAddress` and `negRisk` status) before placing orders, significantly reducing latency during critical execution moments.
  - Streamlined the `createOrder` workflow by removing redundant `inferTickSize` logic and delegating default handling to the Polymarket SDK.
- **API Enhancements**: Added support for the `negRisk` parameter in `CreateOrderParams`, enabling more granular control over order types on Polymarket. <-- not in openapi schema yet
- **Developer Experience**: Added a new benchmarking script `core/scripts/test-order-speed.ts` for measuring end-to-end order placement latency.

## [2.1.2] - 2026-02-13

### Fixed

- **Kalshi Pagination**: Implemented recursive pagination for Kalshi search, enabling the retrieval of up to 10,000 results per query (previously hard-limited to 200).
- **Kalshi 'All' Status**: Enhanced the `'all'` status filter to simultaneously fetch from `open`, `closed`, and `settled` endpoints, providing a truly comprehensive view of Kalshi events.
- **Polymarket Status Verification**: Added strict client-side status verification for Polymarket search to prevent "active" events from leaking into "closed" queries, ensuring high search precision.
- **Limitless Status Filtering**: Standardized status filtering for Limitless to correctly distinguish between active, expired, and resolved markets within search results.

### Changed

- **Unified Status Terminology**: Introduced `'inactive'` as a universal alias for `'closed'` across all exchange methods to provide a more intuitive API for non-binary market states.
- **Improved Documentation**: Enriched JSDoc metadata for `fetchMarkets` and `fetchEvents` with exchange-specific implementation details and usage examples.


## [2.1.1] - 2026-02-13

### Changed

- **Increased Default Limits**: The default limit for fetching markets and events has been increased to **10,000** results across all exchanges (Polymarket, Kalshi, Limitless) to provide more comprehensive search results by default.
- **Polymarket Search Optimization**: Migrated `fetchEvents` search to use the high-performance Gamma `public-search` endpoint with parallel pagination, significantly improving discovery for high-volume markets.
- **OpenAPI Specification**: Updated `openapi.yaml` to reflect the new default limit of 10,000 for market and event queries.

### Added

- **CI/CD Automation**: Integrated automated GitHub release creation and unified publishing logic in `publish.yml`.
- **Search Verification Tooling**: Added `core/verify_search.ts` script for easy testing and verification of search performance and accuracy.
- **Improved Metadata**: Updated `readme.md` with cross-linked documentation and refreshed project statistics.

### Fixed

- **Workflow Reliability**: Resolved YAML syntax errors in GitHub Actions and removed redundant scripts to streamline the deployment process.

## [2.1.0] - 2026-02-13

### Added

- **Status Filtering**: Introduced a unified `status` parameter (`active`, `closed`, `all`) for both `fetchMarkets` and `fetchEvents`. This allows querying resolved/archived markets in addition to active ones. (Closes #33)
  - **Polymarket**: Full support for active/closed filtering via Gamma API integration.
  - **Kalshi**: Implemented status-aware fetching with cache-isolation to prevent data pollution.
  - **Limitless**: Added compliance handling that returns empty results for closed markets (unsupported by the provider).
- **OpenAPI Specification**: Updated `MarketFilterParams` and `EventFetchParams` schemas to include the new `status` property.
- **Compliance Tests**: New test suite in `core/test/status-filtering.test.ts` ensuring correct parameter mapping and exchange-safe behavior.

## [2.0.11] - 2026-02-10

### Fixed

- **Limitless Pagination**: Implemented automatic pagination for limits greater than 25 markets. The Limitless API has a hard limit of 25 items per request, so this update introduces internal pagination that transparently handles any limit value. Over-fetches by 70% to account for ~33% of markets being filtered out due to missing tokens, then applies limit after filtering to ensure users get the exact requested number of valid markets. (Fixes #34)

## [2.0.10] - 2026-02-10

### Fixed

- **Polymarket WebSocket License**: Updated `@nevuamarkets/poly-websockets` dependency from AGPL-3.0 versions to MIT version, resolving license incompatibility warnings. Removed all AGPL-3.0 references from source code comments and error messages to ensure full MIT license compliance. (Fixes #35)

## [2.0.9] - 2026-02-09

### Fixed

- **Polymarket Pagination**: Implemented a parallel pagination utility for the Gamma API. This enables the discovery of events and markets beyond the first 500 results, ensuring high-volume and older markets are correctly indexed. (Fixes #37)

## [2.0.8] - 2026-02-08

### Changed

- **API Documentation**: Significantly refactored the API reference generation system. 
  - Introduced `extract-jsdoc.js` for more robust metadata extraction and multi-language example support.
  - Updated Handlebars templates for Python and TypeScript documentation.
  - Refined documentation and examples for all core exchange methods in `BaseExchange`.
- **BaseExchange Architecture**: Improved the `BaseExchange` class with enriched JSDoc metadata to better support the automated documentation pipeline.
- **CI/CD Pipeline**: Streamlined the testing process by unifying Core and Python test execution under the `npm test` command via `verify-all.sh`.

### Fixed

- **Python SDK Compatibility**: Migrated all remaining tests and examples in the Python SDK to the v2.0.0 API standards, fixing several integration regressions and ensuring full parity.
- **Limitless Exchange**: Refined parameter handling and data normalization for the Limitless implementation.

### Added

- **Project Metadata**: Updated download badges and workflow examples to reflect recent project updates and usage patterns.


## [2.0.7] - 2026-02-07

### Fixed

- **Python SDK**: Robust parsing for `resolution_date` in the `UnifiedMarket` model. The SDK now gracefully handles both ISO string formats (with "Z" or timezone offsets) and native `datetime` objects, preventing parsing errors for markets with irregular resolution data.

## [2.0.6f] - 2026-02-06

### Fixed

- **OHLCV Validation**: Added explicit runtime validation for the `resolution` parameter in `fetchOHLCV` to ensure API compliance and better error messaging.

## [2.0.5] - 2026-02-06

### Changed

- **Unified API Refined**: Split historical data parameters into `OHLCVParams` and `TradesParams` to better reflect their different nature.
  - `fetchOHLCV` now uses `OHLCVParams` (where `resolution` is required).
  - `fetchTrades` now uses `TradesParams` (where `resolution` is removed, as trades are discrete events).
- **TypeScript SDK**: Added dedicated interfaces for `OHLCVParams` and `TradesParams`.
- **Python SDK**: Updated type hints and documentation to reflect the refined parameter structure.
- **OpenAPI**: Updated specification with dedicated schemas for OHLCV and Trade parameters.

### Deprecated

- **`resolution` in `fetchTrades`**: The `resolution` parameter is now deprecated for trade history lookups and will be ignored. A console warning has been added for backward compatibility; it will be removed in v3.0.0.

## [2.0.2] & [2.0.3] & [2.0.4] - 2026-02-05


### Fixed

- **TypeScript SDK Build**: Fixed TypeScript compilation errors in generated SDK code caused by missing `instanceOf` function exports.
  - Added automatic post-processing script to patch OpenAPI-generated code.
  - Resolved `isolatedModules` TypeScript errors in core exchange modules (Kalshi, Limitless, Polymarket).
  - Changed `export` to `export type` for WebSocket config type re-exports.
- **CI/CD Pipeline**: Resolved build failures in GitHub Actions for npm package publishing.

### Note

- Version 2.0.1 remains valid for Python SDK (`pmxt`). This release (2.0.2) specifically addresses TypeScript SDK (`pmxtjs`) build issues.

## [2.0.1] - 2026-02-05

### Breaking Changes

- **Removed Deprecated Methods**: All previously deprecated methods have been removed as part of the v2.0.0 cleanup.
  - `searchMarkets(query, params)`: Use `fetchMarkets({ query, ...params })` instead.
  - `getMarketsBySlug(slug)`: Use `fetchMarkets({ slug })` instead.
  - `searchEvents(query, params)`: Use `fetchEvents({ query, ...params })` instead.
- **Removed Deprecated Fields**: Removed the deprecated `.id` field from `UnifiedMarket` and `MarketOutcome` models. Use `.marketId` and `.outcomeId` instead.
- **Python SDK Signature Changes**: Refactored Python SDK to use direct keyword arguments instead of params dictionary.
  - `fetch_ohlcv` and `fetch_trades` now use kwargs for cleaner API calls.
  - All methods now follow the pattern: `method(arg1, arg2, key1=value1, key2=value2)` instead of `method(arg1, arg2, params={'key1': value1})`.

### Added

- **Limitless WebSocket Support**: Implemented real-time WebSocket streaming for Limitless exchange.
  - Added `watchOrderBook` and `watchTrades` support for live market data.
  - WebSocket connection management with automatic reconnection.
- **Limitless On-Chain Balances**: Added on-chain balance fetching capability for Limitless exchange.
  - Queries blockchain directly for accurate balance information.
  - Integrated with Limitless SDK for seamless balance retrieval.
- **Unified Error Handling System**: Implemented a comprehensive error handling system across all exchanges.
  - Consistent error messages and status codes across Polymarket, Kalshi, and Limitless.
  - Improved error mapping for better debugging and troubleshooting.
  - More robust compliance tests with proper error detection.
- **Polymarket Signing Updates**: Enhanced Polymarket initialization with new authentication options.
  - Added `proxyAddress` parameter for explicit proxy wallet configuration.
  - Added `signatureType` parameter with support for "gnosis-safe" (default), "polyproxy", and "eoa".
  - Updated examples to demonstrate new signing methods.

### Changed

- **Migration to Unified API**: Completed migration to CCXT-style API patterns as outlined in `MIGRATION.md`.
  - All exchanges now use consistent parameter patterns with unified `params` objects (TypeScript) or keyword arguments (Python).
  - Improved API consistency across all supported exchanges.
- **Updated Examples**: Refactored all examples in `examples/` directory to use v2.0.0 API patterns.
  - Removed legacy method calls and deprecated patterns.
  - Added examples demonstrating new Polymarket signing configuration.
  - Updated models and data structures throughout.
- **OpenAPI Documentation**: Updated OpenAPI specification to include:
  - Limitless WebSocket endpoints and methods.
  - Missing methods from previous versions.
  - Corrected parameter definitions and response schemas.
- **Limitless Documentation**: Improved Limitless exchange documentation with clearer setup instructions and API usage examples.

### Fixed

- **TypeScript Build Errors**: Resolved TypeScript compilation errors related to Limitless WebSocket implementation and server bundle generation.
- **Python Error Parsing**: Fixed error parsing issues in the Python SDK that were causing incorrect error messages.
- **Limitless Search Functionality**: Fixed semantic search parameters and query handling for Limitless markets.
  - Corrected parameter mapping for search endpoints.
  - Improved search result relevance and accuracy.
- **Compliance Test Improvements**: Enhanced compliance test suite across all exchanges.
  - Replaced deprecated `.id` with `.outcomeId` and `.marketId` in all tests.
  - Improved error status and message detection for Kalshi `fetchOrder` tests.
  - Updated `fetchOrderBook` tests and reduced Limitless logging noise.
  - Increased `fetchMarkets` timeout to 120s for Kalshi to handle slower API responses.
  - Changed market fetch limit to 25 for better test reliability.
  - Fixed `fetchMarket` tests to properly handle Kalshi's data structure.
- **Verbose Logging**: Removed excessive verbose logging from sidecar API, providing cleaner console output during normal operations.

### Improved

- **Error Handling Robustness**: Significantly improved error detection, mapping, and reporting across all exchanges.
- **Test Reliability**: Enhanced compliance test suite with better timeout handling and more robust assertions.
- **Code Quality**: Removed all deprecated code paths, resulting in cleaner and more maintainable codebase.
- **Documentation Quality**: Updated README with authentication introduction and clearer getting started instructions.

### Migration Guide

For TypeScript users upgrading from v1.7.0:
```typescript
// v1.7.0 (deprecated methods)
const markets = await exchange.searchMarkets("Trump", { limit: 10 });
const market = await exchange.getMarketsBySlug("trump-wins-2024");

// v2.0.0 (unified API)
const markets = await exchange.fetchMarkets({ query: "Trump", limit: 10 });
const market = await exchange.fetchMarkets({ slug: "trump-wins-2024" });

// v1.7.0 (deprecated field)
console.log(market.id);

// v2.0.0 (use specific ID fields)
console.log(market.marketId);
console.log(outcome.outcomeId);
```

For Python users upgrading from v1.7.0:
```python
# v1.7.0 (params dictionary)
candles = exchange.fetch_ohlcv(market_id, timeframe, params={'start': start_time})

# v2.0.0 (keyword arguments)
candles = exchange.fetch_ohlcv(market_id, timeframe, start=start_time)

# v1.7.0 (deprecated field)
print(market.id)

# v2.0.0 (use specific ID fields)
print(market.market_id)
print(outcome.outcome_id)
```

Polymarket initialization with new signing options:
```typescript
// v2.0.0 (explicit proxy configuration)
const poly = new Polymarket({
  credentials: {
    privateKey: "0x...",
    proxyAddress: "0x...",  // Optional: your proxy wallet address
    signatureType: "gnosis-safe"  // Optional: "gnosis-safe" (default), "polyproxy", or "eoa"
  }
});
```

## [2.0.0] - 2026-02-05
Invalid

## [1.7.0] - 2026-02-03

### Added
- **Unified API Consolidation**: Consolidated `searchMarkets()`, `getMarketsBySlug()`, and `searchEvents()` into new CCXT-style `fetchMarkets()` and `fetchEvents()` methods.
  - New methods accept a unified `params` object (TS) or keyword arguments (Python).
  - Supports `query` and `slug` as standard parameters.
- **Improved CCXT Compatibility**: Aligned the API structure more closely with the CCXT standard for easier cross-platform migration.

### Deprecated
- `searchMarkets(query, params)`: Use `fetchMarkets({ query, ...params })` instead.
- `getMarketsBySlug(slug)`: Use `fetchMarkets({ slug })` instead.
- `searchEvents(query, params)`: Use `fetchEvents({ query, ...params })` instead.
- These methods will be removed in v2.0. Deprecation warnings have been added.

### Improved
- **BaseExchange Architecture**: Moved search routing logic into the `BaseExchange` class to reduce duplication across exchange implementations.
- **Example Modernization**: All core and SDK examples updated to use the new unified API patterns.
- **Test Coverage**: Added compliance tests for the new `fetchMarkets` and `fetchEvents` implementations.

## [1.6.0] - 2026-02-03

### Added
- **Filtering**: Introduced a client-side filtering system for both Python and TypeScript SDKs.
  - `filterMarkets` / `filter_markets`: Filter markets by text (search in title, description, category, tags, or outcomes), volume (24h or total), liquidity, open interest, resolution date, and pricing.
  - `filterEvents` / `filter_events`: Filter events by text, category, tags, market count, and total volume.
  - Support for custom predicate functions (lambdas) for unlimited filtering flexibility.
- **Server Management Utilities**: Added global convenience functions to manage the PMXT background process.
  - `stop_server()` / `stopServer()`: Programmatically shut down the sidecar server.
  - `restart_server()` / `restartServer()`: Quickly refresh the server state.
- **Comprehensive Testing**: Added extensive unit tests for the filtering engine in both SDKs and the core library.

### Improved
- **Documentation**: Updated the API Reference and README to include details on the new filtering capabilities and server utilities.
- **Download Badges**: Refreshed statistics to accurately reflect project growth across npm and PyPI.

## [1.5.7] - 2026-02-01

### Added
- **Fee Support for CreateOrder**: Added a `fee` parameter to `CreateOrderParams`.
- **Polymarket Fee Handling**: Implemented mandatory fee rates (e.g., 1000 for 0.1%) for Polymarket orders. This enables trading on high-frequency markets like "Bitcoin Up/Down" which require a fee rate.

### Fixed
- **API Parity**: Ensured `fee` field consistency across Python SDK, TypeScript SDK, and core sidecar server.

## [1.5.6] - 2026-02-01

### Added
- **Polymarket Proxy Auto-Discovery**: The SDK now automatically identifies Gnosis Safe, PolyProxy, and EOA account types by querying the Polymarket Data API, reducing manual configuration.
- **Robust Balance Fallback**: Implemented an on-chain USDC balance check for Polymarket that triggers if the CLOB API returns zero, ensuring accurate fund reporting even during API desyncs.
- **Explicit Proxy Configuration**: Added `funderAddress` (proxy address) and `signatureType` to exchange credentials in both TypeScript and Python SDKs for manual overrides.
- **OpenAPI Schema Updates**: Exposed proxy configuration fields in the sidecar server API.

### Fixed
- **Polymarket Balance Accuracy**: Resolved critical issues where proxy-based accounts were incorrectly reporting zero balance.
- **Polymarket Order Placement**: Fixed signing issues for proxy accounts by ensuring the correct funder address and signature type are used during CLOB client initialization.
- **Limitless Account Configuration**: Added support for proxy addresses and custom signature types in Limitless exchange.

### Improved
- **Python SDK Parity**: Updated the Python `Polymarket` and `Limitless` clients to support the new proxy and signature configuration options.

## [1.5.5] - 2026-02-01

### Fixed
- **Kalshi Trading Reliability**: Resolved a critical URL mismatch in `createOrder` that caused order placement to fail in some environments.
- **TypeScript Integration Tests**: Fixed syntax errors in `tests/integration.test.ts` that were preventing the SDK verification suite from running cleanly.
- **Compliance Handling**: Updated `fetchTrades` compliance tests to gracefully handle exchanges that return "Not Implemented" instead of failing the test suite.
- **Order Fetching**: Fixed intermittent `TypeError` issues in `fetchOrder` (specifically for Polymarket) when handling orders with missing side information.

### Improved
- **Kalshi WebSocket Stability**: Enhanced the `watchTrades` compliance test with smarter market selection (targeting high-volume markets) to eliminate false-positive timeouts.

## [1.5.3 / 1.5.4] - 2026-01-31

### Added
- **Limitless Order Cancellation**: Implemented `cancelOrder` support for Limitless exchange.
- **Compliance Hardening**: Comprehensive update to compliance testing suite:
  - Added dynamic skipping for tests requiring missing credentials.
  - Implemented real `createOrder` tests for all exchanges.
  - Removed mocks in favor of live API verification.

### Fixed
- **Polymarket Trades**: Switched `fetchTrades` to use the public Data API (`/activity`), resolving 503 errors and parameter mismatches.
- **Limitless Reliability**:
  - Filtered out invalid "outcome-less" markets in `fetchMarkets`.
  - Fixed `fetchTrades` to return empty list instead of throwing when no trades exist.
  - Fixed `fetchOHLCV` compliance test and status.
  - Explicitly disabled WebSocket tests as they are not supported.
- **Kalshi Configuration**: Updated default API endpoint to `api.elections.kalshi.com`.

## [1.5.2] - 2026-01-30

### Fixed
- **Limitless Group Markets**: Resolved an issue where hierarchical `searchEvents` on Limitless failed to discover nested markets within "Group" structures.
- **Search Robustness**: Added safety checks for missing market descriptions during search to prevent runtime errors.

## [1.5.1] - 2026-01-30

### Added
- **Limitless SDK Exposure**: Exposed the `Limitless` exchange class in both Python (`pmxt.Limitless`) and TypeScript (`import { Limitless } from 'pmxtjs'`) SDKs, bringing them to parity with the core implementation.

## [1.5.0] - 2026-01-30

### Added
- **Limitless Exchange**: Full integration with Limitless API, including market fetching, trading, and order book management.
  - Features consolidated endpoints and dynamic tick size handling.
- **Example Updates**: Refactored examples to remove boilerplate and use the new search DX.

### Fixed
- **Limitless Tests**: Resolved test failures for Limitless exchange integration.
- **Limitless WebSockets**: Explicitly disabled WebSockets for Limitless (not supported in v1) to prevent runtime errors.
- **Limitless Tick Size**: Implemented dynamic tick size to support various markets on Limitless.

## [1.4.1] - 2026-01-30

### Fixed
- **Windows Core Support**: Resolved a critical `[WinError 193]` issue that prevented the sidecar server from launching on Windows.
  - Implemented explicit `node` execution for the server launcher on Windows.
  - Added `.js` extension aliases for core binary scripts to ensure compatibility with Windows file associations.
- **Server Lifecycle**: Improved the `pmxt-ensure-server` launcher to perform a proactive health check even if a stale lock file is present, ensuring the server is actually responsive before returning.
- **Python SDK Launcher Selection**: Optimized the `ServerManager` to prioritize bundled launchers with platform-specific extensions, resolving environment-specific discovery issues.

### Added
- **Cross-Platform Testing**: Introduced a new test suite (`sdks/python/tests/test_server_manager.py`) to verify SDK launcher logic across different operating systems.
- **Bundling Automation**: Updated `bundle_server.py` to automatically generate Windows-compatible entry points during the build process for the Python package.

### Improved
- **Setup Documentation**: Updated the main README with explicit requirements for Node.js availability on the system PATH, specifically for Windows users.

## [1.4.0] - 2026-01-30

### Added
- **Best Execution Price Helper**: Introduced new helper methods to both Python and TypeScript SDKs to calculate volume-weighted average prices based on current order book liquidity.
  - `getExecutionPrice(orderBook, side, amount)`: Returns the average price for a specific size.
  - `getExecutionPriceDetailed(...)`: Returns structured data including total filled amount and whether the order could be fully filled.
- **Universal `getMarketsBySlug`**: Added a reliable way to fetch markets using URL slugs (Polymarket) or event tickers (Kalshi). This simplifies deep-linking and integration with external sources.
- **Execution Price Examples**: Added comprehensive examples in `examples/market-data/` for both languages (`execution_price.py` and `execution_price.ts`).
- **New Data Models**: Added `ExecutionPriceResult` (TS) and `ExecutionPriceResult` (Python) models for strongly typed price calculation results.

### Improved
- **Financial Math Logic**: Implemented robust floating-point handling and sorting for execution price calculations to ensure consistency across exchanges.
- **Base Exchange Class**: Promoted `getMarketsBySlug` to the base `PredictionMarketExchange` class for improved code sharing and API consistency.
- **OpenAPI Synchronization**: Updated the sidecar's OpenAPI specification to include the new execution price endpoints.

### Fixed
- **Precision Errors**: Resolved subtle floating-point precision issues in cumulative volume calculations when traversing deep order books.

## [1.3.4] - 2026-01-29

### Added
- **In-Event Search (Python & TS)**: Implemented the `search_markets` (Python) and `searchMarkets` (TS) methods on `UnifiedEvent` objects. This allows for fast, contextual filtering of markets within a specific event, matching the pattern described in the README.
- **TypeScript `searchEvents`**: Added the `searchEvents` method to the TypeScript `Exchange` class to provide full parity with the Python implementation.

### Fixed
- **Python SDK NameError**: Fixed a `NameError` in the Python SDK where `SearchIn` and other Literal types were used before being defined in `models.py`.
- **TypeScript Protected Access**: Resolved a lint error in the TypeScript SDK where protected configuration members were being accessed incorrectly in the manual `searchEvents` implementation.
- **API Parity**: Fixed discrepancies between the documentation and the actual SDK implementations for both Python and TypeScript hierarchical search features.

## [1.3.3] - 2026-01-29

### Added
- **Python SDK Parity**: Implemented the `search_events` method in the Python SDK, bringing it to full parity with the TypeScript implementation introduced in v1.3.1.
- **UnifiedEvent Model**: Added the native `UnifiedEvent` dataclass to the Python SDK for better type safety when using hierarchical search.
- **Semantic Aliases**: Added a `.question` property alias to `UnifiedMarket` in the Python SDK, matching common developer expectations for prediction market queries.

### Fixed
- **Python SDK API Calls**: Fixed a regression where hierarchical search endpoints were missing from the auto-generated internal API client by implementing a robust manual fallback.

## [1.3.2] - 2026-01-29

### Fixed
- **Python SDK Bundled Server**: Updated the internal bundled sidecar server to the latest version. This resolves a regression where the "Date Handling in OHLCV" fix (from v1.1.3) was not correctly applied in the Python distribution, causing `getTime is not a function` errors when fetching historical data.

### Improved
- **CI/CD**: Added an automated step to the GitHub Actions workflow to rebuild and bundle the sidecar server immediately before publishing the Python package, ensuring the PyPI distribution always contains the latest core server code.

## [1.3.1] - 2026-01-29

### Added
- **Hierarchical Search API**: Introduced a new, cleaner way to discover markets via the `searchEvents` method.
  - **Contextual Grouping**: `searchEvents` returns `UnifiedEvent` objects that group related markets (e.g., all candidates in the same election).
  - **In-Event Search**: Added `event.searchMarkets(query)` to result objects for fast, contextual filtering.
  - **Unified Support**: Implemented for both Polymarket (Gamma API) and Kalshi (Events API).
- **OpenAPI Updates**: Exposed the new `/searchEvents` endpoint and `UnifiedEvent` schema in the sidecar server documentation.

### Improved
- **Developer Experience (DX)**: Updated the README Quickstart to prioritize the new hierarchical search pattern, reducing boilerplate for common tasks.
- **Documentation**: Simplified the main README for both Python and TypeScript, clearly explaining the **Event -> Market -> Outcome** data hierarchy.
- **Build Infrastructure**: Hardened `verify-all.sh` to handle monorepo version mismatches more gracefully during local development by making `npm install` conditional.

## [1.2.0] - 2026-01-29

### Added
- **Unified Semantic Shortcuts**: Introduced convenience properties for binary markets across all SDKs (Python and TypeScript).
  - **New Properties**: `market.yes`, `market.no`, `market.up`, and `market.down`.
  - **Intelligent Mapping**: Implemented shared core logic to automatically identify "Yes" vs "No" outcomes based on labels and common patterns (e.g., "Not X" pairs).
  - **Expressive Aliases**: Added `.up` and `.down` as semantic aliases for `.yes` and `.no` to improve readability for directional markets.

### Improved
- **Core Architecture**: Extracted market normalization logic into a shared utility to ensure absolute parity between exchange implementations.
- **SDK Parity**: Updated both auto-generated and handcrafted portions of the Python and TypeScript SDKs to expose the new fields with full type hinting.

## [1.1.4] - 2026-01-27

### Fixed
- **Timezone Handling**: Hardened date parsing to treat naive ISO strings (typically from Python's `datetime.utcnow()`) as UTC. This prevents timezone shifts when querying historical data across the sidecar interface.

### Improved
- **Polymarket OHLCV**: Implemented robust client-side candle aggregation for Polymarket price history.
  - Previously: The endpoint returned raw trade/tick data points which could be noisy or misaligned.
  - Now: Data is properly bucketed into time intervals (candles) with accurate Open, High, Low, Close, and Volume calculations.

## [1.1.3] - 2026-01-27

### Fixed
- **Date Handling in OHLCV**: Fixed a critical issue where the Python SDK (which serializes datetime objects as strings) was causing "getTime is not a function" errors in the TypeScript sidecar.
  - Implemented robust date parsing middleware in `fetchOHLCV` for both Polymarket and Kalshi exchanges.
  - The sidecar server now correctly accepts both native `Date` objects (from internal TS calls) and ISO 8601 strings (from external APIs/SDKs) for `start` and `end` parameters.

## [1.1.1] - 2026-01-25

### Fixed
- **Server Lifecycle**: Resolved a critical race condition where multiple concurrent client instantiations (e.g., initializing both Polymarket and Kalshi simultaneously) would kill and restart the sidecar server, invalidating access tokens.
- **Version Detection**: Improved `package.json` discovery in the sidecar server to ensure correct version reporting in bundled environments.
- **SDK Stability**: Updated the Python `ServerManager` to be more tolerant of version suffixes (like `-b4` or `-dev`), preventing unnecessary server restarts during development.

## [1.1.0] - 2026-01-25

### Added
- **Unified WebSocket Support**: Introduced real-time streaming capabilities for prediction markets via a standardized interface.
  - **New Methods**: Added `watchOrderBook(id)` and `watchTrades(id)` following the CCXT Pro pattern for real-time data ingestion.
  - **Kalshi WebSocket**: Implemented native WebSocket support for Kalshi, including real-time order book snapshots, incremental deltas, and trade feeds.
  - **Polymarket CLOB WebSocket**: Integrated with Polymarket's Central Limit Order Book (CLOB) WebSocket for low-latency market updates.
  - **Sidecar Integration**: Real-time methods are now accessible via the sidecar server, enabling streaming support across Python and TypeScript SDKs.
- **Examples**: Added comprehensive WebSocket examples in `examples/market-data/`:
  - `watch_orderbook_kalshi.ts` / `watch_orderbook_polymarket.ts`
  - `watch_trades_kalshi.ts` / `watch_trades_polymarket.ts`

### Changed
- **Data Normalization**: Enhanced market ID resolution to ensure consistency between REST snapshots and WebSocket update streams.
- **Kalshi Order Book Logic**: Optimized the internal book builder to automatically handle Kalshi's "bids-only" data format by synthesizing asks from inverse outcomes.

### Fixed
- **Build Infrastructure**: Resolved "missing dependency" errors by adding `ws` and `@types/ws` to the core package.
- **Connection Stability**: Improved WebSocket reconnection logic and error handling to manage network disruptions gracefully.
- **Type Definitions**: Fixed several edge-case TypeScript errors in WebSocket event handlers.

## [1.0.4] - 2026-01-22

### Added
- **Sidecar Security**: Implemented a secure handshake protocol between the SDK and the Node.js sidecar server to prevent unauthorized access.
- **Auto-Restart Handshake**: Added logic to automatically detect sidecar crashes and restart the process seamlessly.

### Fixed
- **Kalshi Pagination**: Fixed a critical bug in `fetchMarkets` where the `offset` parameter was incorrectly ignored, enabling full traversal of Kalshi's market catalog.
- **Metadata Management**: Improved reliability of internal metadata enrichment for Polymarket results.

## [1.0.3] - 2026-01-17

### Added
- **Zero-Config SDK Installation**: The sidecar server (`pmxt-core`) is now bundled directly within the SDK distributions, enabling a single-command setup experience.
  - **Python**: Bundled the server logic into the `pmxt` package on PyPI.
  - **TypeScript**: Added `pmxt-core` as a direct dependency for `pmxtjs`.
- **Project Statistics**: Introduced a programmatic "Total Downloads" badge in the README that aggregates data from both npm and PyPI.
- **Automation**: Implemented a GitHub Action to automatically update repository statistics and download counts.

### Changed
- **Branding**: Switched to a unified "version" badge in the documentation to reflect cross-platform consistency.
- **Server Discovery**: Updated the `pmxt-ensure-server` utility to intelligently detect bundled server locations in various environment types (venv, global, etc.).

### Fixed
- **Broken Documentation Links**: Resolved several dead links in the API Reference and Examples sections.
- **Installation Footprint**: Optimized the bundled server footprint for faster SDK installs.

## [1.0.2] - 2026-01-17

broken

## [1.0.1] - 2026-01-17

### Fixed
- **Core SDK (Universal)**: Implemented dynamic port detection via the `~/.pmxt/server.lock` file. This resolves `ConnectionRefusedError` issues when the default port (3847) is already in use and the server falls back to an alternative port.
- **TypeScript SDK**: Resolved a critical race condition where API calls could be executed before the internal server manager had finished starting the sidecar or detecting the actual running port. Standardized the initialization pattern using an internal `initPromise`.
- **TypeScript SDK**: Fixed `ServerManager` health checks to correctly target the dynamically detected port instead of always checking the default.
- **Python SDK**: Hardened the `ServerManager` logic and improved consistency with the TypeScript implementation.

### Added
- **Python**: Added `examples/test_port_detection.py` to demonstrate and verify the new dynamic port resolution logic.

## [1.0.0] - 2026-01-17

### Major Release: Multi-Language SDK Support

This release represents a complete architectural transformation of pmxt, introducing **multi-language support** through a unified sidecar architecture. The project has evolved from a TypeScript-only library to a comprehensive multi-language ecosystem with official Python and TypeScript SDKs.

### Breaking Changes

- **Monorepo Structure**: The project has been restructured into a monorepo with separate packages:
  - `pmxt-core`: Core Node.js server with aggregation logic
  - `pmxtjs`: TypeScript/JavaScript SDK (npm)
  - `pmxt`: Python SDK (PyPI)
- **Package Names**: The npm package remains `pmxtjs`, but the internal structure has changed significantly
- **Import Paths**: TypeScript SDK now uses a wrapper architecture with automatic server management

### Added

#### Python SDK (`pmxt`)
- **Official Python Support**: First-class Python SDK with full feature parity with TypeScript
- **Automatic Server Management**: Python SDK automatically starts and manages the Node.js sidecar server
- **Native Python API**: Pythonic interface with type hints and async support
- **PyPI Distribution**: Published to PyPI as `pmxt` package
- **Comprehensive Examples**: Python examples for all major features (market data, trading, account management)
- **Auto-generated Documentation**: Language-specific API reference documentation

#### Sidecar Architecture
- **Local Express Server**: Core aggregation logic runs as a local HTTP server (port 3847)
- **OpenAPI Specification**: Complete OpenAPI 3.0 schema for all endpoints
- **Health Checks**: Built-in health monitoring and server lifecycle management
- **Automatic Startup**: SDKs automatically start the server when needed
- **Process Management**: Graceful shutdown and cleanup of background processes

#### Infrastructure & Automation
- **OpenAPI Code Generation**: Automated SDK generation from OpenAPI spec using `openapi-generator`
- **Multi-Language CI/CD**: Unified GitHub Actions workflow for publishing to both npm and PyPI
- **Automated Version Management**: Script-based version synchronization across all packages
- **Beta Release Pipeline**: Support for beta releases with dynamic npm tagging
- **Integration Testing**: Comprehensive test suite verifying SDK-to-core compatibility
- **Automated Documentation**: Template-based API documentation generation for each language

#### Core Improvements
- **Per-Request Credentials**: Support for passing credentials on a per-request basis
- **Optimized Kalshi Fetching**: Improved performance for Kalshi market data retrieval
- **Enhanced Type Safety**: Complete TypeScript types for all data models
- **Schema Synchronization**: OpenAPI schema now fully synchronized with core TypeScript types

#### Documentation
- **Language-Specific Docs**: Separate API references for Python and TypeScript
- **Setup Guides**: Detailed setup instructions for both SDKs
- **Testing Guide**: Comprehensive testing documentation (`TESTING.md`)
- **Beta Release Guide**: Documentation for beta release process (`BETA_RELEASE.md`)
- **Contributing Guide**: Updated contribution guidelines for monorepo structure
- **Roadmap**: Updated roadmap reflecting v1.0.0 completion and future plans

### Changed

- **Repository Structure**: Migrated to monorepo with `core/`, `sdks/python/`, and `sdks/typescript/` directories
- **Build Process**: Separate build pipelines for each package with proper dependency management
- **Testing Strategy**: Multi-tier testing (unit, integration, SDK verification)
- **Version Management**: Centralized version management across all packages
- **Repository URLs**: Updated to `pmxt-dev/pmxt` organization for provenance verification
- **License Holder**: Updated copyright holder in LICENSE file

### Fixed

- **ESM/CJS Interoperability**: Implemented dual build (CommonJS/ESM) for TypeScript SDK
  - Fixed "double default" issue in ES Module environments
  - Added `.js` extensions to imports in ESM build
  - Proper `exports` field configuration in `package.json`
- **OpenAPI Schema Sync**: Resolved discrepancies between OpenAPI spec and core types
  - Added missing properties (`resolutionDate`, `metadata`, etc.)
  - Fixed enum types for `Order.status` and similar fields
  - Ensured all SDK-generated models match actual data structures
- **Python Versioning**: Implemented PEP 440 compliant version format for Python packages
- **Build Order Issues**: Resolved TypeScript SDK build dependencies and compilation order
- **Port Configuration**: Standardized on port 3847 with proper health check endpoints
- **CI Build Errors**: Fixed isolated TypeScript generation and build configuration issues

### Technical Details

#### Architecture
The new sidecar architecture works as follows:
1. **Core Server**: Node.js Express server (`pmxt-core`) runs locally and handles all exchange integrations
2. **SDK Clients**: Language-specific SDKs (Python, TypeScript) communicate with the core server via HTTP
3. **Auto-Management**: SDKs automatically start/stop the server as needed
4. **Type Safety**: OpenAPI specification ensures type consistency across all languages

#### Package Versions
- `pmxt-core`: 1.0.0
- `pmxtjs`: 1.0.0
- `pmxt` (Python): 1.0.0

#### Migration from v0.4.4
For TypeScript users:
```typescript
// v0.4.4 (still works)
import pmxt from 'pmxtjs';
const poly = new pmxt.Polymarket();

// v1.0.0 (same API, new architecture)
import pmxt from 'pmxtjs';
const poly = new pmxt.Polymarket();
```

For Python users (new):
```python
import pmxt

poly = pmxt.Polymarket()
markets = poly.search_markets("Trump")
```

### Known Limitations

- **Node.js Dependency**: Both SDKs require Node.js to be installed (for the sidecar server)
- **Beta Features**: Some advanced features are still in beta (see `BETA_RELEASE.md`)
- **Exchange Coverage**: Currently supports Polymarket and Kalshi (more exchanges planned for v1.x.x)

### Acknowledgments

This release represents a major milestone in making prediction market data accessible across all major programming languages. Special thanks to all contributors and early testers who helped shape this architecture.

---
 
## [0.4.4] - 2026-01-15

### Fixed
- **ESM Import Compatibility**: Fixed an issue where `import pmxt from 'pmxtjs'` in ES Module environments (e.g., Node.js with `"type": "module"`) would wrap the default export in an extra `.default` property, breaking the expected `pmxt.polymarket()` syntax. Added explicit named exports (`polymarket`, `kalshi`) to ensure proper CommonJS/ESM interoperability.

### Added
- **Named Exports**: You can now import exchanges directly using named imports: `import { polymarket, kalshi } from 'pmxtjs'` in addition to the default `import pmxt from 'pmxtjs'` syntax.

## [0.4.3] - 2026-01-15

### Fixed
- **Zombie Files in `dist/`**: Implemented a `prebuild` step that automatically cleans the `dist/` folder before every build. This prevents "stuck on old code" issues on macOS/Windows caused by file-to-directory refactors (e.g., `Kalshi.js` becoming `kalshi/index.js`).

### Added
- **Automated Publishing**: Added GitHub Actions workflow to automatically build and publish to npm whenever a new repository tag (e.g., `v0.4.3`) is pushed.

## [0.4.2] - 2026-01-15

### Fixed
- **Kalshi Description Field**: Corrected a mapping issue where the unified `description` field was being populated with `event.sub_title` or `market.subtitle` (which typically only contain dates). It now correctly uses `market.rules_primary`, providing the actual resolution criteria as intended.

## [0.4.1] - 2026-01-15

### Fixed
- **Kalshi Metadata Enrichment**: Fixed a major data gap where Kalshi markets were returning empty `tags`. 
  - **The Issue**: The Kalshi `/events` and `/markets` endpoints do not expose tags. Tags are instead nested under the `/series` metadata, which wasn't being queried.
  - **The Fix**: Implemented a secondary fetch layer that retrieves Series metadata and maps it back to Markets.
  - **Unified Tags**: Standardized the provider data model by merging Kalshi's `category` and `tags` into a single unified `tags` array, ensuring consistency with Polymarket's data structure.

### Changed
- **Kalshi Implementation**: Modified `fetchMarkets` to fetch Series mapping in parallel with events and `getMarketsBySlug` to perform atomic enrichment.

## [0.4.0] - 2026-01-13

### Added
- **Trading Support**: Added full trading support for **Polymarket** and **Kalshi**, including:
  - Order management: `createOrder`, `cancelOrder`, `fetchOrder`, `fetchOpenOrders`.
  - Account management: `fetchBalance`, `fetchPositions`.
- **Tests**: Added comprehensive unit and integration tests for all trading operations.
- **Examples**: Added new examples for trading and account data (e.g., `list_positions`).

### Changed
- **Architecture**: Refactored monolithic `Exchange` classes into modular files for better maintainability and scalability.
- **Authentication**: Simplified Polymarket authentication workflow.
- **Documentation**: Updated `API_REFERENCE.md` with detailed trading and account management methods.

### Fixed
- **Jest Configuration**: Resolved issues with ES modules in dependencies for testing.
- **Kalshi Implementation**: Fixed various bugs such as ticker formatting and signature generation.

### CRITICAL NOTES
- Polymarket has been tested manually, and works.
- Kalshi HAS NOT been tested manually but has been implemented according to the kalshi docs.

## [0.3.1] - 2026-01-11

### Added
- **Search Scope Control**: Added `searchIn` parameter to `searchMarkets` allowing 'title' (default), 'description', or 'both'.

### Changed
- **Default Search Behavior**: `searchMarkets` now defaults to searching only titles to reduce noise and improve relevance.
- **Improved Search Coverage**: Increased search depth for both Polymarket and Kalshi to cover all active markets (up to 100,000) instead of just the top results.

### Fixed
- **Documentation**: Updated README Quick Example to be robust against empty results.

## [0.3.0] - 2026-01-09

### Breaking Changes
- **CCXT Syntax Alignment**: Renamed core methods to follow `ccxt` conventions:
  - `getMarkets` -> `fetchMarkets`
  - `getOrderBook` -> `fetchOrderBook`
  - `getTradeHistory` -> `fetchTrades`
  - `getMarketHistory` -> `fetchOHLCV`
- **Namespace Support**: Implemented `pmxt` default export to allow usage like `pmxt.polymarket`.

### Improved
- **Kalshi OHLCV**: Enhanced price mapping and added mid-price fallback for historical data.
- **Examples**: Updated `historical_prices.ts` to use new method names and improved logic.

### Fixed
- **Type Definitions**: Updated internal interfaces to match the new naming scheme.
- **Documentation**: Updated test headers and file references.

## [0.2.1] - 2026-01-09

### Fixed
- **Test Suite**: Added missing `ts-jest` dependency to ensure tests run correctly.
- **Search Robustness**: Fixed a potential crash in `searchMarkets` for both Kalshi and Polymarket when handling markets with missing descriptions or titles.
- **Data Validation**: Added better error handling for JSON parsing in Polymarket outcomes.

## [0.2.0] - 2026-01-09

### Breaking Changes
- **Unified Deep-Dive Method IDs**: Standardized the IDs used in deep-dive methods across exchanges to ensure consistency. This changes the return signatures of data methods.

### Improved
- **Examples**: Simplified and fixed examples, including `historical_prices`, `orderbook_depth`, and `search_grouping`, to better demonstrate library usage.
- **Example Data**: Updated default queries in examples for more relevant results.

### Documentation
- **README Enhancements**: Added badges, platform logos, and a visual overview image to the README.
- **License**: Added MIT License to the project.

## [0.1.2] - 2026-01-08

### Changed
- **Cleaner Logs**: Removed verbose `console.log` statements from `KalshiExchange` and `PolymarketExchange` to ensure a quieter library experience.
- **Improved Error Handling**: Switched noisy data parsing warnings to silent failures or internal handling.
- **Repository Restructuring**: Flattened project structure for easier development and publishing.
- **readme.md**: Pushed readme.md to npmjs.org

### Removed
- `Fetched n pages from Kalshi...` logs.
- `Extracted n markets from k events.` logs.
- `Failed to parse outcomes` warnings in Polymarket.
