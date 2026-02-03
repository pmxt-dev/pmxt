import axios from 'axios';
import { HistoryFilterParams } from '../../BaseExchange';
import { PriceCandle } from '../../types';
import { mapIntervalToKalshi } from './utils';
import { validateIdFormat } from '../../utils/validation';
import { kalshiErrorMapper } from './errors';

export async function fetchOHLCV(id: string, params: HistoryFilterParams): Promise<PriceCandle[]> {
    validateIdFormat(id, 'OHLCV');

    try {
        // Kalshi API expects uppercase tickers
        // Handle virtual "-NO" suffix by stripping it (fetching the underlying market history)
        const cleanedId = id.replace(/-NO$/, '');
        const normalizedId = cleanedId.toUpperCase();
        const interval = mapIntervalToKalshi(params.resolution);

        // Heuristic for series_ticker
        const parts = normalizedId.split('-');
        if (parts.length < 2) {
            throw new Error(`Invalid Kalshi Ticker format: "${id}". Expected format like "FED-25JAN29-B4.75".`);
        }
        const seriesTicker = parts.slice(0, -1).join('-');
        const url = `https://api.elections.kalshi.com/trade-api/v2/series/${seriesTicker}/markets/${normalizedId}/candlesticks`;

        const queryParams: any = { period_interval: interval };

        const now = Math.floor(Date.now() / 1000);
        let startTs = now - (24 * 60 * 60);
        let endTs = now;

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

        if (pStart) {
            startTs = Math.floor(pStart.getTime() / 1000);
        }
        if (pEnd) {
            endTs = Math.floor(pEnd.getTime() / 1000);
            if (!pStart) {
                startTs = endTs - (24 * 60 * 60);
            }
        }

        queryParams.start_ts = startTs;
        queryParams.end_ts = endTs;

        const response = await axios.get(url, { params: queryParams });
        const candles = response.data.candlesticks || [];

        const mappedCandles: PriceCandle[] = candles.map((c: any) => {
            // Priority:
            // 1. Transaction price (close)
            // 2. Mid price (average of yes_ask and yes_bid close)
            // 3. Fallback to 0 if everything is missing

            const p = c.price || {};
            const ask = c.yes_ask || {};
            const bid = c.yes_bid || {};

            const getVal = (field: string) => {
                if (p[field] !== null && p[field] !== undefined) return p[field];
                if (ask[field] !== null && bid[field] !== null && ask[field] !== undefined && bid[field] !== undefined) {
                    return (ask[field] + bid[field]) / 2;
                }
                return p.previous || 0;
            };

            return {
                timestamp: c.end_period_ts * 1000,
                open: getVal('open') / 100,
                high: getVal('high') / 100,
                low: getVal('low') / 100,
                close: getVal('close') / 100,
                volume: c.volume || 0
            };
        });

        if (params.limit && mappedCandles.length > params.limit) {
            return mappedCandles.slice(-params.limit);
        }
        return mappedCandles;
    } catch (error: any) {
        throw kalshiErrorMapper.mapError(error);
    }
}
