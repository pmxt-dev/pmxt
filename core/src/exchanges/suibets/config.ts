export const SUIBETS_BASE_URL = 'https://www.suibets.com';

// SuiBets is a P2P sports betting platform on Sui blockchain.
// Platform takes a 2% fee on settled markets.
export const SUIBETS_PLATFORM_FEE = 0.02;

// Sui uses MIST as its base unit; 1 SUI = 1,000,000,000 MIST
export const MIST_PER_SUI = 1e9;

// Prices represent probabilities in the range [0.01, 0.99]
export const MIN_PRICE = 0.01;
export const MAX_PRICE = 0.99;

// Minimum delay between outbound requests (milliseconds)
export const RATE_LIMIT_MS = 300;

// Allowlist of permitted hostnames for SSRF protection
export const ALLOWED_HOSTS: readonly string[] = ['www.suibets.com'];

/**
 * Validates that the given URL's hostname is in the ALLOWED_HOSTS allowlist.
 * Throws if the hostname is not permitted, to prevent SSRF.
 */
export function validateBaseUrl(url: string): void {
    const parsed = new URL(url);
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
        throw new Error(
            `Base URL hostname "${parsed.hostname}" is not in the SSRF allowlist. ` +
                `Permitted hosts: ${ALLOWED_HOSTS.join(', ')}`,
        );
    }
}

export interface SuibetsApiConfig {
    baseUrl: string;
}

export function getSuibetsConfig(baseUrlOverride?: string): SuibetsApiConfig {
    const baseUrl = baseUrlOverride ?? SUIBETS_BASE_URL;
    validateBaseUrl(baseUrl);
    return { baseUrl };
}
