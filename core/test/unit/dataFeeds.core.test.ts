import { ExchangeNotAvailable, NotSupported } from '../../src/errors';
import { BinanceFeed } from '../../src/feeds/binance';
import { ChainlinkFeed } from '../../src/feeds/chainlink/chainlink-feed';
import { Ticker } from '../../src/feeds/types';

class TestBinanceFeed extends BinanceFeed {
    subscribe(symbol: string, callback: (ticker: Ticker) => void) {
        return this.watchTickerImpl(symbol, callback);
    }
    setCachedTicker(ticker: Ticker) {
        (this as any).latestTickers.set(ticker.symbol, ticker);
    }
}

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

    test('Binance watchTicker normalizes symbol case', async () => {
        const feed = new TestBinanceFeed({ wsUrl: '', apiKey: '' });
        const callback = jest.fn<(ticker: Ticker) => void>();

        feed.subscribe('btc/usdt', callback);

        const subscriptions = (feed as any).subscriptions;

        expect(subscriptions[0].symbol).toBe('BTC/USDT');

        await feed.close();
    });

        test('Binance fetchTicker normalizes symbol case', async () => {
        const feed = new TestBinanceFeed({ wsUrl: '', apiKey: '' });
        const ticker = {
            symbol: 'BTC/USDT',
            info: {},
            timestamp: undefined,
            datetime: undefined,
            high: undefined,
            low: undefined,
            bid: undefined,
            bidVolume: undefined,
            ask: undefined,
            askVolume: undefined,
            vwap: undefined,
            open: undefined,
            close: 50000,
            last: 50000,
            previousClose: undefined,
            change: undefined,
            percentage: undefined,
            average: undefined,
            quoteVolume: undefined,
            baseVolume: undefined,
            indexPrice: undefined,
            markPrice: undefined,
        } satisfies Ticker;

        feed.setCachedTicker(ticker);

        await expect(feed.fetchTicker('btc/usdt')).resolves.toBe(ticker);

        await feed.close();
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