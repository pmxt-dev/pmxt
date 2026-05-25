/**
 * Normalizer fixture tests for Polymarket, Kalshi, and Limitless.
 *
 * Each test section:
 *   1. Creates a frozen raw API response fixture matching the real venue shape.
 *   2. Passes it through the normalizer under test.
 *   3. Asserts every significant field on the resulting UnifiedMarket/UnifiedEvent.
 *
 * No network calls, no mocks of external dependencies — the normalizers are
 * pure functions over plain objects.
 */

import { PolymarketNormalizer } from '../../src/exchanges/polymarket/normalizer';
import { KalshiNormalizer } from '../../src/exchanges/kalshi/normalizer';
import { LimitlessNormalizer } from '../../src/exchanges/limitless/normalizer';
import { UnifiedMarket, UnifiedEvent } from '../../src/types';
import { PolymarketRawEvent } from '../../src/exchanges/polymarket/fetcher';
import { KalshiRawEvent, KalshiRawMarket } from '../../src/exchanges/kalshi/fetcher';
import { LimitlessRawMarket, LimitlessRawEvent } from '../../src/exchanges/limitless/fetcher';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freeze<T>(obj: T): Readonly<T> {
    return Object.freeze(obj);
}

// ---------------------------------------------------------------------------
// POLYMARKET
// ---------------------------------------------------------------------------

describe('PolymarketNormalizer', () => {
    const normalizer = new PolymarketNormalizer();

    // A realistic binary-market event (BTC price prediction style)
    const rawEvent: Readonly<PolymarketRawEvent> = freeze({
        id: 'event-abc123',
        slug: 'will-btc-exceed-100k-dec-2025',
        title: 'Will BTC exceed $100k by Dec 2025?',
        description: 'This market resolves YES if Bitcoin closes above $100,000 on Dec 31 2025.',
        image: 'https://polymarket.com/img/btc.png',
        category: 'Crypto',
        active: true,
        closed: false,
        tags: [{ label: 'Bitcoin' }, { label: 'Crypto' }],
        markets: [
            {
                id: 'market-001',
                question: 'Will BTC exceed $100k by Dec 2025?',
                description: 'Resolves YES if BTC price closes above $100k on Dec 31 2025.',
                outcomes: '["Yes","No"]',
                outcomePrices: '["0.72","0.28"]',
                clobTokenIds: '["token-yes-001","token-no-001"]',
                groupItemTitle: null,
                endDate: '2025-12-31T23:59:59Z',
                volume24hr: 45000,
                volume: 1200000,
                liquidity: 85000,
                openInterest: 30000,
                oneDayPriceChange: 0.03,
                image: 'https://polymarket.com/img/btc-market.png',
                active: true,
                closed: false,
                archived: false,
                conditionId: '0xabc123def456',
                slug: 'will-btc-exceed-100k-dec-2025-yes',
                orderPriceMinTickSize: 0.01,
            },
        ],
    });

    describe('normalizeMarket', () => {
        let market: UnifiedMarket;

        beforeEach(() => {
            const result = normalizer.normalizeMarket(rawEvent);
            expect(result).not.toBeNull();
            market = result!;
        });

        it('maps id and marketId from the nested market id', () => {
            expect(market.id).toBe('market-001');
            expect(market.marketId).toBe('market-001');
        });

        it('maps eventId from the event id', () => {
            expect(market.eventId).toBe('event-abc123');
        });

        it('constructs title from event title and market question', () => {
            expect(market.title).toBe('Will BTC exceed $100k by Dec 2025? - Will BTC exceed $100k by Dec 2025?');
        });

        it('maps description from the market description', () => {
            expect(market.description).toBe('Resolves YES if BTC price closes above $100k on Dec 31 2025.');
        });

        it('maps slug from the market', () => {
            expect(market.slug).toBe('will-btc-exceed-100k-dec-2025-yes');
        });

        it('populates two outcomes', () => {
            expect(market.outcomes).toHaveLength(2);
        });

        it('maps outcome outcomeIds from clobTokenIds', () => {
            expect(market.outcomes[0].outcomeId).toBe('token-yes-001');
            expect(market.outcomes[1].outcomeId).toBe('token-no-001');
        });

        it('maps outcome labels from parsed outcomes JSON (addBinaryOutcomes promotes title into yes/no labels)', () => {
            // addBinaryOutcomes replaces a bare "Yes" label with the market title
            // and "No" with "Not <title>" so cross-venue comparisons can match by label.
            const expectedTitle = 'Will BTC exceed $100k by Dec 2025? - Will BTC exceed $100k by Dec 2025?';
            expect(market.outcomes[0].label).toBe(expectedTitle);
            expect(market.outcomes[1].label).toBe(`Not ${expectedTitle}`);
        });

        it('maps outcome prices as numbers (not strings)', () => {
            expect(typeof market.outcomes[0].price).toBe('number');
            expect(typeof market.outcomes[1].price).toBe('number');
            expect(market.outcomes[0].price).toBeCloseTo(0.72);
            expect(market.outcomes[1].price).toBeCloseTo(0.28);
        });

        it('maps priceChange24h on the first (yes) outcome', () => {
            expect(market.outcomes[0].priceChange24h).toBeCloseTo(0.03);
        });

        it('prices sum close to 1.0 for a binary market', () => {
            const sum = market.outcomes[0].price + market.outcomes[1].price;
            expect(sum).toBeCloseTo(1.0, 1);
        });

        it('resolutionDate is a Date object', () => {
            expect(market.resolutionDate).toBeInstanceOf(Date);
        });

        it('maps volume24h as a number', () => {
            expect(typeof market.volume24h).toBe('number');
            expect(market.volume24h).toBe(45000);
        });

        it('maps volume as a number', () => {
            expect(typeof market.volume).toBe('number');
            expect(market.volume).toBe(1200000);
        });

        it('maps liquidity as a number', () => {
            expect(typeof market.liquidity).toBe('number');
            expect(market.liquidity).toBe(85000);
        });

        it('maps openInterest as a number', () => {
            expect(typeof market.openInterest).toBe('number');
            expect(market.openInterest).toBe(30000);
        });

        it('maps url to polymarket event URL', () => {
            expect(market.url).toBe('https://polymarket.com/event/will-btc-exceed-100k-dec-2025');
        });

        it('maps image', () => {
            expect(typeof market.image).toBe('string');
            expect(market.image!.length).toBeGreaterThan(0);
        });

        it('maps category from the event', () => {
            expect(market.category).toBe('Crypto');
        });

        it('maps tags from event tags array', () => {
            expect(Array.isArray(market.tags)).toBe(true);
            expect(market.tags).toContain('Bitcoin');
            expect(market.tags).toContain('Crypto');
        });

        it('maps tickSize from orderPriceMinTickSize', () => {
            expect(market.tickSize).toBe(0.01);
        });

        it('maps status as active', () => {
            expect(market.status).toBe('active');
        });

        it('maps contractAddress from conditionId', () => {
            expect(market.contractAddress).toBe('0xabc123def456');
        });

        it('sets yes convenience accessor for binary market', () => {
            expect(market.yes).toBeDefined();
        });

        it('sets no convenience accessor for binary market', () => {
            expect(market.no).toBeDefined();
        });

        it('sets up convenience accessor (mirrors yes)', () => {
            expect(market.up).toBeDefined();
            expect(market.up).toBe(market.yes);
        });

        it('sets down convenience accessor (mirrors no)', () => {
            expect(market.down).toBeDefined();
            expect(market.down).toBe(market.no);
        });
    });

    describe('normalizeMarketsFromEvent', () => {
        it('returns one UnifiedMarket per nested market', () => {
            const markets = normalizer.normalizeMarketsFromEvent(rawEvent);
            expect(markets).toHaveLength(1);
        });

        it('returns empty array for event with no markets', () => {
            const result = normalizer.normalizeMarketsFromEvent({ slug: 'x', markets: [] });
            expect(result).toEqual([]);
        });

        it('returns empty array for null input', () => {
            const result = normalizer.normalizeMarketsFromEvent(null as any);
            expect(result).toEqual([]);
        });
    });

    describe('normalizeEvent', () => {
        let event: UnifiedEvent;

        beforeEach(() => {
            const result = normalizer.normalizeEvent(rawEvent);
            expect(result).not.toBeNull();
            event = result!;
        });

        it('maps id from event id', () => {
            expect(event.id).toBe('event-abc123');
        });

        it('maps slug', () => {
            expect(event.slug).toBe('will-btc-exceed-100k-dec-2025');
        });

        it('maps title', () => {
            expect(event.title).toBe('Will BTC exceed $100k by Dec 2025?');
        });

        it('maps description', () => {
            expect(event.description).toBe('This market resolves YES if Bitcoin closes above $100,000 on Dec 31 2025.');
        });

        it('populates nested markets array', () => {
            expect(Array.isArray(event.markets)).toBe(true);
            expect(event.markets).toHaveLength(1);
        });

        it('aggregates volume24h across nested markets', () => {
            expect(typeof event.volume24h).toBe('number');
            expect(event.volume24h).toBe(45000);
        });

        it('aggregates volume across nested markets when markets provide it', () => {
            expect(typeof event.volume).toBe('number');
            expect(event.volume).toBe(1200000);
        });

        it('maps url to polymarket event URL', () => {
            expect(event.url).toBe('https://polymarket.com/event/will-btc-exceed-100k-dec-2025');
        });

        it('maps image', () => {
            expect(event.image).toBe('https://polymarket.com/img/btc.png');
        });

        it('maps category', () => {
            expect(event.category).toBe('Crypto');
        });

        it('maps tags as string array', () => {
            expect(event.tags).toEqual(['Bitcoin', 'Crypto']);
        });
    });

    describe('normalizeMarket edge cases', () => {
        it('returns null for null input', () => {
            expect(normalizer.normalizeMarket(null as any)).toBeNull();
        });

        it('returns null for event with empty markets array', () => {
            expect(normalizer.normalizeMarket({ markets: [] } as any)).toBeNull();
        });

        it('handles outcomePrices already parsed as array', () => {
            const event: PolymarketRawEvent = {
                id: 'e1',
                slug: 'test',
                markets: [{
                    id: 'm1',
                    outcomes: ['Yes', 'No'],
                    outcomePrices: ['0.6', '0.4'],
                    clobTokenIds: ['tok-a', 'tok-b'],
                    endDate: '2026-01-01T00:00:00Z',
                }],
            };
            const result = normalizer.normalizeMarket(event);
            expect(result).not.toBeNull();
            expect(result!.outcomes[0].price).toBeCloseTo(0.6);
            expect(result!.outcomes[1].price).toBeCloseTo(0.4);
        });

        it('handles missing clobTokenIds by falling back to string index', () => {
            const event: PolymarketRawEvent = {
                id: 'e2',
                slug: 'no-tokens',
                markets: [{
                    id: 'm2',
                    outcomes: '["Yes","No"]',
                    outcomePrices: '["0.5","0.5"]',
                    endDate: '2026-01-01T00:00:00Z',
                }],
            };
            const result = normalizer.normalizeMarket(event);
            expect(result).not.toBeNull();
            expect(result!.outcomes[0].outcomeId).toBe('0');
            expect(result!.outcomes[1].outcomeId).toBe('1');
        });

        it('archived flag takes precedence over active for status', () => {
            const event: PolymarketRawEvent = {
                slug: 'archived-market',
                markets: [{
                    id: 'm3',
                    outcomes: '["Yes","No"]',
                    outcomePrices: '["0.5","0.5"]',
                    endDate: '2026-01-01T00:00:00Z',
                    archived: true,
                    active: true,
                    closed: false,
                }],
            };
            const result = normalizer.normalizeMarket(event);
            expect(result!.status).toBe('archived');
        });

        it('uses groupItemTitle as candidate name for outcome labels', () => {
            const event: PolymarketRawEvent = {
                id: 'e3',
                slug: 'candidate-event',
                title: 'Presidential Election',
                markets: [{
                    id: 'm4',
                    question: 'Will Candidate X win?',
                    outcomes: '["Yes","No"]',
                    outcomePrices: '["0.45","0.55"]',
                    clobTokenIds: '["tok-yes","tok-no"]',
                    groupItemTitle: 'Candidate X',
                    endDate: '2026-01-01T00:00:00Z',
                }],
            };
            const result = normalizer.normalizeMarket(event);
            expect(result).not.toBeNull();
            expect(result!.outcomes[0].label).toBe('Candidate X');
            expect(result!.outcomes[1].label).toBe('Not Candidate X');
        });
    });
});

// ---------------------------------------------------------------------------
// KALSHI
// ---------------------------------------------------------------------------

describe('KalshiNormalizer', () => {
    const normalizer = new KalshiNormalizer();

    const rawMarket: Readonly<KalshiRawMarket> = freeze({
        ticker: 'FED-25JAN29-B4.75',
        title: 'Will Fed funds be above 4.75% on Jan 29, 2025?',
        status: 'active',
        subtitle: 'Above 4.75%',
        yes_sub_title: 'Above 4.75%',
        last_price_dollars: '0.4540',
        yes_ask_dollars: '0.4600',
        yes_bid_dollars: '0.4500',
        previous_price_dollars: '0.4200',
        rules_primary: 'This market resolves YES if the Fed Funds Rate is above 4.75% on Jan 29, 2025.',
        rules_secondary: 'Data source: Federal Reserve',
        expiration_time: '2025-01-29T18:00:00Z',
        volume_24h: 12000,
        volume: 350000,
        volume_24h_fp: '12000.00',
        volume_fp: '350000.00',
        open_interest_fp: '8500.00',
        open_interest: 8500,
        liquidity: 5000,
        close_time: '2025-01-29T18:00:00Z',
    });

    const rawEvent: Readonly<KalshiRawEvent> = freeze({
        event_ticker: 'FED-25JAN29',
        title: 'Fed Funds Rate Decision - January 2025',
        image_url: 'https://kalshi.com/img/fed.png',
        category: 'Economics',
        tags: ['Federal Reserve', 'Interest Rates'],
        series_ticker: 'FED',
        markets: [rawMarket as KalshiRawMarket],
    });

    describe('normalizeRawMarket', () => {
        let market: UnifiedMarket;

        beforeEach(() => {
            const result = normalizer.normalizeRawMarket(rawEvent, rawMarket as KalshiRawMarket);
            expect(result).not.toBeNull();
            market = result!;
        });

        it('maps id and marketId from ticker', () => {
            expect(market.id).toBe('FED-25JAN29-B4.75');
            expect(market.marketId).toBe('FED-25JAN29-B4.75');
        });

        it('maps eventId from event_ticker', () => {
            expect(market.eventId).toBe('FED-25JAN29');
        });

        it('prefers market title over event title', () => {
            expect(market.title).toBe('Will Fed funds be above 4.75% on Jan 29, 2025?');
        });

        it('falls back to event title when market title is absent', () => {
            const result = normalizer.normalizeRawMarket(rawEvent, {
                ...rawMarket,
                title: undefined,
            } as KalshiRawMarket);
            expect(result!.title).toBe('Fed Funds Rate Decision - January 2025');
        });

        it('maps slug from ticker', () => {
            expect(market.slug).toBe('FED-25JAN29-B4.75');
        });

        it('maps status from raw market status', () => {
            expect(market.status).toBe('active');
        });

        it('maps description from rules_primary', () => {
            expect(market.description).toContain('Fed Funds Rate');
        });

        it('populates two outcomes for a binary market', () => {
            expect(market.outcomes).toHaveLength(2);
        });

        it('maps yes outcome outcomeId to ticker', () => {
            expect(market.outcomes[0].outcomeId).toBe('FED-25JAN29-B4.75');
        });

        it('maps no outcome outcomeId to ticker-NO', () => {
            expect(market.outcomes[1].outcomeId).toBe('FED-25JAN29-B4.75-NO');
        });

        it('maps yes outcome label from yes_sub_title', () => {
            expect(market.outcomes[0].label).toBe('Above 4.75%');
        });

        it('maps no outcome label as Not + yes_sub_title', () => {
            expect(market.outcomes[1].label).toBe('Not Above 4.75%');
        });

        it('computes yes price from last_price_dollars as a number', () => {
            expect(typeof market.outcomes[0].price).toBe('number');
            expect(market.outcomes[0].price).toBeCloseTo(0.454);
        });

        it('computes no price as 1 - yes price', () => {
            expect(typeof market.outcomes[1].price).toBe('number');
            expect(market.outcomes[1].price).toBeCloseTo(1 - 0.454);
        });

        it('maps priceChange24h as last_price_dollars - previous_price_dollars', () => {
            expect(market.outcomes[0].priceChange24h).toBeCloseTo(0.454 - 0.42);
        });

        it('maps no priceChange24h as negated yes change', () => {
            expect(market.outcomes[1].priceChange24h).toBeCloseTo(-(0.454 - 0.42));
        });

        it('resolutionDate is a Date object', () => {
            expect(market.resolutionDate).toBeInstanceOf(Date);
        });

        it('maps volume24h preferring volume_24h_fp as a number', () => {
            expect(typeof market.volume24h).toBe('number');
            expect(market.volume24h).toBe(12000);
        });

        it('maps volume preferring volume_fp as a number', () => {
            expect(typeof market.volume).toBe('number');
            expect(market.volume).toBe(350000);
        });

        it('maps openInterest preferring open_interest_fp as a number', () => {
            expect(typeof market.openInterest).toBe('number');
            expect(market.openInterest).toBe(8500);
        });

        it('maps liquidity as a number', () => {
            expect(typeof market.liquidity).toBe('number');
            expect(market.liquidity).toBe(5000);
        });

        it('maps url to kalshi events URL', () => {
            expect(market.url).toBe('https://kalshi.com/events/FED-25JAN29');
        });

        it('maps category from the event', () => {
            expect(market.category).toBe('Economics');
        });

        it('maps tags including category and event tags without duplicates', () => {
            expect(Array.isArray(market.tags)).toBe(true);
            expect(market.tags).toContain('Economics');
            expect(market.tags).toContain('Federal Reserve');
            expect(market.tags).toContain('Interest Rates');
        });

        it('sets yes convenience accessor', () => {
            expect(market.yes).toBeDefined();
            expect(market.yes!.label).toBe('Above 4.75%');
        });

        it('sets no convenience accessor', () => {
            expect(market.no).toBeDefined();
            expect(market.no!.label).toBe('Not Above 4.75%');
        });

        it('yes and up are the same reference', () => {
            expect(market.up).toBe(market.yes);
        });

        it('no and down are the same reference', () => {
            expect(market.down).toBe(market.no);
        });
    });

    describe('normalizeMarket', () => {
        it('normalizes a single-market event', () => {
            const result = normalizer.normalizeMarket(rawEvent);
            expect(result).not.toBeNull();
            expect(result!.marketId).toBe('FED-25JAN29-B4.75');
        });

        it('returns null for null input', () => {
            expect(normalizer.normalizeMarket(null as any)).toBeNull();
        });

        it('returns null for event with empty markets array', () => {
            expect(normalizer.normalizeMarket({ event_ticker: 'X', title: 'X', markets: [] })).toBeNull();
        });
    });

    describe('normalizeMarketsFromEvent', () => {
        it('returns one market per nested market', () => {
            const markets = normalizer.normalizeMarketsFromEvent(rawEvent);
            expect(markets).toHaveLength(1);
        });

        it('returns empty array for event with no markets', () => {
            const result = normalizer.normalizeMarketsFromEvent({ event_ticker: 'EMPTY', title: 'Empty', markets: [] });
            expect(result).toEqual([]);
        });
    });

    describe('normalizeEvent', () => {
        let event: UnifiedEvent;

        beforeEach(() => {
            const result = normalizer.normalizeEvent(rawEvent);
            expect(result).not.toBeNull();
            event = result!;
        });

        it('maps id from event_ticker', () => {
            expect(event.id).toBe('FED-25JAN29');
        });

        it('maps slug from event_ticker', () => {
            expect(event.slug).toBe('FED-25JAN29');
        });

        it('maps title', () => {
            expect(event.title).toBe('Fed Funds Rate Decision - January 2025');
        });

        it('uses series title plus theme for contaminated futures event titles', () => {
            const markets: KalshiRawMarket[] = [
                ['PSG', 'Paris Saint-Germain'],
                ['ARSENAL', 'Arsenal'],
                ['BARCELONA', 'Barcelona'],
                ['BAYERN', 'Bayern Munich'],
                ['REALMADRID', 'Real Madrid'],
            ].map(([ticker, label]) => ({
                ticker: `KXUCL-26-${ticker}`,
                title: `Will ${label} win the UEFA Champions League?`,
                yes_sub_title: label,
                last_price_dollars: '0.20',
                expiration_time: '2026-06-01T00:00:00Z',
            }));
            const contaminatedEvent: KalshiRawEvent = {
                event_ticker: 'KXUCL-26',
                title: 'Champions League Winner: PSG vs Arsenal',
                series_ticker: 'KXUCL',
                series_title: 'UEFA Champions League',
                mutually_exclusive: true,
                markets,
            };

            const result = normalizer.normalizeEvent(contaminatedEvent)!;

            expect(result.title).toBe('UEFA Champions League Winner');
            expect(result.markets[0].title).toBe('Will Paris Saint-Germain win the UEFA Champions League?');
            expect(result.markets[0].outcomes[0].label).toBe('Paris Saint-Germain');
        });

        it('keeps true matchup event titles even when a series title is present', () => {
            const matchupMarkets: KalshiRawMarket[] = [
                ['PSG', 'Paris Saint-Germain'],
                ['DRAW', 'Draw'],
                ['ARSENAL', 'Arsenal'],
            ].map(([ticker, label]) => ({
                ticker: `KXUCL-26-PSGARS-${ticker}`,
                title: `${label} result`,
                yes_sub_title: label,
                last_price_dollars: '0.33',
                expiration_time: '2026-05-06T00:00:00Z',
            }));
            const matchupEvent: KalshiRawEvent = {
                event_ticker: 'KXUCL-26-PSGARS',
                title: 'Champions League: PSG vs Arsenal',
                series_ticker: 'KXUCL',
                series_title: 'UEFA Champions League',
                mutually_exclusive: true,
                markets: matchupMarkets,
            };

            expect(normalizer.normalizeEvent(matchupEvent)!.title).toBe('Champions League: PSG vs Arsenal');
        });

        it('derives description from market rules', () => {
            expect(event.description).toBe('This market resolves YES if the Fed Funds Rate is above 4.75% on Jan 29, 2025.');
        });

        it('populates nested markets array', () => {
            expect(Array.isArray(event.markets)).toBe(true);
            expect(event.markets).toHaveLength(1);
        });

        it('aggregates volume24h across nested markets', () => {
            expect(typeof event.volume24h).toBe('number');
            expect(event.volume24h).toBe(12000);
        });

        it('maps url to kalshi events URL', () => {
            expect(event.url).toBe('https://kalshi.com/events/FED-25JAN29');
        });

        it('maps image_url', () => {
            expect(event.image).toBe('https://kalshi.com/img/fed.png');
        });

        it('maps category', () => {
            expect(event.category).toBe('Economics');
        });

        it('maps tags as string array', () => {
            expect(event.tags).toEqual(['Federal Reserve', 'Interest Rates']);
        });
    });

    describe('price fallback logic', () => {
        it('uses midpoint of yes_ask_dollars and yes_bid_dollars when last_price_dollars is absent', () => {
            const marketNoLastPrice: KalshiRawMarket = {
                ticker: 'TEST-MID',
                expiration_time: '2025-06-01T00:00:00Z',
                yes_ask_dollars: '0.60',
                yes_bid_dollars: '0.50',
            };
            const eventNoLastPrice: KalshiRawEvent = {
                event_ticker: 'TEST',
                title: 'Test Event',
                markets: [marketNoLastPrice],
            };
            const result = normalizer.normalizeRawMarket(eventNoLastPrice, marketNoLastPrice);
            expect(result).not.toBeNull();
            expect(result!.outcomes[0].price).toBeCloseTo(0.55);
        });

        it('falls back to legacy cent fields when dollar fields are absent', () => {
            const marketCents: KalshiRawMarket = {
                ticker: 'TEST-CENTS',
                expiration_time: '2025-06-01T00:00:00Z',
                last_price: 65,
            };
            const eventCents: KalshiRawEvent = {
                event_ticker: 'TEST-CENTS-EVT',
                title: 'Cent Market',
                markets: [marketCents],
            };
            const result = normalizer.normalizeRawMarket(eventCents, marketCents);
            expect(result).not.toBeNull();
            expect(result!.outcomes[0].price).toBeCloseTo(0.65);
        });

        it('maps zero price when no price fields are present', () => {
            const marketNoPrice: KalshiRawMarket = {
                ticker: 'TEST-NOPRICE',
                expiration_time: '2025-06-01T00:00:00Z',
            };
            const eventNoPrice: KalshiRawEvent = {
                event_ticker: 'TEST-NOPRICE-EVT',
                title: 'No Price',
                markets: [marketNoPrice],
            };
            const result = normalizer.normalizeRawMarket(eventNoPrice, marketNoPrice);
            expect(result).not.toBeNull();
            expect(result!.outcomes[0].price).toBe(0);
        });
    });

    describe('outcome label derivation', () => {
        it('uses subtitle when yes_sub_title is absent', () => {
            const market: KalshiRawMarket = {
                ticker: 'TEST-SUB',
                expiration_time: '2025-06-01T00:00:00Z',
                subtitle: 'Democratic',
                last_price_dollars: '0.40',
            };
            const event: KalshiRawEvent = {
                event_ticker: 'TEST-SUB-EVT',
                title: 'Party Control',
                markets: [market],
            };
            const result = normalizer.normalizeRawMarket(event, market);
            expect(result!.outcomes[0].label).toBe('Democratic');
        });

        it('ignores yes_sub_title that starts with "::"', () => {
            const market: KalshiRawMarket = {
                ticker: 'TEST-CC',
                expiration_time: '2025-06-01T00:00:00Z',
                yes_sub_title: ':: Democratic',
                last_price_dollars: '0.40',
            };
            const event: KalshiRawEvent = {
                event_ticker: 'TEST-CC-EVT',
                title: 'Party',
                markets: [market],
            };
            const result = normalizer.normalizeRawMarket(event, market);
            // :: prefix signals no candidate name → falls back to bare "Yes" label,
            // then addBinaryOutcomes promotes the market title ("Party") into it.
            expect(result!.outcomes[0].label).toBe('Party');
        });
    });

    describe('normalizeRawMarket edge cases', () => {
        it('returns null for null market', () => {
            expect(normalizer.normalizeRawMarket(rawEvent, null as any)).toBeNull();
        });

        it('does not include duplicate tags when event.category already appears in event.tags', () => {
            const eventWithDupTag: KalshiRawEvent = {
                event_ticker: 'DUP',
                title: 'Dup',
                category: 'Politics',
                tags: ['Politics', 'Elections'],
                markets: [rawMarket as KalshiRawMarket],
            };
            const result = normalizer.normalizeRawMarket(eventWithDupTag, rawMarket as KalshiRawMarket);
            const politicsCount = result!.tags!.filter(t => t === 'Politics').length;
            expect(politicsCount).toBe(1);
        });
    });
});

// ---------------------------------------------------------------------------
// LIMITLESS
// ---------------------------------------------------------------------------

describe('LimitlessNormalizer', () => {
    const normalizer = new LimitlessNormalizer();

    const rawMarket: Readonly<LimitlessRawMarket> = freeze({
        slug: 'will-eth-flip-btc-2025',
        title: 'Will ETH flip BTC in 2025?',
        question: 'Will ETH flip BTC in 2025?',
        description: 'Resolves YES if ETH market cap exceeds BTC before Dec 31 2025.',
        tokens: {
            yes: 'token-eth-flip-yes',
            no: 'token-eth-flip-no',
        },
        prices: [0.08, 0.92],
        expirationTimestamp: '2025-12-31T23:59:59Z',
        volumeFormatted: 75000,
        volume: 1500000,
        logo: 'https://limitless.exchange/img/eth.png',
        categories: ['Crypto'],
        tags: ['Ethereum', 'Bitcoin', 'Crypto'],
        expired: false,
        winningOutcomeIndex: null,
        tradeType: 'binary',
    });

    describe('normalizeMarket', () => {
        let market: UnifiedMarket;

        beforeEach(() => {
            const result = normalizer.normalizeMarket(rawMarket);
            expect(result).not.toBeNull();
            market = result!;
        });

        it('maps id and marketId from slug', () => {
            expect(market.id).toBe('will-eth-flip-btc-2025');
            expect(market.marketId).toBe('will-eth-flip-btc-2025');
        });

        it('maps eventId from slug', () => {
            expect(market.eventId).toBe('will-eth-flip-btc-2025');
        });

        it('maps slug', () => {
            expect(market.slug).toBe('will-eth-flip-btc-2025');
        });

        it('maps title', () => {
            expect(market.title).toBe('Will ETH flip BTC in 2025?');
        });

        it('maps description', () => {
            expect(market.description).toContain('ETH market cap');
        });

        it('populates two outcomes for a binary market', () => {
            expect(market.outcomes).toHaveLength(2);
        });

        it('maps yes outcome outcomeId from tokens.yes', () => {
            expect(market.outcomes[0].outcomeId).toBe('token-eth-flip-yes');
        });

        it('maps no outcome outcomeId from tokens.no', () => {
            expect(market.outcomes[1].outcomeId).toBe('token-eth-flip-no');
        });

        it('maps yes outcome label (addBinaryOutcomes promotes title into bare "Yes" label)', () => {
            // addBinaryOutcomes replaces a generic "Yes" label with the market title
            // and "No" with "Not <title>" for cross-venue label matching.
            expect(market.outcomes[0].label).toBe('Will ETH flip BTC in 2025?');
        });

        it('maps no outcome label (addBinaryOutcomes promotes title into bare "No" label)', () => {
            expect(market.outcomes[1].label).toBe('Not Will ETH flip BTC in 2025?');
        });

        it('maps yes price from prices[0] as a number', () => {
            expect(typeof market.outcomes[0].price).toBe('number');
            expect(market.outcomes[0].price).toBeCloseTo(0.08);
        });

        it('maps no price from prices[1] as a number', () => {
            expect(typeof market.outcomes[1].price).toBe('number');
            expect(market.outcomes[1].price).toBeCloseTo(0.92);
        });

        it('prices sum to 1.0', () => {
            expect(market.outcomes[0].price + market.outcomes[1].price).toBeCloseTo(1.0);
        });

        it('outcome marketId is set to slug', () => {
            expect(market.outcomes[0].marketId).toBe('will-eth-flip-btc-2025');
            expect(market.outcomes[1].marketId).toBe('will-eth-flip-btc-2025');
        });

        it('resolutionDate is a Date object', () => {
            expect(market.resolutionDate).toBeInstanceOf(Date);
        });

        it('maps volume24h from volumeFormatted as a number', () => {
            expect(typeof market.volume24h).toBe('number');
            expect(market.volume24h).toBe(75000);
        });

        it('maps volume from volume field as a number', () => {
            expect(typeof market.volume).toBe('number');
            expect(market.volume).toBe(1500000);
        });

        it('maps liquidity as a number (0 for flat market list)', () => {
            expect(typeof market.liquidity).toBe('number');
            expect(market.liquidity).toBe(0);
        });

        it('maps url to limitless market URL', () => {
            expect(market.url).toBe('https://limitless.exchange/markets/will-eth-flip-btc-2025');
        });

        it('maps image from logo', () => {
            expect(market.image).toBe('https://limitless.exchange/img/eth.png');
        });

        it('maps category from first entry of categories array', () => {
            expect(market.category).toBe('Crypto');
        });

        it('maps tags as string array', () => {
            expect(Array.isArray(market.tags)).toBe(true);
            expect(market.tags).toContain('Ethereum');
            expect(market.tags).toContain('Bitcoin');
        });

        it('sets yes convenience accessor', () => {
            expect(market.yes).toBeDefined();
        });

        it('sets no convenience accessor', () => {
            expect(market.no).toBeDefined();
        });

        it('metadata carries clobTokenId for yes outcome', () => {
            expect(market.outcomes[0].metadata?.clobTokenId).toBe('token-eth-flip-yes');
        });

        it('metadata carries clobTokenId for no outcome', () => {
            expect(market.outcomes[1].metadata?.clobTokenId).toBe('token-eth-flip-no');
        });
    });

    describe('normalizeEvent', () => {
        const rawEvent: Readonly<LimitlessRawEvent> = freeze({
            slug: 'eth-flip-group',
            title: 'Ethereum vs Bitcoin Group',
            description: 'A group of markets comparing ETH and BTC.',
            logo: 'https://limitless.exchange/img/group.png',
            categories: ['Crypto'],
            tags: ['Ethereum', 'Bitcoin'],
            markets: [
                rawMarket as LimitlessRawMarket,
                {
                    slug: 'will-eth-reach-10k-2025',
                    title: 'Will ETH reach $10k in 2025?',
                    tokens: {
                        yes: 'token-eth-10k-yes',
                        no: 'token-eth-10k-no',
                    },
                    prices: [0.15, 0.85],
                    volumeFormatted: 25000,
                    volume: 400000,
                    expirationTimestamp: '2025-12-31T23:59:59Z',
                },
            ],
        });

        let event: UnifiedEvent;

        beforeEach(() => {
            const result = normalizer.normalizeEvent(rawEvent);
            expect(result).not.toBeNull();
            event = result!;
        });

        it('maps id from slug', () => {
            expect(event.id).toBe('eth-flip-group');
        });

        it('maps slug', () => {
            expect(event.slug).toBe('eth-flip-group');
        });

        it('maps title', () => {
            expect(event.title).toBe('Ethereum vs Bitcoin Group');
        });

        it('maps description', () => {
            expect(event.description).toBe('A group of markets comparing ETH and BTC.');
        });

        it('populates nested markets for each child market', () => {
            expect(Array.isArray(event.markets)).toBe(true);
            expect(event.markets).toHaveLength(2);
        });

        it('aggregates volume24h across all nested markets', () => {
            expect(typeof event.volume24h).toBe('number');
            expect(event.volume24h).toBe(75000 + 25000);
        });

        it('aggregates volume across nested markets', () => {
            expect(typeof event.volume).toBe('number');
            expect(event.volume).toBe(1500000 + 400000);
        });

        it('maps url to limitless markets URL', () => {
            expect(event.url).toBe('https://limitless.exchange/markets/eth-flip-group');
        });

        it('maps image from logo', () => {
            expect(event.image).toBe('https://limitless.exchange/img/group.png');
        });

        it('maps category from first categories entry', () => {
            expect(event.category).toBe('Crypto');
        });

        it('maps tags as string array', () => {
            expect(event.tags).toContain('Ethereum');
            expect(event.tags).toContain('Bitcoin');
        });
    });

    describe('normalizeMarket edge cases', () => {
        it('returns null for null input', () => {
            expect(normalizer.normalizeMarket(null as any)).toBeNull();
        });

        it('returns market with empty outcomes when tokens field is absent', () => {
            const noTokens: LimitlessRawMarket = {
                slug: 'no-tokens-market',
                title: 'No Tokens',
                prices: [0.5, 0.5],
            };
            const result = normalizer.normalizeMarket(noTokens);
            expect(result).not.toBeNull();
            expect(result!.outcomes).toHaveLength(0);
        });

        it('uses fallback image URL when logo is null', () => {
            const noLogo: LimitlessRawMarket = {
                slug: 'no-logo',
                title: 'No Logo',
                logo: null,
                tokens: { yes: 'y', no: 'n' },
                prices: [0.5, 0.5],
            };
            const result = normalizer.normalizeMarket(noLogo);
            expect(result!.image).toBe('https://limitless.exchange/api/og?slug=no-logo');
        });

        it('uses question as title when title is absent', () => {
            const questionOnly: LimitlessRawMarket = {
                slug: 'question-only',
                question: 'Is the sky blue?',
                tokens: { yes: 'y', no: 'n' },
                prices: [0.95, 0.05],
            };
            const result = normalizer.normalizeMarket(questionOnly);
            expect(result!.title).toBe('Is the sky blue?');
        });

        it('resolves to a new Date() for missing expirationTimestamp', () => {
            const noExpiry: LimitlessRawMarket = {
                slug: 'no-expiry',
                title: 'No Expiry',
                tokens: { yes: 'y', no: 'n' },
                prices: [0.5, 0.5],
            };
            const result = normalizer.normalizeMarket(noExpiry);
            expect(result!.resolutionDate).toBeInstanceOf(Date);
        });

        it('maps tags as empty array when tags field is absent', () => {
            const noTags: LimitlessRawMarket = {
                slug: 'no-tags',
                title: 'No Tags',
                tokens: { yes: 'y', no: 'n' },
                prices: [0.5, 0.5],
            };
            const result = normalizer.normalizeMarket(noTags);
            expect(result!.tags).toEqual([]);
        });
    });

    describe('normalizeEvent edge cases', () => {
        it('returns null for null input', () => {
            expect(normalizer.normalizeEvent(null as any)).toBeNull();
        });

        it('wraps a standalone market (no nested markets array) as single-element event', () => {
            const standaloneEvent: LimitlessRawEvent = {
                slug: 'standalone',
                title: 'Standalone Market',
                tokens: { yes: 'y', no: 'n' },
                prices: [0.6, 0.4],
                volumeFormatted: 5000,
            } as any;
            const result = normalizer.normalizeEvent(standaloneEvent);
            expect(result).not.toBeNull();
            expect(result!.markets).toHaveLength(1);
        });
    });
});
