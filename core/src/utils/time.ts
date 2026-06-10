/** Shared time-related defaults and conversion helpers. */

/**
 * Values below this threshold are treated as epoch seconds; values at or above
 * it are treated as epoch milliseconds.
 *
 * 10_000_000_000 seconds is in year 2286, so contemporary epoch-second
 * timestamps are safely below it while contemporary epoch-ms timestamps are
 * safely above it.
 */
export const EPOCH_SECONDS_THRESHOLD = 10_000_000_000;

/** Standard reconnect backoff used by exchange WebSocket clients. */
export const DEFAULT_RECONNECT_INTERVAL_MS = 5_000;

export function timestampToMs(timestamp: number): number {
    return timestamp < EPOCH_SECONDS_THRESHOLD ? timestamp * 1000 : timestamp;
}

export function timestampToSeconds(timestamp: number): number {
    return timestamp >= EPOCH_SECONDS_THRESHOLD ? timestamp / 1000 : timestamp;
}
