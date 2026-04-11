# Changelog

All notable changes to this project will be documented in this file.

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