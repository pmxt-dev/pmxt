# Changelog

All notable changes to this project will be documented in this file.
 
## [0.4.1] - 2026-01-15

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
