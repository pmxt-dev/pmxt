import { CandleInterval } from '../../types';

// Opinion market status codes
export const OPINION_MARKET_STATUS = {
    CREATED: 1,
    ACTIVATED: 2,
    RESOLVING: 3,
    RESOLVED: 4,
    FAILED: 5,
    DELETED: 6,
} as const;

// Opinion order status codes
export const OPINION_ORDER_STATUS = {
    PENDING: 1,
    FILLED: 2,
    CANCELED: 3,
    EXPIRED: 4,
    FAILED: 5,
} as const;

// Map pmxt status strings to Opinion API status filter values
export function mapStatusToOpinion(status: string): string | undefined {
    switch (status) {
        case 'active': return 'activated';
        case 'closed':
        case 'inactive': return 'resolved';
        default: return undefined; // 'all' -> no filter
    }
}

// Map pmxt sort to Opinion sortBy integer
export function mapSortToOpinion(sort?: string): number | undefined {
    switch (sort) {
        case 'volume': return 5;    // volume24h desc
        case 'liquidity': return 3; // volume desc (closest proxy)
        case 'newest': return 1;    // new
        default: return undefined;
    }
}

// Map pmxt CandleInterval to Opinion interval string.
// Opinion supports: 1m, 1h, 1d, 1w, max
export function mapIntervalToOpinion(interval: CandleInterval): string {
    const mapping: Record<CandleInterval, string> = {
        '1m': '1m',
        '5m': '1m',   // closest available
        '15m': '1h',  // closest available
        '1h': '1h',
        '6h': '1d',   // closest available
        '1d': '1d',
    };
    return mapping[interval];
}

// Map Opinion order status code to pmxt status string
export function mapOrderStatus(status: number): 'pending' | 'open' | 'filled' | 'canceled' | 'rejected' {
    switch (status) {
        case OPINION_ORDER_STATUS.PENDING: return 'pending';
        case OPINION_ORDER_STATUS.FILLED: return 'filled';
        case OPINION_ORDER_STATUS.CANCELED: return 'canceled';
        case OPINION_ORDER_STATUS.EXPIRED: return 'canceled'; // expired -> canceled
        case OPINION_ORDER_STATUS.FAILED: return 'rejected';   // failed -> rejected
        default: return 'pending';
    }
}

// Parse string number safely, returning 0 for invalid/empty
export function parseNumStr(value: string | undefined | null): number {
    if (!value) return 0;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
}

// Convert a raw timestamp to milliseconds.
// If the value is under 10_000_000_000 it is assumed to be in seconds.
// Returns null when the input is missing/zero so callers can distinguish
// "no timestamp" from "epoch" instead of coercing both to 1970-01-01.
export function toMillis(ts: number | undefined | null): number | null {
    if (!ts) return null;
    return ts < 10_000_000_000 ? ts * 1000 : ts;
}

// Return the bucket size in milliseconds for a given CandleInterval
export function intervalToMs(interval: CandleInterval): number {
    const map: Record<CandleInterval, number> = {
        '1m': 60_000,
        '5m': 300_000,
        '15m': 900_000,
        '1h': 3_600_000,
        '6h': 21_600_000,
        '1d': 86_400_000,
    };
    return map[interval];
}
