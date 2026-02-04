# Migration Guide

## 2.0.0 Migration Checklist

If you're upgrading from v1.x to v2.0.0, use this checklist to ensure your code is compatible:

### Required Changes

- [ ] **Replace `event.searchMarkets(query)`** with `exchange.filterMarkets(event.markets, query)`
- [ ] **Replace all `outcome.id`** with `outcome.outcomeId`
- [ ] **Replace all `market.id`** with `market.marketId`
- [ ] **Python: Replace `HistoryFilterParams`** with direct kwargs in `fetch_ohlcv()` and `fetch_trades()`
- [ ] **Verify all examples** use the new unified API (`fetchMarkets`, `fetchEvents`)
- [ ] **Update error handling** to use new error classes (if relying on error types)

### Already Migrated in v1.7.0?

If you already migrated to the unified API in v1.7.0, you only need to:

- [ ] **Replace `event.searchMarkets(query)`** with `exchange.filterMarkets(event.markets, query)`
- [ ] **Replace `.id`** with `.outcomeId` / `.marketId`
- [ ] **Python only: Replace `HistoryFilterParams`** with kwargs

### Quick Migration Example

**TypeScript:**
```typescript
// v1.x Code
const events = await poly.fetchEvents({ query: 'Fed Chair' });
const market = events[0].searchMarkets('Kevin Warsh')[0];  //  Removed
const outcomeId = market.yes.id;  //  Removed

// v2.0.0 Code
const events = await poly.fetchEvents({ query: 'Fed Chair' });
const market = poly.filterMarkets(events[0].markets, 'Kevin Warsh')[0];  // ✅
const outcomeId = market.yes.outcomeId;  // ✅
```

**Python:**
```python
# v1.x Code
events = poly.fetch_events(query='Fed Chair')
market = events[0].search_markets('Kevin Warsh')[0]  #  Removed
outcome_id = market.yes.id  #  Removed
candles = poly.fetch_ohlcv(outcome_id, pmxt.HistoryFilterParams(resolution='1h', limit=100))  #  Removed

# v2.0.0 Code
events = poly.fetch_events(query='Fed Chair')
market = poly.filter_markets(events[0].markets, 'Kevin Warsh')[0]  # ✅
outcome_id = market.yes.outcome_id  # ✅
candles = poly.fetch_ohlcv(outcome_id, resolution='1h', limit=100)  # ✅
```

### Testing Your Migration

Run your test suite and look for:
- TypeScript compilation errors about missing properties
- Runtime errors about undefined methods
- Deprecation warnings in console (should be none in v2.0.0)

---

## Feb 3, 2026 - v1.7.0: CCXT-Style Unified API

### Change
Consolidated `searchMarkets()`, `getMarketsBySlug()`, and `searchEvents()` into unified `fetchMarkets()` and `fetchEvents()` methods that accept optional parameters, following CCXT conventions.

### What's Deprecated
The following methods are now deprecated and will be removed in v2.0:
- `searchMarkets(query, params)` → Use `fetchMarkets({ query, ...params })`
- `getMarketsBySlug(slug)` → Use `fetchMarkets({ slug })`
- `searchEvents(query, params)` → Use `fetchEvents({ query, ...params })`

Deprecation warnings will appear in the console when using the old methods.

### How to Migrate

**TypeScript:**
```typescript
// OLD (deprecated)
const markets = await exchange.searchMarkets('Trump', { limit: 10 });
const bySlug = await exchange.getMarketsBySlug('fed-chair-2025');
const events = await exchange.searchEvents('Election', { limit: 5 });

// NEW (CCXT-style)
const markets = await exchange.fetchMarkets({ query: 'Trump', limit: 10 });
const bySlug = await exchange.fetchMarkets({ slug: 'fed-chair-2025' });
const events = await exchange.fetchEvents({ query: 'Election', limit: 5 });
```

**Python:**
```python
# OLD (deprecated)
markets = await exchange.search_markets('Trump', limit=10)
by_slug = await exchange.get_markets_by_slug('fed-chair-2025')
events = await exchange.search_events('Election', limit=5)

# NEW (CCXT-style)
markets = await exchange.fetch_markets(query='Trump', limit=10)
by_slug = await exchange.fetch_markets(slug='fed-chair-2025')
events = await exchange.fetch_events(query='Election', limit=5)
```

### Benefits
- **Unified interface**: Single method for all market fetching operations
- **CCXT compatibility**: Familiar API for CCXT users
- **Cleaner code**: No need to remember different method names for different operations
- **Backward compatible**: Old methods still work (with warnings) until v2.0

---

## Feb 3, 2026 - v1.6.0: Unified Filtering

### Change
Introduced dedicated `filter_markets()` and `filter_events()` methods to replace manual list filtering and unify searching.

### How to Migrate
Instead of manually filtering lists using list comprehensions or `filter()`, use the unified methods:

```python
# OLD
warsh = fed_event.search_markets('Kevin Warsh')[0]

# NEW
warsh = api.filter_markets(fed_event.markets, "Kevin Warsh")[0]
```

---

## Feb 2, 2026 - v1.5.8: Hybrid ID Properties

### Change
Introduced explicit `marketId` and `outcomeId` properties to replace the ambiguous `.id` property.

**IMPORTANT**: The deprecated `.id` fields still exist for backwards compatibility but will be removed in v2.0. Update your code now to use the new fields.

### How to Migrate
Update your code to use the specific identifiers:

*   **Markets**: Use `market.marketId` (TypeScript) or `market.market_id` (Python) instead of `market.id`
*   **Outcomes**: Use `outcome.outcomeId` (TypeScript) or `outcome.outcome_id` (Python) instead of `outcome.id`

**Python:**
```python
# OLD (deprecated, will be removed in v2.0)
await poly.fetch_order_book(outcome.id)

# NEW
await poly.fetch_order_book(outcome.outcome_id)
```

**TypeScript:**
```typescript
// OLD (deprecated, will be removed in v2.0)
await poly.fetchOrderBook(outcome.id)

// NEW
await poly.fetchOrderBook(outcome.outcomeId)
```
