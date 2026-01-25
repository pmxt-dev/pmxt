# Changelog

All notable changes to this project will be documented in this file.

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