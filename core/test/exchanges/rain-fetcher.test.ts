import { RainFetcher } from '../../src/exchanges/rain/fetcher';
import { RainExchange } from '../../src/exchanges/rain';

describe('RainFetcher', () => {
    it('passes Rain SDK price-history params using marketAddress and option', async () => {
        const getPriceHistory = jest.fn().mockResolvedValue({ candles: [] });
        const sdk = {
            Rain: jest.fn().mockImplementation(() => ({ getPriceHistory })),
        };
        const fetcher = new RainFetcher({
            subgraphUrl: 'https://subgraph.example.test',
            sdk,
        } as any);

        await fetcher.fetchRawOHLCV('0x1111111111111111111111111111111111111111', 1, '1h', 50);

        expect(getPriceHistory).toHaveBeenCalledWith({
            marketAddress: '0x1111111111111111111111111111111111111111',
            interval: '1h',
            option: 1,
        });
    });

    it('resolves Rain market ids to contract addresses before fetching OHLCV', async () => {
        const exchange = new RainExchange();
        const fetchRawMarket = jest.fn().mockResolvedValue({
            details: { contractAddress: '0x2222222222222222222222222222222222222222' },
        });
        const fetchRawOHLCV = jest.fn().mockResolvedValue({ candles: [] });
        (exchange as any).fetcher = { fetchRawMarket, fetchRawOHLCV };

        await exchange.fetchOHLCV('rain:rain-market-id:2', { resolution: '1h', limit: 10 });

        expect(fetchRawMarket).toHaveBeenCalledWith('rain-market-id');
        expect(fetchRawOHLCV).toHaveBeenCalledWith(
            '0x2222222222222222222222222222222222222222',
            2,
            '1h',
            10,
        );
    });
});
