import { ExchangeNotAvailable, NotSupported } from '../../src/errors';
import { BinanceFeed } from '../../src/feeds/binance';
import { ChainlinkFeed } from '../../src/feeds/chainlink/chainlink-feed';

describe('Data feed backend errors', () => {
    test('Binance fetchTicker names the missing relay URL setting', async () => {
        const feed = new BinanceFeed({ wsUrl: '', apiKey: '' });

        await expect(feed.fetchTicker('BTC/USDT')).rejects.toMatchObject({
            code: 'EXCHANGE_NOT_AVAILABLE',
            message: expect.stringContaining('BINANCE_RELAY_WS_URL'),
            status: 503,
        } satisfies Partial<ExchangeNotAvailable>);
    });

    test('Binance unsupported order book returns a capability error', async () => {
        const feed = new BinanceFeed({ wsUrl: '', apiKey: '' });

        await expect(feed.fetchOrderBook('BTC/USDT')).rejects.toMatchObject({
            code: 'NOT_SUPPORTED',
            status: 501,
        } satisfies Partial<NotSupported>);
    });

    test('Chainlink oracle calls name the missing REST API URL setting', async () => {
        const feed = new ChainlinkFeed({ baseUrl: '', apiKey: '', wsUrl: '' });

        await expect(feed.fetchOracleRound({ feed: 'BTC/USD' })).rejects.toMatchObject({
            code: 'EXCHANGE_NOT_AVAILABLE',
            message: expect.stringContaining('CHAINLINK_API_URL'),
            status: 503,
        } satisfies Partial<ExchangeNotAvailable>);
    });

    test('Chainlink unsupported order book returns a capability error', async () => {
        const feed = new ChainlinkFeed({ baseUrl: '', apiKey: '', wsUrl: '' });

        await expect(feed.fetchOrderBook('BTC/USD')).rejects.toMatchObject({
            code: 'NOT_SUPPORTED',
            status: 501,
        } satisfies Partial<NotSupported>);
    });
});
