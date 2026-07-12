import { KalshiRawCandlestick } from '../../src/exchanges/kalshi/fetcher';
import { KalshiNormalizer } from '../../src/exchanges/kalshi/normalizer';

const normalizer = new KalshiNormalizer();

describe('Kalshi OHLCV normalization', () => {
    test('parses new-API dollar-denominated price strings (regression: close was 0)', () => {
        const raw: KalshiRawCandlestick = {
            end_period_ts: 1_720_000_000,
            volume_fp: '1234.5',
            price: {
                open_dollars: '0.9500',
                high_dollars: '0.9800',
                low_dollars: '0.9400',
                close_dollars: '0.9700',
                mean_dollars: '0.9600',
            },
        };

        const [candle] = normalizer.normalizeOHLCV([raw], {});

        expect(candle.close).toBe(0.97);
        expect(candle.open).toBe(0.95);
        expect(candle.high).toBe(0.98);
        expect(candle.low).toBe(0.94);
        expect(candle.volume).toBeCloseTo(1234.5);
        expect(candle.timestamp).toBe(1_720_000_000 * 1000);
    });

    test('falls back to legacy cent-denominated integer fields', () => {
        const raw: KalshiRawCandlestick = {
            end_period_ts: 1_720_000_060,
            volume: 42,
            price: { open: 50, high: 60, low: 40, close: 55 },
        };

        const [candle] = normalizer.normalizeOHLCV([raw], {});

        expect(candle.open).toBe(0.5);
        expect(candle.high).toBe(0.6);
        expect(candle.low).toBe(0.4);
        expect(candle.close).toBe(0.55);
        expect(candle.volume).toBe(42);
    });

    test('averages yes_ask/yes_bid dollars when price is missing', () => {
        const raw: KalshiRawCandlestick = {
            end_period_ts: 1_720_000_120,
            volume_fp: '0',
            yes_ask: { close_dollars: '0.6000' },
            yes_bid: { close_dollars: '0.5800' },
        };

        const [candle] = normalizer.normalizeOHLCV([raw], {});

        expect(candle.close).toBeCloseTo(0.59);
    });
});
