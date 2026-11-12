import { OHLCVParams } from '../../BaseExchange';
import { ValidationError } from '../../errors';
import { PriceCandle } from '../../types';
import { parseOutcomeId } from './utils';

type CallApi = (operationId: string, params?: Record<string, any>) => Promise<any>;

const UNIT_MS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 };

export function resolutionToMs(resolution: string): number {
    const match = /^([1-9]\d*)([mhd])$/.exec(resolution ?? '');
    if (!match) {
        throw new ValidationError(
            `Unsupported resolution "${resolution}". Use <n>m, <n>h or <n>d, e.g. "1h".`,
            'resolution',
            'Gaduin',
        );
    }
    return Number(match[1]) * UNIT_MS[match[2]];
}

/**
 * Buckets GET /markets/{id}/price-history points (the outcome prices after
 * each trade) into candles. The API publishes no per-point volume.
 */
export async function fetchOHLCV(
    outcomeId: string,
    params: OHLCVParams,
    callApi: CallApi,
): Promise<PriceCandle[]> {
    const { marketId, idx } = parseOutcomeId(outcomeId);
    const step = resolutionToMs(params.resolution);
    const start = params.start?.getTime() ?? -Infinity;
    const end = params.end?.getTime() ?? Infinity;

    const data = await callApi('GetMarketPriceHistory', { id: marketId });
    const points = (data.points as { t: string; prices: number[] }[])
        .map((p) => ({ t: Date.parse(p.t), price: p.prices[idx] }))
        .filter((p) => p.price !== undefined && p.t >= start && p.t <= end)
        .sort((a, b) => a.t - b.t);

    const candles: PriceCandle[] = [];
    for (const { t, price } of points) {
        const timestamp = Math.floor(t / step) * step;
        const last = candles[candles.length - 1];
        if (last?.timestamp === timestamp) {
            last.high = Math.max(last.high, price);
            last.low = Math.min(last.low, price);
            last.close = price;
        } else {
            candles.push({ timestamp, open: price, high: price, low: price, close: price });
        }
    }
    return params.limit ? candles.slice(-params.limit) : candles;
}
