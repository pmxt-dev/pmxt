import axios from 'axios';
import { HistoryFilterParams } from '../../BaseExchange';
import { PriceCandle } from '../../types';
import { CLOB_API_URL, mapIntervalToFidelity } from './utils';
import { validateIdFormat, validateOutcomeId } from '../../utils/validation';
import { polymarketErrorMapper } from './errors';

/**
 * Fetch historical price data (OHLCV candles) for a specific token.
 * @param id - The CLOB token ID (e.g., outcome token ID)
 */
export async function fetchOHLCV(id: string, params: HistoryFilterParams): Promise<PriceCandle[]> {
    validateIdFormat(id, 'OHLCV');
    validateOutcomeId(id, 'OHLCV');

    try {
        const fidelity = mapIntervalToFidelity(params.resolution);
        const nowTs = Math.floor(Date.now() / 1000);

        // 1. Smart Lookback Calculation
        // If start/end not provided, calculate window based on limit * resolution

        // Helper to handle string dates (from JSON)
        // IMPORTANT: Python sends naive datetimes as ISO strings without 'Z' suffix.
        // We must treat these as UTC, not local time.
        const ensureDate = (d: any) => {
            if (typeof d === 'string') {
                // If string doesn't end with 'Z' and doesn't have timezone offset, append 'Z'
                if (!d.endsWith('Z') && !d.match(/[+-]\d{2}:\d{2}$/)) {
                    return new Date(d + 'Z');
                }
                return new Date(d);
            }
            return d;
        };
        const pStart = params.start ? ensureDate(params.start) : undefined;
        const pEnd = params.end ? ensureDate(params.end) : undefined;

        let startTs = pStart ? Math.floor(pStart.getTime() / 1000) : 0;
        let endTs = pEnd ? Math.floor(pEnd.getTime() / 1000) : nowTs;

        if (!pStart) {
            // Default limit is usually 20 in the example, but safety margin is good.
            // If limit is not set, we default to 100 candles.
            const count = params.limit || 100;
            // fidelity is in minutes. 
            const durationSeconds = count * fidelity * 60;
            startTs = endTs - durationSeconds;
        }

        const queryParams: any = {
            market: id,
            fidelity: fidelity,
            startTs: startTs,
            endTs: endTs
        };

        const response = await axios.get(`${CLOB_API_URL}/prices-history`, {
            params: queryParams
        });

        const history = response.data.history || [];

        // 2. Align Timestamps (Snap to Grid)
        // Polymarket returns random tick timestamps (e.g. 1:00:21).
        // We want to normalize this to the start of the bucket (1:00:00).
        const resolutionMs = fidelity * 60 * 1000;

        // 2. Client-side Aggregation
        // Polymarket returns tick data. We must group by time bucket to create true candles.
        const buckets = new Map<number, PriceCandle>();

        history.forEach((item: any) => {
            const rawMs = item.t * 1000;
            const snappedMs = Math.floor(rawMs / resolutionMs) * resolutionMs;
            const price = Number(item.p);
            const volume = Number(item.s || item.v || 0); // specific field depends on api, usually 's' for size

            if (!buckets.has(snappedMs)) {
                buckets.set(snappedMs, {
                    timestamp: snappedMs,
                    open: price,
                    high: price,
                    low: price,
                    close: price,
                    volume: volume
                });
            } else {
                const candle = buckets.get(snappedMs)!;
                candle.high = Math.max(candle.high, price);
                candle.low = Math.min(candle.low, price);
                candle.close = price; // Assuming history is sorted by time. If not, we need to track timestamps.
                candle.volume = (candle.volume || 0) + volume;

                // If history is not guaranteed sorted, we should track first/last timestamps per bucket.
                // But usually /prices-history is sorted. We'll assume sorted for efficiency.
            }
        });

        const candles: PriceCandle[] = Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);

        // Apply limit if specified
        if (params.limit && candles.length > params.limit) {
            return candles.slice(-params.limit);
        }

        return candles;

    } catch (error: any) {
        throw polymarketErrorMapper.mapError(error);
    }
}
