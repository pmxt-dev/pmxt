export const RAIN_DEFAULT_ENVIRONMENT = 'production' as const;
export const RAIN_BASE_URL = 'https://rain.one';
export const ARBITRUM_USDT = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
export const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
export const USDT_DECIMALS = 6;

const PRICE_SCALE = 10n ** 18n;
const PRECISION = 1_000_000;

export function priceBigIntToNumber(price: bigint | string | undefined | null): number {
    if (price == null) return 0;
    const p = typeof price === 'string' ? BigInt(price) : price;
    return Number((p * BigInt(PRECISION)) / PRICE_SCALE) / PRECISION;
}

export function weiToNumber(wei: bigint | string | undefined | null, decimals: number = USDT_DECIMALS): number {
    if (wei == null) return 0;
    const w = typeof wei === 'string' ? BigInt(wei) : wei;
    const scale = 10n ** BigInt(decimals);
    return Number((w * BigInt(PRECISION)) / scale) / PRECISION;
}

/**
 * Rain SDK returns `baseTokenDecimals` as the scale factor (e.g. 1000000n for
 * a 6-decimal token), not the decimal count. Detect and normalize to a count.
 */
export function resolveDecimals(raw: bigint | number | string | undefined | null, fallback: number = USDT_DECIMALS): number {
    if (raw == null) return fallback;
    const n = typeof raw === 'bigint' ? Number(raw) : Number(raw);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    // Heuristic: values <=36 are decimal counts; anything larger is a scale.
    if (n <= 36) return Math.round(n);
    const log = Math.log10(n);
    return Math.round(log);
}

export function mapRainStatus(status?: string): string | undefined {
    if (!status) return undefined;
    switch (status) {
        case 'Live':
        case 'New':
        case 'ClosingSoon':
        case 'Trading':
            return 'active';
        case 'WaitingForResult':
        case 'InReview':
        case 'InEvaluation':
            return 'resolving';
        case 'UnderDispute':
        case 'UnderAppeal':
            return 'disputed';
        case 'Closed':
            return 'closed';
        default:
            return status.toLowerCase();
    }
}

export function rainMarketUrl(marketId: string): string {
    return `https://rain.one/markets/${marketId}`;
}

/**
 * Recursively convert bigints to strings so the value is JSON-serialisable.
 * Rain's SDK returns bigints all over (timestamps, fund totals, prices), and
 * the PMXT server JSON.stringifies sourceMetadata before returning over HTTP.
 */
export function bigintsToStrings<T>(value: T): T {
    if (typeof value === 'bigint') {
        return value.toString() as unknown as T;
    }
    if (Array.isArray(value)) {
        return value.map(bigintsToStrings) as unknown as T;
    }
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            out[k] = bigintsToStrings(v);
        }
        return out as T;
    }
    return value;
}
