import axios from 'axios';
import { HistoryFilterParams } from '../../BaseExchange';
import { PriceCandle } from '../../types';
import { LIMITLESS_API_URL, mapIntervalToFidelity } from './utils';
import { validateIdFormat } from '../../utils/validation';
import { limitlessErrorMapper } from './errors';

/**
 * Fetch historical price data (candles) for a specific market.
 * @param id - The market slug
 */
export async function fetchOHLCV(id: string, params: HistoryFilterParams): Promise<PriceCandle[]> {
    validateIdFormat(id, 'OHLCV');

    try {
        const fidelity = mapIntervalToFidelity(params.resolution);

        // New API endpoint: /markets/{slug}/historical-price
        const url = `${LIMITLESS_API_URL}/markets/${id}/historical-price`;

        const response = await axios.get(url, {
            params: { fidelity }
        });

        const data = response.data;
        const prices = data.prices || [];

        // Map price points to pmxt PriceCandle format
        // The API returns price points, so we treat each point as a candle
        let candles = prices.map((p: any) => {
            const price = Number(p.price);
            const ts = Number(p.timestamp);

            return {
                timestamp: ts,
                open: price,
                high: price,
                low: price,
                close: price,
                volume: 0 // Volume not provided in this specific endpoint
            };
        }).sort((a: any, b: any) => a.timestamp - b.timestamp);

        if (params.start) {
            candles = candles.filter((c: any) => c.timestamp >= params.start!.getTime());
        }
        if (params.end) {
            candles = candles.filter((c: any) => c.timestamp <= params.end!.getTime());
        }
        if (params.limit) {
            candles = candles.slice(0, params.limit);
        }

        return candles;

    } catch (error: any) {
        throw limitlessErrorMapper.mapError(error);
    }
}
