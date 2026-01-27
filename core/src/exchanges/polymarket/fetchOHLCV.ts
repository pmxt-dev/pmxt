import axios from 'axios';
import { HistoryFilterParams } from '../../BaseExchange';
import { PriceCandle } from '../../types';
import { CLOB_API_URL, mapIntervalToFidelity } from './utils';

/**
 * Fetch historical price data (OHLCV candles) for a specific token.
 * @param id - The CLOB token ID (e.g., outcome token ID)
 */
export async function fetchOHLCV(id: string, params: HistoryFilterParams): Promise<PriceCandle[]> {
    // ID Validation: Polymarket CLOB requires a Token ID (long numeric string) not a Market ID
    if (id.length < 10 && /^\d+$/.test(id)) {
        throw new Error(`Invalid ID for Polymarket history: "${id}". You provided a Market ID, but Polymarket's CLOB API requires a Token ID. Ensure you are using 'outcome.id'.`);
    }

    try {
        const fidelity = mapIntervalToFidelity(params.resolution);
        const nowTs = Math.floor(Date.now() / 1000);

        // 1. Smart Lookback Calculation
        // If start/end not provided, calculate window based on limit * resolution

        // Helper to handle string dates (from JSON)
        const ensureDate = (d: any) => (typeof d === 'string' ? new Date(d) : d);
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

        const candles: PriceCandle[] = history.map((item: any) => {
            const rawMs = item.t * 1000;
            const snappedMs = Math.floor(rawMs / resolutionMs) * resolutionMs;

            return {
                timestamp: snappedMs, // Aligned timestamp
                open: item.p,
                high: item.p,
                low: item.p,
                close: item.p,
                volume: undefined
            };
        });

        // Apply limit if specified
        if (params.limit && candles.length > params.limit) {
            return candles.slice(-params.limit);
        }

        return candles;

    } catch (error: any) {
        if (axios.isAxiosError(error) && error.response) {
            const apiError = error.response.data?.error || error.response.data?.message || "Unknown API Error";
            throw new Error(`Polymarket History API Error (${error.response.status}): ${apiError}. Used ID: ${id}`);
        }
        console.error(`Unexpected error fetching Polymarket history for ${id}:`, error);
        throw error;
    }
}
