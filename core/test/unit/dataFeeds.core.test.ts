import { ExchangeNotAvailable, NotSupported } from '../../src/errors';
import { BinanceFeed } from '../../src/feeds/binance';
import { normalizeTradeToTicker } from '../../src/feeds/binance/normalizer';
import { BinanceRelayTradeEvent } from '../../src/feeds/binance/types';
import { ChainlinkFeed } from '../../src/feeds/chainlink/chainlink-feed';
import { Ticker } from '../../src/feeds/types';

class TestBinanceFeed extends BinanceFeed {
    async connect(): Promise<void> {}

    cacheTicker(ticker: Ticker): void {
        const internals = this as unknown as { latestTickers: Map<string, Ticker> };
        internals.latestTickers.set(ticker.symbol, ticker);
    }

    emitTrade(event: BinanceRelayTradeEvent): void {
        const internals = this as unknown as { handleMessage(data: string): void };
        internals.handleMessage(JSON.stringify(event));
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

    test('Binance normalizes symbol case for cached and watched tickers', async () => {
        const feed = new TestBinanceFeed({ wsUrl: '', apiKey: '' });
        const event: BinanceRelayTradeEvent = {
            op: 'event',
            source: 'binance',
            symbol: 'BTCUSDT',
            trade_id: 1,
            price: '65000',
            quantity: '0.01',
            event_time_ms: 1_700_000_000_000,
            trade_time_ms: 1_700_000_000_000,
            is_buyer_maker: false,
            timestamp_received_ms: 1_700_000_000_001,
        };
        const ticker = normalizeTradeToTicker(event);
        feed.cacheTicker(ticker);

        await expect(feed.fetchTicker('btc/usdt')).resolves.toBe(ticker);

        const callback = jest.fn();
        const unsubscribe = feed.watchTicker('btc/usdt', callback);
        feed.emitTrade(event);

        expect(callback).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'BTC/USDT' }));
        unsubscribe();
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
