# Roadmap

## v0.x.x: Foundation (Current)
**Goal:** Establish the unified api interface and feature set for initial exchanges in JavaScript/TypeScript.

- **Core Features:**
    - Unified data structures for markets and orders.
    - Basic trading capabilities (buy/sell).
    - Market search and filtering.
- **Exchange Support:** Initial support for key exchanges (e.g., Polymarket, Kalshi).
- **Status:** Active development.

## v1.0.0: The "Sidecar" Expansion (Target: Q2 2026)
**Goal:** Expand ecosystem support to major programming languages (Python, Java, C#) using the established core logic.

- **Architecture:** Run a lightweight, local Node.js server (the "sidecar") that hosts the core aggregation and standardization logic.
- **SDKs:** Provide native SDKs for **Python**, **Java**, **C#**, and more using OpenAPI. These SDKs will transparently communicate with the local Node.js process via HTTP or gRPC.
    - Ensures 100% consistency in behavior across all languages.
    - Allows rapid iteration: an update to the JS core updates all languages simultaneously.
- **Exchange Support:** Expansion to **5+ Exchange Integrations** (aggregated into a unified API).

## v2.0.0: Native Performance
**Goal:** Optimize for high-frequency usage and remove runtime dependencies.

- **Architecture:** Move to native bindings. This involves rewriting the core logic in a systems language (Rust) or using optimized FFI (Foreign Function Interface) directly, removing the need for a background Node.js process.
- **Benefits:** Lower latency, simpler installation (no Node.js dependency required for Python/Java users), and better resource management.
