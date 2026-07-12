import {
    EventFetchParams,
    MarketFetchParams,
    PredictionMarketExchange,
} from '../../src/BaseExchange';
import { UnifiedEvent, UnifiedMarket } from '../../src/types';

const MARKET_A = { id: 'market-a', title: 'Market A' } as UnifiedMarket;
const MARKET_B = { id: 'market-b', title: 'Market B' } as UnifiedMarket;
const EVENT_A = { id: 'event-a', title: 'Event A', markets: [] } as unknown as UnifiedEvent;
const EVENT_B = { id: 'event-b', title: 'Event B', markets: [] } as unknown as UnifiedEvent;

class RecordingExchange extends PredictionMarketExchange {
    marketCalls: ReadonlyArray<MarketFetchParams | undefined> = [];
    eventCalls: ReadonlyArray<EventFetchParams> = [];

    override get name(): string {
        return 'Recording';
    }

    protected override async fetchMarketsImpl(params?: MarketFetchParams): Promise<UnifiedMarket[]> {
        this.marketCalls = [...this.marketCalls, params];
        return [MARKET_A, MARKET_B];
    }

    protected override async fetchEventsImpl(params: EventFetchParams): Promise<UnifiedEvent[]> {
        this.eventCalls = [...this.eventCalls, params];
        return [EVENT_A, EVENT_B];
    }
}

describe('BaseExchange public read bounds', () => {
    it('forwards simple market limits to venue implementations', async () => {
        const exchange = new RecordingExchange();

        const markets = await exchange.fetchMarkets({ limit: 1 });

        expect(markets).toEqual([MARKET_A]);
        expect(exchange.marketCalls).toEqual([{ limit: 1 }]);
    });

    it('forwards simple event limits to venue implementations', async () => {
        const exchange = new RecordingExchange();

        const events = await exchange.fetchEvents({ limit: 1 });

        expect(events).toEqual([EVENT_A]);
        expect(exchange.eventCalls).toEqual([{ limit: 1 }]);
    });

    it('keeps offset-only slicing in the base layer', async () => {
        const exchange = new RecordingExchange();

        const markets = await exchange.fetchMarkets({ limit: 1, offset: 1 });

        expect(markets).toEqual([MARKET_B]);
        expect(exchange.marketCalls).toEqual([undefined]);
    });
});
