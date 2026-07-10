/**
 * Normalizer fixture tests for Polymarket US, Hyperliquid, and Baozi.
 *
 * Each test suite:
 *  1. Declares a frozen raw fixture that mirrors what the real API returns.
 *  2. Passes the fixture through the normalizer under test.
 *  3. Asserts every field on the resulting UnifiedMarket / UnifiedEvent.
 *
 * No network I/O occurs — all external dependencies are bypassed by
 * constructing the raw types directly.
 *
 * Baozi note: The normalizer receives pre-parsed Borsh account data wrapped
 * in { pubkey, parsed } objects (BaoziRawBooleanMarket / BaoziRawRaceMarket).
 * No RPC connection is needed; the BaoziNormalizer is pure data-mapping.
 */

import { PolymarketUSNormalizer } from '../../src/exchanges/polymarket_us/normalizer';
import { HyperliquidNormalizer } from '../../src/exchanges/hyperliquid/normalizer';
import { BaoziNormalizer } from '../../src/exchanges/baozi/normalizer';
import type {
    HyperliquidRawOutcomeWithQuestion,
    HyperliquidRawQuestion,
    HyperliquidRawL2Book,
} from '../../src/exchanges/hyperliquid/fetcher';
import type {
    BaoziRawBooleanMarket,
    BaoziRawRaceMarket,
} from '../../src/exchanges/baozi/fetcher';
import type { BaoziMarket, BaoziRaceMarket } from '../../src/exchanges/baozi/utils';
import { OUTCOME_ASSET_BASE, OUTCOME_MULTIPLIER } from '../../src/exchanges/hyperliquid/config';

// ============================================================================
// Polymarket US
// ============================================================================

describe('PolymarketUSNormalizer', () => {
    const normalizer = new PolymarketUSNormalizer();

    // -------------------------------------------------------------------------
    // Fixtures
    // -------------------------------------------------------------------------

    /**
     * A single MarketDetail fixture with marketSides carrying long/short prices
     * and human-readable descriptions.  The cast to `any` is intentional:
     * PolymarketUSNormalizer.normalizeMarket() accepts a MarketDetail SDK type
     * but immediately re-casts it to its own RealMarket interface at runtime.
     */
    const rawMarket: any = Object.freeze({
        slug: 'will-btc-hit-100k-by-june',
        question: 'Will BTC hit $100k by June 2026?',
        description: 'Resolves YES if BTC/USD closes above $100,000 on any day before June 30 2026.',
        category: 'Crypto',
        tags: ['Bitcoin', 'Crypto'],
        endDate: '2026-06-30T23:59:00Z',
        startDate: '2026-01-01T00:00:00Z',
        eventSlug: 'btc-price-june-2026',
        volume: 450_000,
        liquidity: 32_000,
        orderPriceMinTickSize: 0.001,
        marketSides: [
            { description: 'BTC hits $100k', long: true, price: '0.642' },
            { description: 'BTC does not hit $100k', long: false, price: '0.358' },
        ],
    });

    /**
     * Fixture using the legacy outcomePrices array instead of marketSides.
     */
    const rawMarketLegacyPrices: any = Object.freeze({
        slug: 'legacy-market-slug',
        title: 'Legacy Title Market',
        description: 'Uses outcomePrices fallback.',
        endDate: '2026-12-31T00:00:00Z',
        volume: 10_000,
        liquidity: 1_000,
        outcomePrices: ['0.75', '0.25'],
    });

    /**
     * An SDK Event that nests two markets.  The cast mirrors what
     * normalizeMarketsFromEvent / normalizeEvent do at runtime.
     */
    const rawEvent: any = Object.freeze({
        slug: 'btc-price-june-2026',
        title: 'BTC Price Markets \u2013 June 2026',
        description: 'A group of BTC price prediction markets resolving June 2026.',
        category: 'Crypto',
        tags: [{ label: 'Bitcoin' }, { label: 'Crypto' }],
        endDate: '2026-06-30T23:59:00Z',
        volume: 900_000,
        liquidity: 64_000,
        markets: [
            {
                slug: 'will-btc-hit-100k-by-june',
                question: 'Will BTC hit $100k by June 2026?',
                description: 'Resolves YES if BTC/USD closes above $100,000.',
                volume: 450_000,
                liquidity: 32_000,
                marketSides: [
                    { description: 'Yes', long: true, price: '0.642' },
                    { description: 'No', long: false, price: '0.358' },
                ],
            },
            {
                slug: 'will-btc-hit-80k-by-june',
                question: 'Will BTC hit $80k by June 2026?',
                description: 'Resolves YES if BTC/USD closes above $80,000.',
                volume: 450_000,
                liquidity: 32_000,
                marketSides: [
                    { description: 'Yes', long: true, price: '0.891' },
                    { description: 'No', long: false, price: '0.109' },
                ],
            },
        ],
    });

    // -------------------------------------------------------------------------
    // normalizeMarket
    // -------------------------------------------------------------------------

    describe('normalizeMarket', () => {
        test('returns a UnifiedMarket with the correct marketId from slug', () => {
            const market = normalizer.normalizeMarket(rawMarket);
            expect(market.marketId).toBe('will-btc-hit-100k-by-june');
        });

        test('uses question field as title when present', () => {
            const market = normalizer.normalizeMarket(rawMarket);
            expect(market.title).toBe('Will BTC hit $100k by June 2026?');
        });

        test('preserves description', () => {
            const market = normalizer.normalizeMarket(rawMarket);
            expect(market.description).toBe(
                'Resolves YES if BTC/USD closes above $100,000 on any day before June 30 2026.',
            );
        });

        test('slug matches marketId', () => {
            const market = normalizer.normalizeMarket(rawMarket);
            expect(market.slug).toBe(market.marketId);
        });

        test('builds canonical URL from slug', () => {
            const market = normalizer.normalizeMarket(rawMarket);
            expect(market.url).toBe('https://polymarket.us/market/will-btc-hit-100k-by-june');
        });

        test('volume is a number', () => {
            const market = normalizer.normalizeMarket(rawMarket);
            expect(typeof market.volume).toBe('number');
            expect(market.volume).toBe(450_000);
        });

        test('liquidity is a number', () => {
            const market = normalizer.normalizeMarket(rawMarket);
            expect(typeof market.liquidity).toBe('number');
            expect(market.liquidity).toBe(32_000);
        });

        test('volume24h is 0 (no per-market 24h data in fixture)', () => {
            const market = normalizer.normalizeMarket(rawMarket);
            expect(market.volume24h).toBe(0);
        });

        test('resolutionDate is parsed from endDate', () => {
            const market = normalizer.normalizeMarket(rawMarket);
            expect(market.resolutionDate).toBeInstanceOf(Date);
            expect(market.resolutionDate.toISOString()).toBe('2026-06-30T23:59:00.000Z');
        });

        test('category is preserved', () => {
            const market = normalizer.normalizeMarket(rawMarket);
            expect(market.category).toBe('Crypto');
        });

        test('tags are coerced to string array', () => {
            const market = normalizer.normalizeMarket(rawMarket);
            expect(Array.isArray(market.tags)).toBe(true);
            expect(market.tags).toContain('Bitcoin');
            expect(market.tags).toContain('Crypto');
        });

        test('tickSize is lifted from orderPriceMinTickSize', () => {
            const market = normalizer.normalizeMarket(rawMarket);
            expect(market.tickSize).toBe(0.001);
        });

        test('eventId is set from eventSlug', () => {
            const market = normalizer.normalizeMarket(rawMarket);
            expect(market.eventId).toBe('btc-price-june-2026');
        });

        // --- outcome assertions ---

        test('produces exactly 2 outcomes', () => {
            const market = normalizer.normalizeMarket(rawMarket);
            expect(market.outcomes).toHaveLength(2);
        });

        test('outcome[0] is the long side with correct outcomeId', () => {
            const market = normalizer.normalizeMarket(rawMarket);
            const longOutcome = market.outcomes[0];
            expect(longOutcome.outcomeId).toBe('will-btc-hit-100k-by-june:long');
            expect(longOutcome.label).toBe('long');
            expect(longOutcome.marketId).toBe('will-btc-hit-100k-by-june');
        });

        test('outcome[1] is the short side with correct outcomeId', () => {
            const market = normalizer.normalizeMarket(rawMarket);
            const shortOutcome = market.outcomes[1];
            expect(shortOutcome.outcomeId).toBe('will-btc-hit-100k-by-june:short');
            expect(shortOutcome.label).toBe('short');
        });

        test('long outcome price is a number parsed from marketSides.price', () => {
            const market = normalizer.normalizeMarket(rawMarket);
            expect(typeof market.outcomes[0].price).toBe('number');
            expect(market.outcomes[0].price).toBeCloseTo(0.642, 3);
        });

        test('short outcome price is a number parsed from marketSides.price', () => {
            const market = normalizer.normalizeMarket(rawMarket);
            expect(typeof market.outcomes[1].price).toBe('number');
            expect(market.outcomes[1].price).toBeCloseTo(0.358, 3);
        });

        test('long side sideDescription is stashed in metadata', () => {
            const market = normalizer.normalizeMarket(rawMarket);
            expect(market.outcomes[0].metadata?.sideDescription).toBe('BTC hits $100k');
        });

        test('short side sideDescription is stashed in metadata', () => {
            const market = normalizer.normalizeMarket(rawMarket);
            expect(market.outcomes[1].metadata?.sideDescription).toBe('BTC does not hit $100k');
        });

        test('addBinaryOutcomes populates market.yes and market.no', () => {
            const market = normalizer.normalizeMarket(rawMarket);
            // The long/short labels do not match yes/no/up/down so addBinaryOutcomes
            // falls back to index order: yes = outcomes[0], no = outcomes[1]
            expect(market.yes).toBeDefined();
            expect(market.no).toBeDefined();
            expect(market.yes?.outcomeId).toBe('will-btc-hit-100k-by-june:long');
            expect(market.no?.outcomeId).toBe('will-btc-hit-100k-by-june:short');
        });
    });

    // -------------------------------------------------------------------------
    // normalizeMarket - legacy outcomePrices fallback
    // -------------------------------------------------------------------------

    describe('normalizeMarket with outcomePrices fallback', () => {
        test('parses long price from outcomePrices[0]', () => {
            const market = normalizer.normalizeMarket(rawMarketLegacyPrices);
            expect(market.outcomes[0].price).toBeCloseTo(0.75, 3);
        });

        test('parses short price from outcomePrices[1]', () => {
            const market = normalizer.normalizeMarket(rawMarketLegacyPrices);
            expect(market.outcomes[1].price).toBeCloseTo(0.25, 3);
        });

        test('title falls back to title field when question is absent', () => {
            const market = normalizer.normalizeMarket(rawMarketLegacyPrices);
            expect(market.title).toBe('Legacy Title Market');
        });

        test('tickSize is undefined when orderPriceMinTickSize is absent', () => {
            const market = normalizer.normalizeMarket(rawMarketLegacyPrices);
            expect(market.tickSize).toBeUndefined();
        });
    });

    // -------------------------------------------------------------------------
    // normalizeMarket - missing sides => price defaults to 0
    // -------------------------------------------------------------------------

    describe('normalizeMarket with no price data', () => {
        const rawNoPrice: any = Object.freeze({
            slug: 'no-price-market',
            question: 'Will something happen?',
            description: '',
        });

        test('outcomes default to price 0 when no sides and no outcomePrices', () => {
            const market = normalizer.normalizeMarket(rawNoPrice);
            expect(market.outcomes[0].price).toBe(0);
            expect(market.outcomes[1].price).toBe(0);
        });

        test('resolutionDate defaults to epoch when endDate is absent', () => {
            const market = normalizer.normalizeMarket(rawNoPrice);
            expect(market.resolutionDate.getTime()).toBe(0);
        });

        test('liquidity defaults to 0 when absent', () => {
            const market = normalizer.normalizeMarket(rawNoPrice);
            expect(market.liquidity).toBe(0);
        });
    });

    // -------------------------------------------------------------------------
    // normalizeMarket - complementary price derivation
    // -------------------------------------------------------------------------

    describe('normalizeMarket complementary price derivation', () => {
        test('derives short price from long when only long side is quoted', () => {
            const raw: any = {
                slug: 'one-sided-market',
                question: 'One-sided?',
                description: '',
                marketSides: [
                    { description: 'Yes', long: true, price: '0.8' },
                    { description: 'No', long: false },
                ],
            };
            const market = normalizer.normalizeMarket(raw);
            expect(market.outcomes[0].price).toBeCloseTo(0.8, 5);
            expect(market.outcomes[1].price).toBeCloseTo(0.2, 5);
        });
    });

    // -------------------------------------------------------------------------
    // normalizeMarketsFromEvent
    // -------------------------------------------------------------------------

    describe('normalizeMarketsFromEvent', () => {
        test('returns one UnifiedMarket per nested market', () => {
            const markets = normalizer.normalizeMarketsFromEvent(rawEvent);
            expect(markets).toHaveLength(2);
        });

        test('each market inherits eventSlug from parent event', () => {
            const markets = normalizer.normalizeMarketsFromEvent(rawEvent);
            for (const m of markets) {
                expect(m.eventId).toBe('btc-price-june-2026');
            }
        });

        test('each market inherits category from parent event', () => {
            const markets = normalizer.normalizeMarketsFromEvent(rawEvent);
            for (const m of markets) {
                expect(m.category).toBe('Crypto');
            }
        });

        test('each market inherits tags from parent event (coerced from objects)', () => {
            const markets = normalizer.normalizeMarketsFromEvent(rawEvent);
            for (const m of markets) {
                expect(m.tags).toContain('Bitcoin');
            }
        });

        test('each market inherits endDate from parent event', () => {
            const markets = normalizer.normalizeMarketsFromEvent(rawEvent);
            for (const m of markets) {
                expect(m.resolutionDate.toISOString()).toBe('2026-06-30T23:59:00.000Z');
            }
        });

        test('returns empty array when event has no markets', () => {
            const emptyEvent: any = { slug: 'empty', title: 'Empty', markets: undefined };
            expect(normalizer.normalizeMarketsFromEvent(emptyEvent)).toEqual([]);
        });
    });

    // -------------------------------------------------------------------------
    // normalizeEvent
    // -------------------------------------------------------------------------

    describe('normalizeEvent', () => {
        test('id equals the event slug', () => {
            const event = normalizer.normalizeEvent(rawEvent);
            expect(event.id).toBe('btc-price-june-2026');
        });

        test('title is taken from event', () => {
            const event = normalizer.normalizeEvent(rawEvent);
            expect(event.title).toBe('BTC Price Markets \u2013 June 2026');
        });

        test('description is taken from event', () => {
            const event = normalizer.normalizeEvent(rawEvent);
            expect(event.description).toBe(
                'A group of BTC price prediction markets resolving June 2026.',
            );
        });

        test('slug equals the event slug', () => {
            const event = normalizer.normalizeEvent(rawEvent);
            expect(event.slug).toBe('btc-price-june-2026');
        });

        test('url is built from slug', () => {
            const event = normalizer.normalizeEvent(rawEvent);
            expect(event.url).toBe('https://polymarket.us/event/btc-price-june-2026');
        });

        test('volume is a number', () => {
            const event = normalizer.normalizeEvent(rawEvent);
            expect(typeof event.volume).toBe('number');
            expect(event.volume).toBe(900_000);
        });

        test('volume24h is 0', () => {
            const event = normalizer.normalizeEvent(rawEvent);
            expect(event.volume24h).toBe(0);
        });

        test('category is taken from event', () => {
            const event = normalizer.normalizeEvent(rawEvent);
            expect(event.category).toBe('Crypto');
        });

        test('tags are coerced from object array to string array', () => {
            const event = normalizer.normalizeEvent(rawEvent);
            expect(Array.isArray(event.tags)).toBe(true);
            expect(event.tags).toContain('Bitcoin');
            expect(event.tags).toContain('Crypto');
        });

        test('markets array contains 2 entries', () => {
            const event = normalizer.normalizeEvent(rawEvent);
            expect(event.markets).toHaveLength(2);
        });

        test('each nested market is a valid UnifiedMarket', () => {
            const event = normalizer.normalizeEvent(rawEvent);
            for (const m of event.markets) {
                expect(typeof m.marketId).toBe('string');
                expect(m.marketId.length).toBeGreaterThan(0);
                expect(Array.isArray(m.outcomes)).toBe(true);
                expect(m.outcomes.length).toBeGreaterThan(0);
            }
        });
    });
});

// ============================================================================
// Hyperliquid
// ============================================================================

describe('HyperliquidNormalizer', () => {
    const normalizer = new HyperliquidNormalizer();

    // Helper: compute the expected outcome asset IDs for a given outcomeId
    function yesAssetId(outcomeId: number): string {
        return String(OUTCOME_ASSET_BASE + OUTCOME_MULTIPLIER * outcomeId + 0); // SIDE_YES = 0
    }
    function noAssetId(outcomeId: number): string {
        return String(OUTCOME_ASSET_BASE + OUTCOME_MULTIPLIER * outcomeId + 1); // SIDE_NO = 1
    }
    function marketId(outcomeId: number): string {
        return `hl-outcome-${outcomeId}`;
    }

    // -------------------------------------------------------------------------
    // Fixtures
    // -------------------------------------------------------------------------

    /**
     * A priceBinary outcome: BTC > $79,583 expiring 2026-05-09T06:00Z.
     */
    const OUTCOME_ID = 42;

    const rawPriceBinaryOutcome: HyperliquidRawOutcomeWithQuestion = Object.freeze({
        outcome: Object.freeze({
            outcome: OUTCOME_ID,
            name: 'BTC > $79,583 @ 2026-05-09 06:00 UTC',
            description: 'class:priceBinary|underlying:BTC|expiry:20260509-0600|targetPrice:79583|period:1d',
            sideSpecs: [
                { name: 'Yes', token: 1000420 },
                { name: 'No', token: 1000421 },
            ],
        }),
        question: Object.freeze({
            question: 7,
            name: 'BTC Price @ May 9 2026',
            description: 'class:priceBinary|underlying:BTC|expiry:20260509-0600|targetPrice:79583|period:1d',
            fallbackOutcome: 43,
            namedOutcomes: [OUTCOME_ID, 43],
            settledNamedOutcomes: [],
        }),
        midPrice: '0.63',
    }) as HyperliquidRawOutcomeWithQuestion;

    /**
     * A priceBucket question with three named outcomes.
     */
    const Q_ID = 12;
    const BUCKET_OUTCOME_IDS = [100, 101, 102];

    const rawBucketQuestion: HyperliquidRawQuestion = Object.freeze({
        question: Q_ID,
        name: 'BTC Price Bucket',
        description: 'class:priceBucket|underlying:BTC|expiry:20260509-0600|priceThresholds:77991,81174|period:1d',
        fallbackOutcome: 103,
        namedOutcomes: [...BUCKET_OUTCOME_IDS],
        settledNamedOutcomes: [],
    });

    // Three bucket outcomes
    const rawBucketOutcomes: HyperliquidRawOutcomeWithQuestion[] = [
        {
            outcome: {
                outcome: 100,
                name: 'BTC < $77,991',
                description: 'index:0',
                sideSpecs: [{ name: 'Yes' }, { name: 'No' }],
            },
            question: rawBucketQuestion,
            midPrice: '0.15',
        },
        {
            outcome: {
                outcome: 101,
                name: 'BTC $77,991 - $81,174',
                description: 'index:1',
                sideSpecs: [{ name: 'Yes' }, { name: 'No' }],
            },
            question: rawBucketQuestion,
            midPrice: '0.60',
        },
        {
            outcome: {
                outcome: 102,
                name: 'BTC > $81,174',
                description: 'index:2',
                sideSpecs: [{ name: 'Yes' }, { name: 'No' }],
            },
            question: rawBucketQuestion,
            midPrice: '0.25',
        },
    ];

    // -------------------------------------------------------------------------
    // normalizeMarket - priceBinary
    // -------------------------------------------------------------------------

    describe('normalizeMarket (priceBinary)', () => {
        test('returns a non-null UnifiedMarket', () => {
            const market = normalizer.normalizeMarket(rawPriceBinaryOutcome);
            expect(market).not.toBeNull();
        });

        test('marketId follows hl-outcome-{id} pattern', () => {
            const market = normalizer.normalizeMarket(rawPriceBinaryOutcome)!;
            expect(market.marketId).toBe(marketId(OUTCOME_ID));
        });

        test('eventId equals the stringified question id', () => {
            const market = normalizer.normalizeMarket(rawPriceBinaryOutcome)!;
            expect(market.eventId).toBe(String(7));
        });

        test('slug is hl-{outcomeId}', () => {
            const market = normalizer.normalizeMarket(rawPriceBinaryOutcome)!;
            expect(market.slug).toBe(`hl-${OUTCOME_ID}`);
        });

        test('title is built from class/underlying/targetPrice', () => {
            const market = normalizer.normalizeMarket(rawPriceBinaryOutcome)!;
            expect(market.title).toContain('BTC');
            expect(market.title).toContain('79,583');
        });

        test('description equals the raw pipe-delimited description', () => {
            const market = normalizer.normalizeMarket(rawPriceBinaryOutcome)!;
            expect(market.description).toBe(
                'class:priceBinary|underlying:BTC|expiry:20260509-0600|targetPrice:79583|period:1d',
            );
        });

        test('url contains the encoded outcome asset', () => {
            const market = normalizer.normalizeMarket(rawPriceBinaryOutcome)!;
            expect(market.url).toContain('hyperliquid.xyz');
            // buildMarketUrl uses encodeURIComponent so # becomes %23
            expect(market.url).toMatch(/%23\d+/);
        });

        test('status is active', () => {
            const market = normalizer.normalizeMarket(rawPriceBinaryOutcome)!;
            expect(market.status).toBe('active');
        });

        test('tickSize is 0.001', () => {
            const market = normalizer.normalizeMarket(rawPriceBinaryOutcome)!;
            expect(market.tickSize).toBe(0.001);
        });

        test('volume24h is 0', () => {
            const market = normalizer.normalizeMarket(rawPriceBinaryOutcome)!;
            expect(market.volume24h).toBe(0);
        });

        test('liquidity is 0', () => {
            const market = normalizer.normalizeMarket(rawPriceBinaryOutcome)!;
            expect(market.liquidity).toBe(0);
        });

        test('resolutionDate is parsed from expiry field', () => {
            const market = normalizer.normalizeMarket(rawPriceBinaryOutcome)!;
            expect(market.resolutionDate).toBeInstanceOf(Date);
            expect(market.resolutionDate.toISOString()).toBe('2026-05-09T06:00:00.000Z');
        });

        test('tags contains underlying and Outcome Markets', () => {
            const market = normalizer.normalizeMarket(rawPriceBinaryOutcome)!;
            expect(market.tags).toContain('BTC');
            expect(market.tags).toContain('Outcome Markets');
        });

        test('category is Crypto when underlying is present', () => {
            const market = normalizer.normalizeMarket(rawPriceBinaryOutcome)!;
            expect(market.category).toBe('Crypto');
        });

        test('produces exactly 2 outcomes from sideSpecs', () => {
            const market = normalizer.normalizeMarket(rawPriceBinaryOutcome)!;
            expect(market.outcomes).toHaveLength(2);
        });

        test('Yes outcome has correct outcomeId (asset encoding)', () => {
            const market = normalizer.normalizeMarket(rawPriceBinaryOutcome)!;
            // Find by outcomeId since addBinaryOutcomes mutates the Yes/No labels
            // to the market title after normalization.
            const yes = market.outcomes.find(o => o.outcomeId === yesAssetId(OUTCOME_ID));
            expect(yes).toBeDefined();
            expect(yes!.outcomeId).toBe(yesAssetId(OUTCOME_ID));
        });

        test('No outcome has correct outcomeId (asset encoding)', () => {
            const market = normalizer.normalizeMarket(rawPriceBinaryOutcome)!;
            const no = market.outcomes.find(o => o.outcomeId === noAssetId(OUTCOME_ID));
            expect(no).toBeDefined();
            expect(no!.outcomeId).toBe(noAssetId(OUTCOME_ID));
        });

        test('outcome prices are numbers (not strings)', () => {
            const market = normalizer.normalizeMarket(rawPriceBinaryOutcome)!;
            for (const o of market.outcomes) {
                expect(typeof o.price).toBe('number');
            }
        });

        test('yes price reflects midPrice', () => {
            const market = normalizer.normalizeMarket(rawPriceBinaryOutcome)!;
            // outcomes[0] is the Yes sideSpec (first in the array)
            const yes = market.outcomes.find(o => o.outcomeId === yesAssetId(OUTCOME_ID))!;
            expect(yes.price).toBeCloseTo(0.63, 5);
        });

        test('no price is 1 - midPrice', () => {
            const market = normalizer.normalizeMarket(rawPriceBinaryOutcome)!;
            const no = market.outcomes.find(o => o.outcomeId === noAssetId(OUTCOME_ID))!;
            expect(no.price).toBeCloseTo(0.37, 5);
        });

        test('market.yes is set by addBinaryOutcomes (label promoted to market title)', () => {
            const market = normalizer.normalizeMarket(rawPriceBinaryOutcome)!;
            expect(market.yes).toBeDefined();
            // addBinaryOutcomes promotes the market title onto the Yes outcome label
            expect(market.yes!.label).toContain('BTC');
        });

        test('market.no is set by addBinaryOutcomes', () => {
            const market = normalizer.normalizeMarket(rawPriceBinaryOutcome)!;
            expect(market.no).toBeDefined();
        });
    });

    // -------------------------------------------------------------------------
    // normalizeMarket - null / undefined guard
    // -------------------------------------------------------------------------

    describe('normalizeMarket null guards', () => {
        test('returns null when raw is null', () => {
            expect(normalizer.normalizeMarket(null as any)).toBeNull();
        });

        test('returns null when outcome property is missing', () => {
            expect(normalizer.normalizeMarket({} as any)).toBeNull();
        });
    });

    // -------------------------------------------------------------------------
    // normalizeMarket - midPrice defaults to 0.5 when absent
    // -------------------------------------------------------------------------

    describe('normalizeMarket with no midPrice', () => {
        const noMidRaw: HyperliquidRawOutcomeWithQuestion = {
            outcome: {
                outcome: 99,
                name: 'Some outcome',
                description: 'class:priceBinary|underlying:ETH|expiry:20260901-0000|targetPrice:5000|period:1d',
                sideSpecs: [{ name: 'Yes' }, { name: 'No' }],
            },
            question: undefined,
            midPrice: undefined,
        };

        test('yes and no prices default to 0.5 when midPrice is absent', () => {
            const market = normalizer.normalizeMarket(noMidRaw)!;
            // Use market.yes / market.no set by addBinaryOutcomes since labels are mutated
            expect(market.yes).toBeDefined();
            expect(market.no).toBeDefined();
            expect(market.yes!.price).toBeCloseTo(0.5, 5);
            expect(market.no!.price).toBeCloseTo(0.5, 5);
        });

        test('eventId is undefined when question is absent', () => {
            const market = normalizer.normalizeMarket(noMidRaw)!;
            expect(market.eventId).toBeUndefined();
        });

        test('resolutionDate is undefined when no expiry', () => {
            const noExpiry: HyperliquidRawOutcomeWithQuestion = {
                outcome: {
                    outcome: 88,
                    name: 'No expiry',
                    description: 'other',
                    sideSpecs: [],
                },
                question: undefined,
                midPrice: undefined,
            };
            const market = normalizer.normalizeMarket(noExpiry)!;
            expect(market.resolutionDate).toBeUndefined();
        });
    });

    // -------------------------------------------------------------------------
    // normalizeMarket - no sideSpecs defaults to Yes/No
    // -------------------------------------------------------------------------

    describe('normalizeMarket with empty sideSpecs', () => {
        test('defaults to Yes/No outcomes when sideSpecs is empty', () => {
            const raw: HyperliquidRawOutcomeWithQuestion = {
                outcome: {
                    outcome: 55,
                    name: 'Market with no sides',
                    description: 'other',
                    sideSpecs: [],
                },
                question: undefined,
                midPrice: '0.4',
            };
            const market = normalizer.normalizeMarket(raw)!;
            expect(market.outcomes).toHaveLength(2);
            // addBinaryOutcomes mutates 'Yes' -> market.title and 'No' -> 'Not ' + market.title
            // so we verify via market.yes / market.no which are always set
            expect(market.yes).toBeDefined();
            expect(market.no).toBeDefined();
        });
    });

    // -------------------------------------------------------------------------
    // normalizeMarket - bucket outcomes with index descriptions
    // -------------------------------------------------------------------------

    describe('normalizeMarket (priceBucket index outcomes)', () => {
        test('bucket outcome index:0 uses threshold label', () => {
            const market = normalizer.normalizeMarket(rawBucketOutcomes[0])!;
            expect(market.title).toContain('BTC');
            expect(market.title).toContain('77,991');
        });

        test('bucket outcome index:1 uses range label', () => {
            const market = normalizer.normalizeMarket(rawBucketOutcomes[1])!;
            expect(market.title).toContain('77,991');
            expect(market.title).toContain('81,174');
        });

        test('bucket outcome index:2 uses upper bound label', () => {
            const market = normalizer.normalizeMarket(rawBucketOutcomes[2])!;
            expect(market.title).toContain('BTC');
            expect(market.title).toContain('81,174');
        });
    });

    // -------------------------------------------------------------------------
    // normalizeEvent
    // -------------------------------------------------------------------------

    describe('normalizeEvent', () => {
        test('returns non-null for a valid question', () => {
            expect(normalizer.normalizeEvent(rawBucketQuestion)).not.toBeNull();
        });

        test('id equals the stringified question number', () => {
            const event = normalizer.normalizeEvent(rawBucketQuestion)!;
            expect(event.id).toBe(String(Q_ID));
        });

        test('slug follows hl-question-{id} pattern', () => {
            const event = normalizer.normalizeEvent(rawBucketQuestion)!;
            expect(event.slug).toBe(`hl-question-${Q_ID}`);
        });

        test('title is built for priceBucket (contains thresholds)', () => {
            const event = normalizer.normalizeEvent(rawBucketQuestion)!;
            expect(event.title).toContain('77,991');
            expect(event.title).toContain('81,174');
        });

        test('description equals the raw pipe-delimited string', () => {
            const event = normalizer.normalizeEvent(rawBucketQuestion)!;
            expect(event.description).toBe(rawBucketQuestion.description);
        });

        test('url contains the question id', () => {
            const event = normalizer.normalizeEvent(rawBucketQuestion)!;
            expect(event.url).toContain(String(Q_ID));
            expect(event.url).toContain('hyperliquid.xyz');
        });

        test('volume24h is 0', () => {
            const event = normalizer.normalizeEvent(rawBucketQuestion)!;
            expect(event.volume24h).toBe(0);
        });

        test('markets array is initially empty from normalizeEvent', () => {
            const event = normalizer.normalizeEvent(rawBucketQuestion)!;
            expect(Array.isArray(event.markets)).toBe(true);
            expect(event.markets).toHaveLength(0);
        });

        test('tags contain Outcome Markets', () => {
            const event = normalizer.normalizeEvent(rawBucketQuestion)!;
            expect(event.tags).toContain('Outcome Markets');
        });

        test('tags contain underlying', () => {
            const event = normalizer.normalizeEvent(rawBucketQuestion)!;
            expect(event.tags).toContain('BTC');
        });

        test('category is Crypto when underlying is present', () => {
            const event = normalizer.normalizeEvent(rawBucketQuestion)!;
            expect(event.category).toBe('Crypto');
        });

        test('returns null for null input', () => {
            expect(normalizer.normalizeEvent(null as any)).toBeNull();
        });
    });

    // -------------------------------------------------------------------------
    // normalizeOrderBook
    // -------------------------------------------------------------------------

    describe('normalizeOrderBook', () => {
        const rawBook: HyperliquidRawL2Book = {
            coin: '#420',
            levels: [
                [
                    { px: '0.620', sz: '100.5', n: 3 },
                    { px: '0.610', sz: '200.0', n: 5 },
                ],
                [
                    { px: '0.630', sz: '80.0', n: 2 },
                    { px: '0.650', sz: '150.0', n: 4 },
                ],
            ],
            time: 1_700_000_000_000,
        };

        test('bids are sorted descending by price', () => {
            const book = normalizer.normalizeOrderBook(rawBook, 'hl-outcome-42');
            expect(book.bids[0].price).toBeGreaterThanOrEqual(book.bids[1].price);
        });

        test('asks are sorted ascending by price', () => {
            const book = normalizer.normalizeOrderBook(rawBook, 'hl-outcome-42');
            expect(book.asks[0].price).toBeLessThanOrEqual(book.asks[1].price);
        });

        test('bid prices, sizes, and order counts are numbers', () => {
            const book = normalizer.normalizeOrderBook(rawBook, 'hl-outcome-42');
            for (const b of book.bids) {
                expect(typeof b.price).toBe('number');
                expect(typeof b.size).toBe('number');
                expect(typeof b.orderCount).toBe('number');
            }
        });

        test('ask prices, sizes, and order counts are numbers', () => {
            const book = normalizer.normalizeOrderBook(rawBook, 'hl-outcome-42');
            for (const a of book.asks) {
                expect(typeof a.price).toBe('number');
                expect(typeof a.size).toBe('number');
                expect(typeof a.orderCount).toBe('number');
            }
        });

        test('timestamp is taken from raw.time', () => {
            const book = normalizer.normalizeOrderBook(rawBook, 'hl-outcome-42');
            expect(book.timestamp).toBe(1_700_000_000_000);
        });
    });
});

// ============================================================================
// Baozi
// ============================================================================

describe('BaoziNormalizer', () => {
    const normalizer = new BaoziNormalizer();

    const LAMPORTS_PER_SOL = 1_000_000_000;

    /**
     * Realistic-looking base58 pubkey strings (44 chars).
     * Not required to be real Solana accounts for pure normalizer tests.
     */
    const BOOLEAN_PUBKEY = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
    const RACE_PUBKEY = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

    // -------------------------------------------------------------------------
    // Boolean market fixture
    // -------------------------------------------------------------------------

    const resolutionUnixSec = BigInt(Math.floor(new Date('2026-07-01T00:00:00Z').getTime() / 1000));

    const rawBooleanParsed: BaoziMarket = {
        marketId: BigInt(1001),
        question: 'Will SOL reach $500 before July 2026?',
        closingTime: resolutionUnixSec - BigInt(3600),
        resolutionTime: resolutionUnixSec,
        yesPool: BigInt(3 * LAMPORTS_PER_SOL),
        noPool: BigInt(7 * LAMPORTS_PER_SOL),
        status: 0,
        winningOutcome: null,
        layer: 0,
        creator: '11111111111111111111111111111111',
        creatorFeeBps: 100,
        platformFeeBpsAtCreation: 50,
        hasBets: true,
        lastBetTime: BigInt(0),
    };

    const rawBooleanMarket: BaoziRawBooleanMarket = {
        pubkey: BOOLEAN_PUBKEY,
        parsed: rawBooleanParsed,
    };

    // -------------------------------------------------------------------------
    // Race market fixture (3 outcomes)
    // -------------------------------------------------------------------------

    const rawRaceParsed: BaoziRaceMarket = {
        marketId: BigInt(2001),
        question: 'Which chain will have the highest TVL in Q3 2026?',
        closingTime: resolutionUnixSec - BigInt(3600),
        resolutionTime: resolutionUnixSec,
        outcomeCount: 3,
        outcomeLabels: ['Solana', 'Ethereum', 'Base'],
        outcomePools: [
            BigInt(4 * LAMPORTS_PER_SOL),
            BigInt(5 * LAMPORTS_PER_SOL),
            BigInt(1 * LAMPORTS_PER_SOL),
        ],
        totalPool: BigInt(10 * LAMPORTS_PER_SOL),
        status: 0,
        winningOutcome: null,
        layer: 1,
        creator: '11111111111111111111111111111111',
        creatorFeeBps: 200,
        platformFeeBpsAtCreation: 50,
        lastBetTime: BigInt(0),
    };

    const rawRaceMarket: BaoziRawRaceMarket = {
        pubkey: RACE_PUBKEY,
        parsed: rawRaceParsed,
    };

    // -------------------------------------------------------------------------
    // normalizeMarket - boolean
    // -------------------------------------------------------------------------

    describe('normalizeMarket (boolean)', () => {
        test('returns a non-null UnifiedMarket', () => {
            expect(normalizer.normalizeMarket(rawBooleanMarket)).not.toBeNull();
        });

        test('marketId equals pubkey', () => {
            const market = normalizer.normalizeMarket(rawBooleanMarket)!;
            expect(market.marketId).toBe(BOOLEAN_PUBKEY);
        });

        test('title equals the on-chain question', () => {
            const market = normalizer.normalizeMarket(rawBooleanMarket)!;
            expect(market.title).toBe('Will SOL reach $500 before July 2026?');
        });

        test('url is built from pubkey', () => {
            const market = normalizer.normalizeMarket(rawBooleanMarket)!;
            expect(market.url).toBe(`https://baozi.bet/market/${BOOLEAN_PUBKEY}`);
        });

        test('resolutionDate is correct', () => {
            const market = normalizer.normalizeMarket(rawBooleanMarket)!;
            expect(market.resolutionDate).toBeInstanceOf(Date);
            expect(market.resolutionDate.toISOString()).toBe('2026-07-01T00:00:00.000Z');
        });

        test('volume equals total pool in SOL', () => {
            const market = normalizer.normalizeMarket(rawBooleanMarket)!;
            expect(typeof market.volume).toBe('number');
            expect(market.volume).toBeCloseTo(10, 5);
        });

        test('liquidity equals total pool in SOL', () => {
            const market = normalizer.normalizeMarket(rawBooleanMarket)!;
            expect(typeof market.liquidity).toBe('number');
            expect(market.liquidity).toBeCloseTo(10, 5);
        });

        test('volume24h is 0', () => {
            const market = normalizer.normalizeMarket(rawBooleanMarket)!;
            expect(market.volume24h).toBe(0);
        });

        test('category is undefined (tier is not a topic category)', () => {
            const market = normalizer.normalizeMarket(rawBooleanMarket)!;
            expect(market.category).toBeUndefined();
        });

        test('tags include tier:official, solana, and pari-mutuel', () => {
            const market = normalizer.normalizeMarket(rawBooleanMarket)!;
            expect(market.tags).toContain('tier:official');
            expect(market.tags).toContain('solana');
            expect(market.tags).toContain('pari-mutuel');
        });

        test('produces exactly 2 outcomes', () => {
            const market = normalizer.normalizeMarket(rawBooleanMarket)!;
            expect(market.outcomes).toHaveLength(2);
        });

        test('yes outcome outcomeId is pubkey-YES', () => {
            const market = normalizer.normalizeMarket(rawBooleanMarket)!;
            // addBinaryOutcomes mutates Yes/No labels to title/Not-title,
            // so find by outcomeId suffix instead of label.
            const yes = market.outcomes.find(o => o.outcomeId === `${BOOLEAN_PUBKEY}-YES`);
            expect(yes).toBeDefined();
            expect(yes!.outcomeId).toBe(`${BOOLEAN_PUBKEY}-YES`);
        });

        test('no outcome outcomeId is pubkey-NO', () => {
            const market = normalizer.normalizeMarket(rawBooleanMarket)!;
            const no = market.outcomes.find(o => o.outcomeId === `${BOOLEAN_PUBKEY}-NO`);
            expect(no).toBeDefined();
            expect(no!.outcomeId).toBe(`${BOOLEAN_PUBKEY}-NO`);
        });

        test('outcome prices are numbers', () => {
            const market = normalizer.normalizeMarket(rawBooleanMarket)!;
            for (const o of market.outcomes) {
                expect(typeof o.price).toBe('number');
            }
        });

        test('outcome prices are in [0, 1]', () => {
            const market = normalizer.normalizeMarket(rawBooleanMarket)!;
            for (const o of market.outcomes) {
                expect(o.price).toBeGreaterThanOrEqual(0);
                expect(o.price).toBeLessThanOrEqual(1);
            }
        });

        test('yes price is noPool / totalPool (pari-mutuel implied probability)', () => {
            const market = normalizer.normalizeMarket(rawBooleanMarket)!;
            // yesPrice = noPool / totalPool = 7 / 10 = 0.7
            // Find via market.yes set by addBinaryOutcomes
            expect(market.yes).toBeDefined();
            expect(market.yes!.price).toBeCloseTo(0.7, 5);
        });

        test('no price is yesPool / totalPool (pari-mutuel implied probability)', () => {
            const market = normalizer.normalizeMarket(rawBooleanMarket)!;
            // noPrice = yesPool / totalPool = 3 / 10 = 0.3
            expect(market.no).toBeDefined();
            expect(market.no!.price).toBeCloseTo(0.3, 5);
        });

        test('market.yes and market.no are populated by addBinaryOutcomes', () => {
            const market = normalizer.normalizeMarket(rawBooleanMarket)!;
            expect(market.yes).toBeDefined();
            expect(market.no).toBeDefined();
        });

        test('all outcome marketIds equal the pubkey', () => {
            const market = normalizer.normalizeMarket(rawBooleanMarket)!;
            for (const o of market.outcomes) {
                expect(o.marketId).toBe(BOOLEAN_PUBKEY);
            }
        });
    });

    // -------------------------------------------------------------------------
    // normalizeMarket - boolean with empty pools (edge case)
    // -------------------------------------------------------------------------

    describe('normalizeMarket (boolean, empty pools)', () => {
        const emptyPoolParsed: BaoziMarket = {
            ...rawBooleanParsed,
            yesPool: BigInt(0),
            noPool: BigInt(0),
        };

        test('prices default to 0.5 when totalPool is zero', () => {
            const market = normalizer.normalizeMarket({
                pubkey: BOOLEAN_PUBKEY,
                parsed: emptyPoolParsed,
            })!;
            // addBinaryOutcomes mutates labels; use market.yes / market.no
            expect(market.yes).toBeDefined();
            expect(market.no).toBeDefined();
            expect(market.yes!.price).toBeCloseTo(0.5, 5);
            expect(market.no!.price).toBeCloseTo(0.5, 5);
        });
    });

    // -------------------------------------------------------------------------
    // normalizeMarket - race
    // -------------------------------------------------------------------------

    describe('normalizeMarket (race)', () => {
        test('returns a non-null UnifiedMarket', () => {
            expect(normalizer.normalizeMarket(rawRaceMarket)).not.toBeNull();
        });

        test('marketId equals pubkey', () => {
            const market = normalizer.normalizeMarket(rawRaceMarket)!;
            expect(market.marketId).toBe(RACE_PUBKEY);
        });

        test('title equals the on-chain question', () => {
            const market = normalizer.normalizeMarket(rawRaceMarket)!;
            expect(market.title).toBe('Which chain will have the highest TVL in Q3 2026?');
        });

        test('produces outcomeCount outcomes', () => {
            const market = normalizer.normalizeMarket(rawRaceMarket)!;
            expect(market.outcomes).toHaveLength(3);
        });

        test('outcome labels match on-chain labels', () => {
            const market = normalizer.normalizeMarket(rawRaceMarket)!;
            const labels = market.outcomes.map(o => o.label);
            expect(labels).toContain('Solana');
            expect(labels).toContain('Ethereum');
            expect(labels).toContain('Base');
        });

        test('outcome outcomeIds follow pubkey-{index} pattern', () => {
            const market = normalizer.normalizeMarket(rawRaceMarket)!;
            for (let i = 0; i < 3; i++) {
                expect(market.outcomes[i].outcomeId).toBe(`${RACE_PUBKEY}-${i}`);
            }
        });

        test('outcome prices are numbers in [0, 1]', () => {
            const market = normalizer.normalizeMarket(rawRaceMarket)!;
            for (const o of market.outcomes) {
                expect(typeof o.price).toBe('number');
                expect(o.price).toBeGreaterThanOrEqual(0);
                expect(o.price).toBeLessThanOrEqual(1);
            }
        });

        test('outcome prices roughly sum to 1 after normalization', () => {
            const market = normalizer.normalizeMarket(rawRaceMarket)!;
            const sum = market.outcomes.reduce((acc, o) => acc + o.price, 0);
            expect(sum).toBeCloseTo(1, 4);
        });

        test('volume equals totalPool in SOL', () => {
            const market = normalizer.normalizeMarket(rawRaceMarket)!;
            expect(market.volume).toBeCloseTo(10, 5);
        });

        test('category is undefined for race markets (tier is not a topic category)', () => {
            const market = normalizer.normalizeMarket(rawRaceMarket)!;
            expect(market.category).toBeUndefined();
        });

        test('tags include race', () => {
            const market = normalizer.normalizeMarket(rawRaceMarket)!;
            expect(market.tags).toContain('race');
        });

        test('url is built from pubkey', () => {
            const market = normalizer.normalizeMarket(rawRaceMarket)!;
            expect(market.url).toBe(`https://baozi.bet/market/${RACE_PUBKEY}`);
        });
    });

    // -------------------------------------------------------------------------
    // normalizeMarket - null guard
    // -------------------------------------------------------------------------

    describe('normalizeMarket null guard', () => {
        test('returns null for null input', () => {
            expect(normalizer.normalizeMarket(null as any)).toBeNull();
        });

        test('returns null when parsed lacks both yesPool and outcomeCount', () => {
            const ambiguous = { pubkey: 'abc', parsed: { question: 'What?' } } as any;
            expect(normalizer.normalizeMarket(ambiguous)).toBeNull();
        });
    });

    // -------------------------------------------------------------------------
    // normalizeEvent
    // -------------------------------------------------------------------------

    describe('normalizeEvent', () => {
        test('wraps boolean market into a UnifiedEvent', () => {
            const event = normalizer.normalizeEvent(rawBooleanMarket);
            expect(event).not.toBeNull();
            expect(event!.id).toBe(BOOLEAN_PUBKEY);
        });

        test('event title matches market title', () => {
            const event = normalizer.normalizeEvent(rawBooleanMarket)!;
            expect(event.title).toBe('Will SOL reach $500 before July 2026?');
        });

        test('event markets array contains the single market', () => {
            const event = normalizer.normalizeEvent(rawBooleanMarket)!;
            expect(event.markets).toHaveLength(1);
            expect(event.markets[0].marketId).toBe(BOOLEAN_PUBKEY);
        });

        test('event volume equals market volume', () => {
            const event = normalizer.normalizeEvent(rawBooleanMarket)!;
            expect(event.volume).toBe(event.markets[0].volume);
        });

        test('event url matches market url', () => {
            const event = normalizer.normalizeEvent(rawBooleanMarket)!;
            expect(event.url).toBe(`https://baozi.bet/market/${BOOLEAN_PUBKEY}`);
        });

        test('returns null when normalizeMarket returns null', () => {
            expect(normalizer.normalizeEvent(null as any)).toBeNull();
        });
    });

    // -------------------------------------------------------------------------
    // normalizeBalance
    // -------------------------------------------------------------------------

    describe('normalizeBalance', () => {
        test('converts lamports to SOL', () => {
            const balances = normalizer.normalizeBalance({ lamports: 2_500_000_000 });
            expect(balances).toHaveLength(1);
            expect(balances[0].currency).toBe('SOL');
            expect(balances[0].total).toBeCloseTo(2.5, 5);
            expect(balances[0].available).toBeCloseTo(2.5, 5);
            expect(balances[0].locked).toBe(0);
        });

        test('zero lamports returns zero balance', () => {
            const balances = normalizer.normalizeBalance({ lamports: 0 });
            expect(balances[0].total).toBe(0);
        });
    });
});
