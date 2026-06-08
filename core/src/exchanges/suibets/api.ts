/**
 * SuiBets P2P Sports Betting API Reference
 *
 * This file documents the SuiBets REST API endpoints used by the fetcher.
 * It is NOT wired into defineImplicitApi — the fetcher calls these endpoints
 * directly via FetcherContext.http (the rate-limited HTTP client).
 *
 * Base URL: https://www.suibets.com
 *
 * Endpoints:
 *   GET /api/p2p/offers          - List open P2P offers (status, matchId, sport, limit, offset)
 *   GET /api/p2p/offers/:id      - Get a single P2P offer by ID
 *   GET /api/p2p/my?wallet=...   - Get user activity (created offers, matched bets, parlays)
 *   GET /api/events/upcoming     - List upcoming sports events (sport, limit)
 */

// No runtime exports — this file serves as API documentation only.
