/**
 * Shared URL and environment-variable constants for the pmxt SDK.
 *
 * These are deliberately plain exports (no runtime logic) so that they
 * can be imported from any module without creating import cycles.
 */

/**
 * The hosted pmxt production endpoint.
 *
 * Exchange classes and `Router` default to this URL whenever a hosted
 * pmxt API key is supplied (via `pmxtApiKey` kwarg or the
 * `PMXT_API_KEY` environment variable) AND no explicit `baseUrl` /
 * `PMXT_BASE_URL` is configured.
 */
export const HOSTED_URL = "https://api.pmxt.dev";

/**
 * The local sidecar default.
 *
 * This is the URL the SDK uses when no hosted key and no explicit
 * override are present. It matches the port that the pmxt-core
 * sidecar listens on by default.
 */
export const LOCAL_URL = "http://localhost:3847";

/**
 * Environment variable names. Centralised so tests and docs can
 * reference a single source of truth.
 */
export const ENV = {
    BASE_URL: "PMXT_BASE_URL",
    API_KEY: "PMXT_API_KEY",
} as const;

/**
 * Resolve the effective base URL for an SDK client, following the
 * documented precedence rules:
 *
 *   1. Explicit `baseUrl` argument wins.
 *   2. `PMXT_BASE_URL` environment variable.
 *   3. If a hosted API key is present (argument or `PMXT_API_KEY` env),
 *      default to {@link HOSTED_URL}.
 *   4. Otherwise, default to {@link LOCAL_URL}.
 *
 * Returns both the resolved URL and an `isHosted` flag (true iff the
 * resolved URL is anything other than the local sidecar default).
 */
export function resolvePmxtBaseUrl(args: {
    baseUrl?: string;
    pmxtApiKey?: string;
    env?: NodeJS.ProcessEnv;
}): { baseUrl: string; pmxtApiKey?: string; isHosted: boolean } {
    const env = args.env ?? (typeof process !== "undefined" ? process.env : {});
    const pmxtApiKey = args.pmxtApiKey ?? env[ENV.API_KEY] ?? undefined;

    const pick = (url: string) => ({
        baseUrl: url,
        pmxtApiKey,
        isHosted: url !== LOCAL_URL,
    });

    if (args.baseUrl) return pick(args.baseUrl);
    if (env[ENV.BASE_URL]) return pick(env[ENV.BASE_URL] as string);
    if (pmxtApiKey) return pick(HOSTED_URL);
    return pick(LOCAL_URL);
}

/**
 * Lowercase 0x-prefixed escrow addresses that are pre-funded by pmxt for
 * hosted trading. Orders routed through these addresses use the shared
 * escrow balance rather than a per-venue deposit.
 */
export const PREFUNDED_ESCROW_ADDRESSES: ReadonlySet<string> = new Set([
    "0x3ad326f78b1390b9a5dc5f00e7f62f8632de23e2",
]);

/**
 * Lowercase 0x-prefixed escrow addresses that the hosted trading API treats
 * as venue-owned escrows. Currently empty; populated as venues onboard.
 */
export const VENUE_ESCROW_ADDRESSES: ReadonlySet<string> = new Set<string>();
