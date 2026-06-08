/**
 * Kalshi runtime configuration.
 *
 * This file is hand-authored and is the single source of truth for:
 *  - Base URL constants for production and demo environments
 *  - API path constants (KALSHI_PATHS)
 *  - URL helper functions used by fetch functions and the exchange class
 *
 * The OpenAPI spec lives in core/specs/kalshi/Kalshi.yaml and is compiled
 * into core/src/exchanges/kalshi/api.ts by `npm run fetch:openapi`.
 * Do NOT put runtime config into api.ts — it will be overwritten.
 *
 * Environment mapping (aligns with the `{env}` server variable in Kalshi.yaml):
 *   env = "api"      → production:  https://api.external-api.kalshi.com
 *   env = "demo-api" → demo/paper:  https://demo-api.external-api.kalshi.com
 */

// ── Base URL constants ────────────────────────────────────────────────────────

export const KALSHI_PROD_API_URL = process.env.KALSHI_BASE_URL || "https://api.external-api.kalshi.com";
export const KALSHI_DEMO_API_URL = process.env.KALSHI_DEMO_BASE_URL || "https://demo-api.external-api.kalshi.com";

export const KALSHI_PROD_WS_URL =
  "wss://api.external-api.kalshi.com/trade-api/ws/v2";
export const KALSHI_DEMO_WS_URL =
  "wss://demo-api.external-api.kalshi.com/trade-api/ws/v2";

// ── Path constants ────────────────────────────────────────────────────────────

export const KALSHI_PATHS = {
  TRADE_API: "/trade-api/v2",
  EVENTS: "/events",
  SERIES: "/series",
  PORTFOLIO: "/portfolio",
  MARKETS: "/markets",
  BALANCE: "/balance",
  ORDERS: "/orders",
  POSITIONS: "/positions",
};

// ── Config interface & factory ────────────────────────────────────────────────

export interface KalshiApiConfig {
  /** Base REST API URL — production or demo */
  apiUrl: string;
  /** WebSocket URL — production or demo */
  wsUrl?: string;
  /** Whether the demo environment is active */
  demoMode: boolean;
}

/**
 * Return a typed config object for the requested environment.
 *
 * @param demoMode - Pass `true` to target demo-api.external-api.kalshi.com.
 *
 * @example
 * ```typescript
 * const config = getKalshiConfig(true);
 * // config.apiUrl === "https://demo-api.external-api.kalshi.com"
 * ```
 */
export function getKalshiConfig(demoMode = false, baseUrlOverride?: string): KalshiApiConfig {
  return {
    apiUrl: baseUrlOverride || (demoMode ? KALSHI_DEMO_API_URL : KALSHI_PROD_API_URL),
    wsUrl: demoMode ? KALSHI_DEMO_WS_URL : KALSHI_PROD_WS_URL,
    demoMode,
  };
}

// ── URL builder helpers ───────────────────────────────────────────────────────

/**
 * Build a full URL from a base and an arbitrary list of path segments.
 * Empty segments are filtered out; leading/trailing slashes are normalised.
 */
function buildApiUrl(
  baseUrl: string,
  ...segments: (string | string[])[]
): string {
  const flatSegments = segments.flat().filter(Boolean);
  const path = flatSegments.map((s) => s.replace(/^\/+|\/+$/g, "")).join("/");
  return path ? `${baseUrl}/${path}` : baseUrl;
}

/**
 * Build the full path (including `/trade-api/v2` prefix) for use in
 * `KalshiAuth.getHeaders()` signing.
 *
 * @example
 * ```typescript
 * getApiPath("/portfolio/balance")
 * // → "/trade-api/v2/portfolio/balance"
 * ```
 */
export function getApiPath(operationPath: string): string {
  return KALSHI_PATHS.TRADE_API + operationPath;
}

/**
 * Build the full URL for the events endpoint.
 *
 * @example
 * ```typescript
 * getEventsUrl(baseUrl)              // .../events
 * getEventsUrl(baseUrl, ['FED-25'])  // .../events/FED-25
 * ```
 */
export function getEventsUrl(
  baseUrl: string,
  pathSegments: string[] = [],
): string {
  return buildApiUrl(
    baseUrl,
    KALSHI_PATHS.TRADE_API,
    KALSHI_PATHS.EVENTS,
    pathSegments,
  );
}

/**
 * Build the full URL for the series endpoint, with optional nested segments.
 *
 * @example
 * ```typescript
 * getSeriesUrl(baseUrl)                                            // .../series
 * getSeriesUrl(baseUrl, 'FED')                                    // .../series/FED
 * getSeriesUrl(baseUrl, 'FED', ['markets', 'FED-B4.75', 'candlesticks'])
 * // .../series/FED/markets/FED-B4.75/candlesticks
 * ```
 */
export function getSeriesUrl(
  baseUrl: string,
  seriesTicker?: string,
  pathSegments: string[] = [],
): string {
  const segments = [
    KALSHI_PATHS.TRADE_API,
    KALSHI_PATHS.SERIES,
    seriesTicker || "",
    ...pathSegments,
  ];
  return buildApiUrl(baseUrl, ...segments);
}

/**
 * Build the full URL for the portfolio endpoint.
 *
 * @example
 * ```typescript
 * getPortfolioUrl(baseUrl, '/balance')  // .../portfolio/balance
 * ```
 */
export function getPortfolioUrl(baseUrl: string, subPath?: string): string {
  return buildApiUrl(
    baseUrl,
    KALSHI_PATHS.TRADE_API,
    KALSHI_PATHS.PORTFOLIO,
    subPath || "",
  );
}

/**
 * Build the full URL for the markets endpoint, with optional nested segments.
 *
 * @example
 * ```typescript
 * getMarketsUrl(baseUrl)                               // .../markets
 * getMarketsUrl(baseUrl, 'FED-B4.75')                  // .../markets/FED-B4.75
 * getMarketsUrl(baseUrl, 'FED-B4.75', ['orderbook'])   // .../markets/FED-B4.75/orderbook
 * ```
 */
export function getMarketsUrl(
  baseUrl: string,
  marketId?: string,
  pathSegments: string[] = [],
): string {
  const segments = [
    KALSHI_PATHS.TRADE_API,
    KALSHI_PATHS.MARKETS,
    marketId || "",
    ...pathSegments,
  ];
  return buildApiUrl(baseUrl, ...segments);
}
