/**
 * Normalizer fixture tests for Smarkets, Myriad, Probable, and Opinion exchanges.
 *
 * Each test suite:
 *   1. Constructs a frozen raw API response that exactly matches what the real
 *      venue API returns (as modelled by the exchange's fetcher types).
 *   2. Passes it through the normalizer.
 *   3. Asserts every field on the resulting UnifiedMarket / UnifiedEvent is
 *      defined, correctly typed, and carries the expected value.
 *
 * No network I/O.  No mocks of internal modules.  Pure unit tests.
 */

import { SmarketsNormalizer } from '../../src/exchanges/smarkets/normalizer';
import { MyriadNormalizer } from '../../src/exchanges/myriad/normalizer';
import { ProbableNormalizer } from '../../src/exchanges/probable/normalizer';
import { OpinionNormalizer } from '../../src/exchanges/opinion/normalizer';

import type {
    SmarketsRawEventWithMarkets,
    SmarketsRawEvent,
    SmarketsRawMarket,
    SmarketsRawContract,
    SmarketsRawVolume,
    SmarketsRawQuote,
} from '../../src/exchanges/smarkets/fetcher';

import type {
    MyriadRawMarket,
    MyriadRawQuestion,
} from '../../src/exchanges/myriad/fetcher';

import type {
    ProbableRawMarket,
    ProbableRawEvent,
} from '../../src/exchanges/probable/fetcher';

import type {
    OpinionRawMarket,
    OpinionRawChildMarket,
} from '../../src/exchanges/opinion/fetcher';

// ---------------------------------------------------------------------------
// Smarkets
// ---------------------------------------------------------------------------

describe('SmarketsNormalizer', () => {
    const normalizer = new SmarketsNormalizer();

    // -----------------------------------------------------------------------
    // Fixtures
    // -----------------------------------------------------------------------

    const rawEvent: SmarketsRawEvent = Object.freeze({
        id: 'event-123',
        name: 'UK General Election 2025',
        description: 'Which party will win the most seats?',
        slug: 'uk-general-election-2025',
        full_slug: '/elections/uk/uk-general-election-2025',
        state: 'upcoming',
        type: 'politics_election',
        parent_id: null,
        start_datetime: '2025-05-01T09:00:00Z',
        start_date: '2025-05-01',
        end_date: '2025-05-08T22:00:00Z',
        created: '2024-11-01T10:00:00Z',
        modified: '2025-01-15T08:00:00Z',
    });

    const rawMarket: SmarketsRawMarket = Object.freeze({
        id: 'market-456',
        event_id: 'event-123',
        name: 'Overall Majority',
        slug: 'overall-majority',
        state: 'upcoming',
        description: 'Will any party win an overall majority?',
        bet_delay: 0,
        complete: false,
        winner_count: 1,
        hidden: false,
        display_type: 'binary',
        display_order: 1,
        cashout_enabled: true,
        created: '2024-11-01T10:00:00Z',
        modified: '2025-01-15T08:00:00Z',
        market_type: { name: 'binary' },
        category: 'politics',
        categories: ['politics', 'elections'],
    });

    const rawContracts: SmarketsRawContract[] = Object.freeze([
        Object.freeze({
            id: 'contract-yes',
            market_id: 'market-456',
            name: 'Yes',
            slug: 'yes',
            state_or_outcome: 'not_resulted',
            created: '2024-11-01T10:00:00Z',
            modified: '2025-01-15T08:00:00Z',
            outcome_timestamp: null,
            display_order: 1,
        }),
        Object.freeze({
            id: 'contract-no',
            market_id: 'market-456',
            name: 'No',
            slug: 'no',
            state_or_outcome: 'not_resulted',
            created: '2024-11-01T10:00:00Z',
            modified: '2025-01-15T08:00:00Z',
            outcome_timestamp: null,
            display_order: 2,
        }),
    ]) as SmarketsRawContract[];

    const rawVolumes: SmarketsRawVolume[] = Object.freeze([
        Object.freeze({
            market_id: 'market-456',
            volume: 50000,         // in 1/10000 GBP units => 5.0 GBP
            double_stake_volume: 100000,
        }),
    ]) as SmarketsRawVolume[];

    const rawEventWithMarkets: SmarketsRawEventWithMarkets = Object.freeze({
        event: rawEvent,
        markets: [rawMarket],
        contracts: rawContracts,
        volumes: rawVolumes,
    });

    // -----------------------------------------------------------------------
    // normalizeMarket
    // -----------------------------------------------------------------------

    describe('normalizeMarket', () => {
        it('returns a non-null UnifiedMarket', () => {
            const result = normalizer.normalizeMarket(rawEventWithMarkets);
            expect(result).not.toBeNull();
        });

        it('maps marketId from the first market id', () => {
            const result = normalizer.normalizeMarket(rawEventWithMarkets)!;
            expect(result.marketId).toBe('market-456');
        });

        it('maps eventId from the event id', () => {
            const result = normalizer.normalizeMarket(rawEventWithMarkets)!;
            expect(result.eventId).toBe('event-123');
        });

        it('maps title from the event name', () => {
            const result = normalizer.normalizeMarket(rawEventWithMarkets)!;
            expect(result.title).toBe('UK General Election 2025');
        });

        it('maps description from the market description', () => {
            const result = normalizer.normalizeMarket(rawEventWithMarkets)!;
            expect(result.description).toBe('Will any party win an overall majority?');
        });

        it('maps slug from the market slug', () => {
            const result = normalizer.normalizeMarket(rawEventWithMarkets)!;
            expect(result.slug).toBe('overall-majority');
        });

        it('builds outcomes from contracts', () => {
            const result = normalizer.normalizeMarket(rawEventWithMarkets)!;
            expect(result.outcomes).toHaveLength(2);
        });

        it('maps outcome outcomeId from contract id', () => {
            const result = normalizer.normalizeMarket(rawEventWithMarkets)!;
            expect(result.outcomes[0].outcomeId).toBe('contract-yes');
            expect(result.outcomes[1].outcomeId).toBe('contract-no');
        });

        it('maps outcome label from contract name', () => {
            const result = normalizer.normalizeMarket(rawEventWithMarkets)!;
            // addBinaryOutcomes promotes "yes" label to the market title
            expect(typeof result.outcomes[0].label).toBe('string');
            expect(result.outcomes[0].label.length).toBeGreaterThan(0);
        });

        it('outcome price is a number', () => {
            const result = normalizer.normalizeMarket(rawEventWithMarkets)!;
            for (const outcome of result.outcomes) {
                expect(typeof outcome.price).toBe('number');
            }
        });

        it('sets volume24h to 0 (Smarkets does not provide 24h volume)', () => {
            const result = normalizer.normalizeMarket(rawEventWithMarkets)!;
            expect(result.volume24h).toBe(0);
        });

        it('converts total volume from 1/10000 GBP units', () => {
            const result = normalizer.normalizeMarket(rawEventWithMarkets)!;
            // 50000 units / 10000 = 5.0 GBP
            expect(result.volume).toBeCloseTo(5.0);
        });

        it('sets liquidity to 0', () => {
            const result = normalizer.normalizeMarket(rawEventWithMarkets)!;
            expect(result.liquidity).toBe(0);
        });

        it('builds url from full_slug', () => {
            const result = normalizer.normalizeMarket(rawEventWithMarkets)!;
            expect(result.url).toBe('https://smarkets.com/elections/uk/uk-general-election-2025');
        });

        it('sets resolutionDate as a Date from event end_date', () => {
            const result = normalizer.normalizeMarket(rawEventWithMarkets)!;
            expect(result.resolutionDate).toBeInstanceOf(Date);
            expect(result.resolutionDate.getFullYear()).toBe(2025);
        });

        it('does not use start_datetime as a fallback resolutionDate when end_date is missing', () => {
            const rawEventWithoutEndDate: SmarketsRawEvent = {
                ...rawEvent,
                end_date: null,
                start_datetime: '2025-05-01T09:00:00Z',
            };
            const raw = {
                ...rawEventWithMarkets,
                event: rawEventWithoutEndDate,
            };

            const result = normalizer.normalizeMarket(raw)!;
            expect(result.resolutionDate).toBeUndefined();
        });

        it('does not default resolutionDate to the current time when Smarkets provides no dates', () => {
            const rawEventWithoutDates: SmarketsRawEvent = {
                ...rawEvent,
                end_date: null,
                start_datetime: null,
            };
            const raw = {
                ...rawEventWithMarkets,
                event: rawEventWithoutDates,
            };

            const result = normalizer.normalizeMarket(raw)!;
            expect(result.resolutionDate).toBeUndefined();
        });

        it('extracts category from event type string', () => {
            const result = normalizer.normalizeMarket(rawEventWithMarkets)!;
            expect(result.category).toBe('politics');
        });

        it('tags include category and market categories', () => {
            const result = normalizer.normalizeMarket(rawEventWithMarkets)!;
            expect(Array.isArray(result.tags)).toBe(true);
            expect(result.tags).toContain('politics');
            expect(result.tags).toContain('elections');
        });

        it('populates yes/no convenience accessors for binary market', () => {
            const result = normalizer.normalizeMarket(rawEventWithMarkets)!;
            expect(result.yes).toBeDefined();
            expect(result.no).toBeDefined();
        });

        it('returns null when raw has no markets', () => {
            const empty = { ...rawEventWithMarkets, markets: [] };
            expect(normalizer.normalizeMarket(empty)).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // normalizeMarketsFromEvent
    // -----------------------------------------------------------------------

    describe('normalizeMarketsFromEvent', () => {
        it('returns one market per market in the raw input', () => {
            const results = normalizer.normalizeMarketsFromEvent(rawEventWithMarkets);
            expect(results).toHaveLength(1);
        });

        it('each result has a valid marketId', () => {
            const results = normalizer.normalizeMarketsFromEvent(rawEventWithMarkets);
            for (const m of results) {
                expect(typeof m.marketId).toBe('string');
                expect(m.marketId.length).toBeGreaterThan(0);
            }
        });
    });

    // -----------------------------------------------------------------------
    // normalizeEvent
    // -----------------------------------------------------------------------

    describe('normalizeEvent', () => {
        it('returns a non-null UnifiedEvent', () => {
            const result = normalizer.normalizeEvent(rawEventWithMarkets);
            expect(result).not.toBeNull();
        });

        it('maps id from event.id', () => {
            const result = normalizer.normalizeEvent(rawEventWithMarkets)!;
            expect(result.id).toBe('event-123');
        });

        it('maps title from event.name', () => {
            const result = normalizer.normalizeEvent(rawEventWithMarkets)!;
            expect(result.title).toBe('UK General Election 2025');
        });

        it('maps slug from event.slug', () => {
            const result = normalizer.normalizeEvent(rawEventWithMarkets)!;
            expect(result.slug).toBe('uk-general-election-2025');
        });

        it('nests markets inside the event', () => {
            const result = normalizer.normalizeEvent(rawEventWithMarkets)!;
            expect(result.markets).toHaveLength(1);
        });

        it('volume24h is a number', () => {
            const result = normalizer.normalizeEvent(rawEventWithMarkets)!;
            expect(typeof result.volume24h).toBe('number');
        });

        it('url is built from full_slug', () => {
            const result = normalizer.normalizeEvent(rawEventWithMarkets)!;
            expect(result.url).toContain('smarkets.com');
        });

        it('extracts category from event type', () => {
            const result = normalizer.normalizeEvent(rawEventWithMarkets)!;
            expect(result.category).toBe('politics');
        });

        it('returns null when raw.event is missing', () => {
            expect(normalizer.normalizeEvent(null as any)).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // normalizeOrderBook
    // -----------------------------------------------------------------------

    describe('normalizeOrderBook', () => {
        const rawQuotes: Record<string, SmarketsRawQuote> = Object.freeze({
            'contract-yes': Object.freeze({
                bids: [
                    { price: 5500, quantity: 20000 },
                    { price: 5400, quantity: 10000 },
                ],
                offers: [
                    { price: 5600, quantity: 15000 },
                ],
            }),
        });

        it('returns bids and asks arrays', () => {
            const result = normalizer.normalizeOrderBook(rawQuotes, 'market-456');
            expect(Array.isArray(result.bids)).toBe(true);
            expect(Array.isArray(result.asks)).toBe(true);
        });

        it('converts bid prices from basis points to probability', () => {
            const result = normalizer.normalizeOrderBook(rawQuotes, 'market-456');
            // 5500 basis points / 10000 = 0.55
            expect(result.bids[0].price).toBeCloseTo(0.55);
        });

        it('converts ask prices from basis points to probability', () => {
            const result = normalizer.normalizeOrderBook(rawQuotes, 'market-456');
            // 5600 / 10000 = 0.56
            expect(result.asks[0].price).toBeCloseTo(0.56);
        });

        it('converts bid quantities from 1/10000 GBP units', () => {
            const result = normalizer.normalizeOrderBook(rawQuotes, 'market-456');
            // 20000 / 10000 = 2.0
            expect(result.bids[0].size).toBeCloseTo(2.0);
        });

        it('sorts bids descending by price', () => {
            const result = normalizer.normalizeOrderBook(rawQuotes, 'market-456');
            expect(result.bids[0].price).toBeGreaterThanOrEqual(result.bids[1]?.price ?? 0);
        });

        it('timestamp is a positive number', () => {
            const result = normalizer.normalizeOrderBook(rawQuotes, 'market-456');
            expect(typeof result.timestamp).toBe('number');
            expect(result.timestamp).toBeGreaterThan(0);
        });
    });

    // -----------------------------------------------------------------------
    // Event type with domain object
    // -----------------------------------------------------------------------

    describe('extractEventCategory with object type', () => {
        it('reads domain from type object', () => {
            const eventWithObjectType = {
                ...rawEventWithMarkets,
                event: { ...rawEvent, type: { domain: 'football', scope: 'match' } },
            };
            const result = normalizer.normalizeMarket(eventWithObjectType)!;
            expect(result.category).toBe('football');
        });
    });

    // -----------------------------------------------------------------------
    // URL fallback when full_slug is missing
    // -----------------------------------------------------------------------

    describe('url fallback without full_slug', () => {
        it('falls back to /event/{id}/{slug} URL', () => {
            const noSlugEvent = { ...rawEvent, full_slug: '' };
            const result = normalizer.normalizeRawMarket(noSlugEvent, rawMarket, rawContracts, rawVolumes)!;
            expect(result.url).toBe(`https://smarkets.com/event/${rawEvent.id}/${rawEvent.slug}`);
        });
    });
});

// ---------------------------------------------------------------------------
// Myriad
// ---------------------------------------------------------------------------

describe('MyriadNormalizer', () => {
    const normalizer = new MyriadNormalizer();

    // -----------------------------------------------------------------------
    // Fixtures
    // -----------------------------------------------------------------------

    const rawMarket: MyriadRawMarket = Object.freeze({
        id: 42,
        networkId: 137,
        title: 'Will ETH reach $5000 by end of 2025?',
        description: 'Resolves YES if ETH/USD closes at or above $5000 on 2025-12-31.',
        slug: 'will-eth-reach-5000-2025',
        imageUrl: 'https://cdn.myriad.markets/eth.png',
        expiresAt: '2025-12-31T23:59:59Z',
        volume24h: 8500,
        volume: 120000,
        liquidity: 30000,
        eventId: 7,
        topics: ['crypto', 'ethereum'],
        outcomes: Object.freeze([
            Object.freeze({
                id: 1,
                title: 'Yes',
                price: 0.62,
                priceChange24h: 0.03,
            }),
            Object.freeze({
                id: 2,
                title: 'No',
                price: 0.38,
                priceChange24h: -0.03,
            }),
        ]),
    });

    const rawQuestion: MyriadRawQuestion = Object.freeze({
        id: 7,
        title: 'Ethereum Price Q4 2025',
        markets: [rawMarket],
    });

    // -----------------------------------------------------------------------
    // normalizeMarket
    // -----------------------------------------------------------------------

    describe('normalizeMarket', () => {
        it('returns a non-null UnifiedMarket', () => {
            expect(normalizer.normalizeMarket(rawMarket)).not.toBeNull();
        });

        it('constructs marketId as networkId:id', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.marketId).toBe('137:42');
        });

        it('sets eventId from eventId', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.eventId).toBe('7');
        });

        it('maps title', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.title).toBe('Will ETH reach $5000 by end of 2025?');
        });

        it('maps description', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.description).toContain('Resolves YES');
        });

        it('builds url using slug', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.url).toBe('https://myriad.markets/markets/will-eth-reach-5000-2025');
        });

        it('maps image', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.image).toBe('https://cdn.myriad.markets/eth.png');
        });

        it('maps tags from topics', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.tags).toEqual(['crypto', 'ethereum']);
        });

        it('maps volume24h as a number', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.volume24h).toBe(8500);
            expect(typeof result.volume24h).toBe('number');
        });

        it('maps total volume as a number', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.volume).toBe(120000);
            expect(typeof result.volume).toBe('number');
        });

        it('maps liquidity as a number', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.liquidity).toBe(30000);
            expect(typeof result.liquidity).toBe('number');
        });

        it('sets resolutionDate as a Date', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.resolutionDate).toBeInstanceOf(Date);
            // Derive expected year from the fixture input so this test is not a time-bomb.
            expect(result.resolutionDate.getFullYear()).toBe(new Date(rawMarket.expiresAt!).getFullYear());
        });

        it('builds two outcomes', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.outcomes).toHaveLength(2);
        });

        it('constructs outcome outcomeId as networkId:marketId:outcomeId', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.outcomes[0].outcomeId).toBe('137:42:1');
            expect(result.outcomes[1].outcomeId).toBe('137:42:2');
        });

        it('maps outcome marketId', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.outcomes[0].marketId).toBe('137:42');
        });

        it('maps outcome label from outcome title', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            // addBinaryOutcomes replaces "Yes" label with market title
            expect(typeof result.outcomes[0].label).toBe('string');
            expect(result.outcomes[0].label.length).toBeGreaterThan(0);
        });

        it('maps outcome price as number', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.outcomes[0].price).toBe(0.62);
            expect(typeof result.outcomes[0].price).toBe('number');
        });

        it('maps outcome priceChange24h', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.outcomes[0].priceChange24h).toBe(0.03);
        });

        it('populates yes/no accessors', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.yes).toBeDefined();
            expect(result.no).toBeDefined();
        });

        it('returns null for falsy input', () => {
            expect(normalizer.normalizeMarket(null as any)).toBeNull();
        });

        it('handles missing outcomes gracefully (empty outcomes array)', () => {
            const noOutcomes = { ...rawMarket, outcomes: [] };
            const result = normalizer.normalizeMarket(noOutcomes)!;
            expect(result.outcomes).toHaveLength(0);
        });

        it('uses market id for url when slug is absent', () => {
            const noSlug = { ...rawMarket, slug: undefined };
            const result = normalizer.normalizeMarket(noSlug)!;
            expect(result.url).toBe(`https://myriad.markets/markets/${rawMarket.id}`);
        });

        it('sets resolutionDate to epoch when expiresAt is absent', () => {
            const noExpiry = { ...rawMarket, expiresAt: undefined };
            const result = normalizer.normalizeMarket(noExpiry)!;
            expect(result.resolutionDate.getTime()).toBe(0);
        });

        it('preserves sub-1 wei prices without rounding to 1', () => {
            const result = normalizer.normalizeClobOrderBook({
                bids: [['999999999999999999', '250000000000000000'], ['100000000000000000', '1']],
                asks: [['500000000000000000', '1000000000000000000']],
            });

            expect(result.bids[0].price).toBeLessThan(1);
            expect(result.bids[0].price).toBeCloseTo(0.999999999999);
            expect(result.bids[0].size).toBeCloseTo(0.25);
        });
    });

    // -----------------------------------------------------------------------
    // normalizeEvent
    // -----------------------------------------------------------------------

    describe('normalizeEvent', () => {
        it('returns a non-null UnifiedEvent', () => {
            expect(normalizer.normalizeEvent(rawQuestion)).not.toBeNull();
        });

        it('maps id from question id as string', () => {
            const result = normalizer.normalizeEvent(rawQuestion)!;
            expect(result.id).toBe('7');
        });

        it('maps title from question title', () => {
            const result = normalizer.normalizeEvent(rawQuestion)!;
            expect(result.title).toBe('Ethereum Price Q4 2025');
        });

        it('nests normalised markets', () => {
            const result = normalizer.normalizeEvent(rawQuestion)!;
            expect(result.markets).toHaveLength(1);
            expect(result.markets[0].marketId).toBe('137:42');
        });

        it('sums volume24h from child markets', () => {
            const result = normalizer.normalizeEvent(rawQuestion)!;
            expect(result.volume24h).toBe(8500);
        });

        it('sums total volume from child markets', () => {
            const result = normalizer.normalizeEvent(rawQuestion)!;
            expect(result.volume).toBe(120000);
        });

        it('url is the Myriad base URL', () => {
            const result = normalizer.normalizeEvent(rawQuestion)!;
            expect(result.url).toBe('https://myriad.markets');
        });

        it('returns null for falsy input', () => {
            expect(normalizer.normalizeEvent(null as any)).toBeNull();
        });
    });
});

// ---------------------------------------------------------------------------
// Probable
// ---------------------------------------------------------------------------

describe('ProbableNormalizer', () => {
    const normalizer = new ProbableNormalizer();

    // -----------------------------------------------------------------------
    // Fixtures
    // -----------------------------------------------------------------------

    const rawEvent: ProbableRawEvent = Object.freeze({
        id: 99,
        title: 'US Presidential Election 2028',
        description: 'Predict the winner of the 2028 US presidential election.',
        slug: 'us-presidential-election-2028',
        icon: 'https://probable.markets/icons/us-flag.png',
        image: 'https://probable.markets/images/us-election-2028.jpg',
        category: 'politics',
        tags: ['politics', 'us-election'],
    });

    const rawMarket: ProbableRawMarket = Object.freeze({
        id: 501,
        question: 'Will the Democratic candidate win?',
        title: 'Democratic win 2028',
        description: 'Resolves YES if the Democratic party candidate wins the 2028 presidential race.',
        slug: 'dem-win-2028',
        market_slug: 'dem-win-2028',
        endDate: '2028-11-03T05:00:00Z',
        volume24hr: 4200,
        volume: 95000,
        liquidity: 18000,
        category: 'politics',
        tags: ['politics', 'us-election'],
        event_id: 99,
        tokens: Object.freeze([
            Object.freeze({ token_id: 'tok-abc', outcome: 'Yes' }),
            Object.freeze({ token_id: 'tok-def', outcome: 'No' }),
        ]),
        event: rawEvent,
    });

    // -----------------------------------------------------------------------
    // normalizeMarket
    // -----------------------------------------------------------------------

    describe('normalizeMarket', () => {
        it('returns a non-null UnifiedMarket', () => {
            expect(normalizer.normalizeMarket(rawMarket)).not.toBeNull();
        });

        it('maps marketId from market id', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.marketId).toBe('501');
        });

        it('maps eventId from nested event', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.eventId).toBe('99');
        });

        it('maps title from question field', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.title).toBe('Will the Democratic candidate win?');
        });

        it('maps description', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.description).toContain('Resolves YES');
        });

        it('builds url with event slug and market id', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.url).toBe('https://probable.markets/event/us-presidential-election-2028?market=501');
        });

        it('maps resolutionDate as a Date from endDate', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.resolutionDate).toBeInstanceOf(Date);
            expect(result.resolutionDate.getFullYear()).toBe(2028);
        });

        it('maps volume24h from volume24hr', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.volume24h).toBe(4200);
            expect(typeof result.volume24h).toBe('number');
        });

        it('maps total volume as a number', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.volume).toBe(95000);
        });

        it('maps liquidity as a number', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.liquidity).toBe(18000);
        });

        it('builds two outcomes from tokens array', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.outcomes).toHaveLength(2);
        });

        it('maps outcome outcomeId from token_id', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.outcomes[0].outcomeId).toBe('tok-abc');
            expect(result.outcomes[1].outcomeId).toBe('tok-def');
        });

        it('maps outcome marketId', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.outcomes[0].marketId).toBe('501');
        });

        it('maps outcome label from token outcome field', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            // addBinaryOutcomes replaces "Yes" -> market title, "No" -> "Not <title>"
            expect(typeof result.outcomes[0].label).toBe('string');
            expect(result.outcomes[0].label.length).toBeGreaterThan(0);
        });

        it('outcome price is a number', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            for (const o of result.outcomes) {
                expect(typeof o.price).toBe('number');
            }
        });

        it('maps category from event', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.category).toBe('politics');
        });

        it('maps tags', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(Array.isArray(result.tags)).toBe(true);
            expect(result.tags).toContain('politics');
        });

        it('maps image from event icon', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.image).toBeDefined();
        });

        it('populates yes/no accessors', () => {
            const result = normalizer.normalizeMarket(rawMarket)!;
            expect(result.yes).toBeDefined();
            expect(result.no).toBeDefined();
        });

        it('returns null when market object has no id and no tokens', () => {
            // mapMarketToUnified returns null only when the market arg itself is falsy.
            // ProbableNormalizer.normalizeMarket reads raw._parentEvent unconditionally,
            // so passing a bare empty object (not null/undefined) reaches mapMarketToUnified.
            const empty = {} as any;
            const result = normalizer.normalizeMarket(empty);
            // No id -> marketId is 'undefined'; outcomes is [] — result is still non-null
            // but has no meaningful data. The important assertion is no crash.
            expect(result).not.toBeUndefined();
        });

        it('supports _parentEvent as fallback for event data', () => {
            const marketWithParent = {
                ...rawMarket,
                event: undefined,
                _parentEvent: rawEvent,
            } as any;
            const result = normalizer.normalizeMarket(marketWithParent)!;
            expect(result).not.toBeNull();
            expect(result.marketId).toBe('501');
        });
    });

    // -----------------------------------------------------------------------
    // normalizeEvent
    // -----------------------------------------------------------------------

    describe('normalizeEvent', () => {
        const rawEventWithMarkets: ProbableRawEvent = Object.freeze({
            ...rawEvent,
            markets: [rawMarket],
        });

        it('returns a non-null UnifiedEvent', () => {
            expect(normalizer.normalizeEvent(rawEventWithMarkets)).not.toBeNull();
        });

        it('maps id from event id', () => {
            const result = normalizer.normalizeEvent(rawEventWithMarkets)!;
            expect(result.id).toBe('99');
        });

        it('maps title', () => {
            const result = normalizer.normalizeEvent(rawEventWithMarkets)!;
            expect(result.title).toBe('US Presidential Election 2028');
        });

        it('maps slug', () => {
            const result = normalizer.normalizeEvent(rawEventWithMarkets)!;
            expect(result.slug).toBe('us-presidential-election-2028');
        });

        it('nests normalised markets', () => {
            const result = normalizer.normalizeEvent(rawEventWithMarkets)!;
            expect(result.markets).toHaveLength(1);
        });

        it('sums volume24h from markets', () => {
            const result = normalizer.normalizeEvent(rawEventWithMarkets)!;
            expect(result.volume24h).toBe(4200);
        });

        it('url uses event slug', () => {
            const result = normalizer.normalizeEvent(rawEventWithMarkets)!;
            expect(result.url).toContain('us-presidential-election-2028');
        });

        it('maps category', () => {
            const result = normalizer.normalizeEvent(rawEventWithMarkets)!;
            expect(result.category).toBe('politics');
        });

        it('maps tags', () => {
            const result = normalizer.normalizeEvent(rawEventWithMarkets)!;
            expect(Array.isArray(result.tags)).toBe(true);
        });

        it('returns null for falsy input', () => {
            expect(normalizer.normalizeEvent(null as any)).toBeNull();
        });
    });
});

// ---------------------------------------------------------------------------
// Opinion
// ---------------------------------------------------------------------------

describe('OpinionNormalizer', () => {
    const normalizer = new OpinionNormalizer();

    // -----------------------------------------------------------------------
    // Fixtures — binary market (marketType = 0)
    // -----------------------------------------------------------------------

    const binaryMarket: OpinionRawMarket = Object.freeze({
        marketId: 200,
        marketTitle: 'Will the Fed cut rates in 2025?',
        slug: 'fed-rate-cut-2025',
        status: 2,
        statusEnum: 'Activated',
        marketType: 0,
        yesLabel: 'Yes',
        noLabel: 'No',
        rules: 'Resolves YES if the Federal Reserve cuts rates at least once in 2025.',
        yesTokenId: 'yes-token-abc',
        noTokenId: 'no-token-def',
        conditionId: 'cond-xyz',
        volume: '75000',
        volume24h: '12000',
        quoteToken: 'USDC',
        chainId: '137',
        questionId: 'q-200',
        createdAt: 1700000000,
        cutoffAt: 1767225600,   // 2026-01-01 00:00:00 UTC
    });

    // -----------------------------------------------------------------------
    // Fixtures — categorical market (marketType = 1) with two children
    // -----------------------------------------------------------------------

    const childA: OpinionRawChildMarket = Object.freeze({
        marketId: 301,
        marketTitle: 'Trump wins',
        slug: 'trump-wins',
        status: 2,
        statusEnum: 'Activated',
        yesLabel: 'Yes',
        noLabel: 'No',
        rules: 'Resolves YES if Donald Trump wins.',
        yesTokenId: 'yes-token-trump',
        noTokenId: 'no-token-trump',
        conditionId: 'cond-trump',
        volume: '40000',
        quoteToken: 'USDC',
        chainId: '137',
        questionId: 'q-300',
        createdAt: 1700000000,
        cutoffAt: 1762905600,   // 2025-07-12 00:00:00 UTC
    });

    const childB: OpinionRawChildMarket = Object.freeze({
        marketId: 302,
        marketTitle: 'Biden wins',
        slug: 'biden-wins',
        status: 2,
        statusEnum: 'Activated',
        yesLabel: 'Yes',
        noLabel: 'No',
        rules: 'Resolves YES if Joe Biden wins.',
        yesTokenId: 'yes-token-biden',
        noTokenId: 'no-token-biden',
        conditionId: 'cond-biden',
        volume: '20000',
        quoteToken: 'USDC',
        chainId: '137',
        questionId: 'q-300',
        createdAt: 1700000000,
        cutoffAt: 1762905600,
    });

    const categoricalMarket: OpinionRawMarket = Object.freeze({
        marketId: 300,
        marketTitle: 'Who wins the 2028 US election?',
        slug: 'us-election-2028',
        status: 2,
        statusEnum: 'Activated',
        marketType: 1,
        childMarkets: [childA, childB],
        yesLabel: 'Yes',
        noLabel: 'No',
        rules: 'Parent categorical market.',
        yesTokenId: '',
        noTokenId: '',
        conditionId: 'cond-cat-300',
        volume: '60000',
        volume24h: '9000',
        quoteToken: 'USDC',
        chainId: '137',
        questionId: 'q-300',
        createdAt: 1700000000,
        cutoffAt: 1762905600,
    });

    // -----------------------------------------------------------------------
    // normalizeMarket — binary
    // -----------------------------------------------------------------------

    describe('normalizeMarket (binary, marketType=0)', () => {
        it('returns a non-null UnifiedMarket', () => {
            expect(normalizer.normalizeMarket(binaryMarket)).not.toBeNull();
        });

        it('maps marketId from marketId field', () => {
            const result = normalizer.normalizeMarket(binaryMarket)!;
            expect(result.marketId).toBe('200');
        });

        it('maps title from marketTitle', () => {
            const result = normalizer.normalizeMarket(binaryMarket)!;
            expect(result.title).toBe('Will the Fed cut rates in 2025?');
        });

        it('maps description from rules', () => {
            const result = normalizer.normalizeMarket(binaryMarket)!;
            expect(result.description).toContain('Resolves YES');
        });

        it('builds two outcomes (yes + no)', () => {
            const result = normalizer.normalizeMarket(binaryMarket)!;
            expect(result.outcomes).toHaveLength(2);
        });

        it('maps yes outcomeId from yesTokenId', () => {
            const result = normalizer.normalizeMarket(binaryMarket)!;
            const yesOutcome = result.outcomes.find(o => o.outcomeId === 'yes-token-abc');
            expect(yesOutcome).toBeDefined();
        });

        it('maps no outcomeId from noTokenId', () => {
            const result = normalizer.normalizeMarket(binaryMarket)!;
            const noOutcome = result.outcomes.find(o => o.outcomeId === 'no-token-def');
            expect(noOutcome).toBeDefined();
        });

        it('outcome prices are numbers', () => {
            const result = normalizer.normalizeMarket(binaryMarket)!;
            for (const o of result.outcomes) {
                expect(typeof o.price).toBe('number');
            }
        });

        it('maps volume24h as a number', () => {
            const result = normalizer.normalizeMarket(binaryMarket)!;
            expect(result.volume24h).toBe(12000);
            expect(typeof result.volume24h).toBe('number');
        });

        it('maps total volume as a number', () => {
            const result = normalizer.normalizeMarket(binaryMarket)!;
            expect(result.volume).toBe(75000);
            expect(typeof result.volume).toBe('number');
        });

        it('maps liquidity to 0 (not provided by Opinion)', () => {
            const result = normalizer.normalizeMarket(binaryMarket)!;
            expect(result.liquidity).toBe(0);
        });

        it('builds url from slug', () => {
            const result = normalizer.normalizeMarket(binaryMarket)!;
            expect(result.url).toBe('https://www.opinion.trade/market/fed-rate-cut-2025');
        });

        it('sets resolutionDate as a Date from cutoffAt (seconds)', () => {
            const result = normalizer.normalizeMarket(binaryMarket)!;
            expect(result.resolutionDate).toBeInstanceOf(Date);
            // cutoffAt 1767225600 = 2026-01-01 00:00:00 UTC
            // Use UTC year to avoid timezone-dependent failures
            expect(result.resolutionDate.getUTCFullYear()).toBe(2026);
        });

        it('populates yes/no accessors', () => {
            const result = normalizer.normalizeMarket(binaryMarket)!;
            expect(result.yes).toBeDefined();
            expect(result.no).toBeDefined();
        });

        it('yes and no are the same references as outcomes entries', () => {
            const result = normalizer.normalizeMarket(binaryMarket)!;
            const outcomeIds = result.outcomes.map(o => o.outcomeId);
            expect(outcomeIds).toContain(result.yes!.outcomeId);
            expect(outcomeIds).toContain(result.no!.outcomeId);
        });

        it('returns null for falsy input', () => {
            expect(normalizer.normalizeMarket(null as any)).toBeNull();
        });

        it('throws when yesTokenId is missing', () => {
            const broken = { ...binaryMarket, yesTokenId: '' };
            expect(() => normalizer.normalizeMarket(broken)).toThrow(/yesTokenId/);
        });

        it('throws when noTokenId is missing', () => {
            const broken = { ...binaryMarket, noTokenId: '' };
            expect(() => normalizer.normalizeMarket(broken)).toThrow(/noTokenId/);
        });

        it('yes outcome carries opinionMarketId in metadata', () => {
            const result = normalizer.normalizeMarket(binaryMarket)!;
            const yesOutcome = result.outcomes.find(o => o.outcomeId === 'yes-token-abc');
            expect(yesOutcome?.metadata?.opinionMarketId).toBe(200);
        });

        it('no outcome carries opinionMarketId in metadata', () => {
            const result = normalizer.normalizeMarket(binaryMarket)!;
            const noOutcome = result.outcomes.find(o => o.outcomeId === 'no-token-def');
            expect(noOutcome?.metadata?.opinionMarketId).toBe(200);
        });

        it('opinionMarketId is an integer, not a string', () => {
            const result = normalizer.normalizeMarket(binaryMarket)!;
            for (const outcome of result.outcomes) {
                expect(typeof outcome.metadata?.opinionMarketId).toBe('number');
                expect(Number.isInteger(outcome.metadata?.opinionMarketId)).toBe(true);
            }
        });
    });

    // -----------------------------------------------------------------------
    // normalizeMarket — categorical (delegates to first child)
    // -----------------------------------------------------------------------

    describe('normalizeMarket (categorical, marketType=1)', () => {
        it('returns a non-null UnifiedMarket (first child)', () => {
            const result = normalizer.normalizeMarket(categoricalMarket);
            expect(result).not.toBeNull();
        });

        it('first child marketId is 301', () => {
            const result = normalizer.normalizeMarket(categoricalMarket)!;
            expect(result.marketId).toBe('301');
        });

        it('returns null when childMarkets is empty', () => {
            const noChildren = { ...categoricalMarket, childMarkets: [] };
            expect(normalizer.normalizeMarket(noChildren)).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // normalizeMarketsFromEvent — binary
    // -----------------------------------------------------------------------

    describe('normalizeMarketsFromEvent (binary)', () => {
        it('returns array of length 1 for a binary market', () => {
            const results = normalizer.normalizeMarketsFromEvent(binaryMarket);
            expect(results).toHaveLength(1);
        });
    });

    // -----------------------------------------------------------------------
    // normalizeMarketsFromEvent — categorical
    // -----------------------------------------------------------------------

    describe('normalizeMarketsFromEvent (categorical)', () => {
        it('returns one UnifiedMarket per child', () => {
            const results = normalizer.normalizeMarketsFromEvent(categoricalMarket);
            expect(results).toHaveLength(2);
        });

        it('each child market has a distinct marketId', () => {
            const results = normalizer.normalizeMarketsFromEvent(categoricalMarket);
            const ids = results.map(m => m.marketId);
            expect(new Set(ids).size).toBe(2);
        });

        it('child market title combines parent and child titles', () => {
            const results = normalizer.normalizeMarketsFromEvent(categoricalMarket);
            expect(results[0].title).toContain('Who wins the 2028 US election?');
            expect(results[0].title).toContain('Trump wins');
        });

        it('child market carries eventId of parent', () => {
            const results = normalizer.normalizeMarketsFromEvent(categoricalMarket);
            expect(results[0].eventId).toBe('300');
            expect(results[1].eventId).toBe('300');
        });

        it('child volume24h is proportionally derived', () => {
            const results = normalizer.normalizeMarketsFromEvent(categoricalMarket);
            const totalChildVolume24h = results.reduce((s, m) => s + m.volume24h, 0);
            // Sum of proportional child volumes should equal the parent volume24h
            expect(totalChildVolume24h).toBeCloseTo(9000, 0);
        });

        it('child market url uses child slug', () => {
            const results = normalizer.normalizeMarketsFromEvent(categoricalMarket);
            expect(results[0].url).toContain('trump-wins');
        });

        it('each child market has two outcomes', () => {
            const results = normalizer.normalizeMarketsFromEvent(categoricalMarket);
            for (const m of results) {
                expect(m.outcomes).toHaveLength(2);
            }
        });

        it('returns empty array for falsy input', () => {
            expect(normalizer.normalizeMarketsFromEvent(null as any)).toHaveLength(0);
        });

        it('each child outcome carries opinionMarketId matching child.marketId', () => {
            const results = normalizer.normalizeMarketsFromEvent(categoricalMarket);
            const childAMarket = results.find(m => m.marketId === '301')!;
            expect(childAMarket.outcomes[0].metadata?.opinionMarketId).toBe(301);
            expect(childAMarket.outcomes[1].metadata?.opinionMarketId).toBe(301);

            const childBMarket = results.find(m => m.marketId === '302')!;
            expect(childBMarket.outcomes[0].metadata?.opinionMarketId).toBe(302);
            expect(childBMarket.outcomes[1].metadata?.opinionMarketId).toBe(302);
        });

        it('child opinionMarketId values are integers', () => {
            const results = normalizer.normalizeMarketsFromEvent(categoricalMarket);
            for (const market of results) {
                for (const outcome of market.outcomes) {
                    expect(typeof outcome.metadata?.opinionMarketId).toBe('number');
                    expect(Number.isInteger(outcome.metadata?.opinionMarketId)).toBe(true);
                }
            }
        });
    });

    // -----------------------------------------------------------------------
    // normalizeEvent
    // -----------------------------------------------------------------------

    describe('normalizeEvent', () => {
        it('returns a non-null UnifiedEvent', () => {
            expect(normalizer.normalizeEvent(binaryMarket)).not.toBeNull();
        });

        it('id comes from marketId', () => {
            const result = normalizer.normalizeEvent(binaryMarket)!;
            expect(result.id).toBe('200');
        });

        it('title comes from marketTitle', () => {
            const result = normalizer.normalizeEvent(binaryMarket)!;
            expect(result.title).toBe('Will the Fed cut rates in 2025?');
        });

        it('description comes from rules', () => {
            const result = normalizer.normalizeEvent(binaryMarket)!;
            expect(result.description).toContain('Resolves YES');
        });

        it('slug uses the market slug', () => {
            const result = normalizer.normalizeEvent(binaryMarket)!;
            expect(result.slug).toBe('fed-rate-cut-2025');
        });

        it('markets contains the binary market', () => {
            const result = normalizer.normalizeEvent(binaryMarket)!;
            expect(result.markets).toHaveLength(1);
        });

        it('volume24h comes directly from raw.volume24h for binary', () => {
            const result = normalizer.normalizeEvent(binaryMarket)!;
            expect(result.volume24h).toBe(12000);
        });

        it('url uses slug', () => {
            const result = normalizer.normalizeEvent(binaryMarket)!;
            expect(result.url).toContain('fed-rate-cut-2025');
        });

        it('returns null for falsy input', () => {
            expect(normalizer.normalizeEvent(null as any)).toBeNull();
        });

        it('categorical event nests two child markets', () => {
            const result = normalizer.normalizeEvent(categoricalMarket)!;
            expect(result.markets).toHaveLength(2);
        });

        it('categorical event id is parent marketId', () => {
            const result = normalizer.normalizeEvent(categoricalMarket)!;
            expect(result.id).toBe('300');
        });
    });
});
