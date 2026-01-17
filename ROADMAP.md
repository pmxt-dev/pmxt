# Roadmap

## v0.x.x: Initial Foundation (Completed)
**Goal:** Establish the unified API interface and core standardization logic for prediction markets.

- **Unified Data Structures:** Defined canonical formats for markets, orders, and positions.
- **Initial Exchange Support:** Integrated Polymarket and Kalshi.
- **Status:** Done.

## v1.0.0: The Sidecar Foundation (Current)
**Goal:** Establish a robust multi-language ecosystem with a unified core and automated infrastructure.

- **Architecture:** Implementation of the local Node.js "sidecar" server hosting core aggregation and standardization logic.
- **SDKs:** 
    - **TypeScript:** Refactored native wrapper with automatic server management.
    - **Python:** Complete native SDK with automatic server lifecycle management.
    - **Infrastructure:** OpenAPI-based pipeline for generating any language SDK.
- **Exchanges:** Support for industry leaders **Polymarket** and **Kalshi**.
- **Automation:** 
    - Comprehensive CI/CD for all packages (npm and PyPI).
    - Automated language-specific API documentation generation.
- **Status:** In progress.

## v1.x.x: Ecosystem Expansion (Upcoming)
**Goal:** Increase coverage, connectivity, and real-time capabilities.

- **WebSockets:** Implement real-time unified data streaming for orderbooks and trades.
- **Exchange Support:** Expansion to **5+ Exchange Integrations** (e.g., BetOnline, Polymarket CLOB, etc.).
- **SDK Library:** Release official first-party wrappers for **Java**, **C#**, and **Go**.
- **Unified Authentication:** Streamlined secret management across different exchange protocols.

## v2.0.0: Native Performance
**Goal:** Optimize for high-frequency usage and remove runtime dependencies.

- **Architecture:** Move to native bindings. Rewrite core logic in a systems language (**Rust**) or using optimized FFI, removing the need for a background Node.js process.
- **Benefits:** 
    - Ultra-low latency for high-frequency trading.
    - Zero-dependency installation for Python/Java users.
    - Minimal resource footprint.
