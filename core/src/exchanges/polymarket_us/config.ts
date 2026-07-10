/**
 * Polymarket US runtime configuration.
 *
 * Hand-authored single source of truth for base URLs and config factory
 * for the Polymarket US exchange adapter (wraps the polymarket-us SDK).
 */

// -- Base URL constants -------------------------------------------------------

export const POLYMARKET_US_API_BASE_URL = process.env.POLYMARKET_US_BASE_URL || "https://api.polymarket.us";
export const POLYMARKET_US_GATEWAY_BASE_URL = process.env.POLYMARKET_US_GATEWAY_URL || "https://gateway.polymarket.us";

// -- Config interface & factory -----------------------------------------------

export interface PolymarketUSConfig {
    /** Base REST API URL */
    apiUrl: string;
    /** Gateway URL (used by the SDK for order signing / submission) */
    gatewayUrl: string;
}

/**
 * Return a typed config object for the Polymarket US API.
 */
export function getPolymarketUSConfig(baseUrlOverride?: string): PolymarketUSConfig {
    const apiUrl =
        baseUrlOverride || process.env.POLYMARKET_US_BASE_URL || POLYMARKET_US_API_BASE_URL;
    const gatewayUrl =
        process.env.POLYMARKET_US_GATEWAY_URL || POLYMARKET_US_GATEWAY_BASE_URL;

    return {
        apiUrl,
        gatewayUrl,
    };
}
