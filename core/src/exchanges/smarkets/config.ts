/**
 * Smarkets runtime configuration.
 *
 * This file is hand-authored and is the single source of truth for:
 *  - Base URL constant
 *  - API path constants (SMARKETS_PATHS)
 *  - Config interface and factory
 *
 * The OpenAPI spec lives in core/specs/smarkets/Smarkets.yaml and is compiled
 * into core/src/exchanges/smarkets/api.ts by `npm run fetch:openapi`.
 * Do NOT put runtime config into api.ts -- it will be overwritten.
 */

// -- Base URL constant --------------------------------------------------------

export const DEFAULT_SMARKETS_BASE_URL = "https://api.smarkets.com";
export const SMARKETS_BASE_URL = process.env.SMARKETS_BASE_URL || DEFAULT_SMARKETS_BASE_URL;

// -- Path constants -----------------------------------------------------------

export const SMARKETS_PATHS = {
  SESSIONS: "/v3/sessions/",
  SESSIONS_VERIFY: "/v3/sessions/verify/",
  ACCOUNTS: "/v3/accounts/",
  ACCOUNTS_ACTIVITY: "/v3/accounts/activity/",
  ACCOUNT_ACTIVITY_CSV:
    "/v3/account_activity_csv/{start_datetime}/{end_datetime}/",
  CURRENCIES: "/v3/currencies/{code}/",
  EVENTS: "/v3/events/",
  EVENTS_COMPETITORS: "/v3/events/{event_ids}/competitors/",
  EVENTS_MARKETS: "/v3/events/{event_ids}/markets/",
  EVENTS_MARKETS_COUNT: "/v3/events/{event_ids}/markets_count/",
  EVENTS_STATES: "/v3/events/{event_ids}/states/",
  MARKETS_CONTRACTS: "/v3/markets/{market_ids}/contracts/",
  MARKETS_LAST_EXECUTED_PRICES:
    "/v3/markets/{market_ids}/last_executed_prices/",
  MARKETS_QUOTES: "/v3/markets/{market_ids}/quotes/",
  MARKETS_VOLUMES: "/v3/markets/{market_ids}/volumes/",
  ORDERS: "/v3/orders/",
  ORDERS_FULLCOVER: "/v3/orders/fullcover/",
  ORDERS_BY_ID: "/v3/orders/{order_id}/",
};

// -- Config interface & factory -----------------------------------------------

export interface SmarketsApiConfig {
  /** Base REST API URL */
  apiUrl: string;
}

/**
 * Return a typed config object for the Smarkets API.
 */
export function getSmarketsConfig(baseUrlOverride?: string): SmarketsApiConfig {
  const apiUrl =
    baseUrlOverride || process.env.SMARKETS_BASE_URL || DEFAULT_SMARKETS_BASE_URL;

  return {
    apiUrl,
  };
}
