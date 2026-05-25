/**
 * Normalizer fixture tests for SuibetsNormalizer.
 *
 * Each test suite:
 *  1. Declares a frozen raw fixture that mirrors what the real API returns.
 *  2. Passes the fixture through the normalizer under test.
 *  3. Asserts every field on the resulting UnifiedMarket / UnifiedEvent / Position.
 *
 * No network I/O occurs — all external dependencies are bypassed by
 * constructing the raw types directly.
 *
 * MIST conversion: SuiBets stakes are expressed in MIST (1 SUI = 1e9 MIST).
 * All monetary fields in the assertions are in SUI.
 */

import { SuibetsNormalizer } from '../../src/exchanges/suibets/normalizer';
import type { SuibetsRawOffer, SuibetsRawEvent } from '../../src/exchanges/suibets/fetcher';

// ============================================================================
// SuibetsNormalizer
// ============================================================================

describe('SuibetsNormalizer', () => {
    const normalizer = new SuibetsNormalizer();

    // -------------------------------------------------------------------------
    // Fixtures
    // -------------------------------------------------------------------------

    /**
     * A fully-populated P2P offer with all optional fields present.
     * Staked amounts are in MIST (1 SUI = 1_000_000_000 MIST).
     */
    const rawOffer: SuibetsRawOffer = Object.freeze({
        id: 'offer-123',
        matchId: 'match-456',
        matchName: 'Real Madrid vs Barcelona',
        sport: 'Football',
        homeTeam: 'Real Madrid',
        awayTeam: 'Barcelona',
        creatorWallet: '0xabc123',
        creatorTeam: 'Real Madrid',
        creatorOdds: 2.5,
        creatorStake: 5_000_000_000,    // 5 SUI in MIST
        takerStake: 7_500_000_000,
        remainingStake: 3_000_000_000,
        matchDate: '2026-06-15T20:00:00Z',
        expiresAt: '2026-06-15T19:00:00Z',
        status: 'OPEN',
        totalMatched: 2_000_000_000,
        currency: 'SUI',
        isOnchain: true,
        onchainOfferId: '0xdef456',
        leagueName: 'La Liga',
    });

    /**
     * A raw event that groups the offer above under a match.
     * The normalizer synthesises volume24h by summing market volumes.
     */
    const rawEvent: SuibetsRawEvent = Object.freeze({
        id: 'match-456',
        name: 'Real Madrid vs Barcelona',
        homeTeam: 'Real Madrid',
        awayTeam: 'Barcelona',
        sport: 'Football',
        leagueName: 'La Liga',
        matchDate: '2026-06-15T20:00:00Z',
        status: 'active',
        offers: [rawOffer],
    });

    // Derived constants — keep in sync with the fixture so assertions are
    // readable and the maths is self-documenting.
    const CREATOR_ODDS = 2.5;
    const CREATOR_PROB = 1 / CREATOR_ODDS;           // 0.4
    const TAKER_PROB = 1 - CREATOR_PROB;             // 0.6
    const LIQUIDITY_SUI = 3_000_000_000 / 1e9;       // 3 SUI
    const VOLUME24H_SUI = 2_000_000_000 / 1e9;       // 2 SUI
    const CREATOR_STAKE_SUI = 5_000_000_000 / 1e9;   // 5 SUI

    // -------------------------------------------------------------------------
    // normalizeMarket — happy path
    // -------------------------------------------------------------------------

    describe('normalizeMarket', () => {
        it('returns a non-null result for a valid offer', () => {
            const market = normalizer.normalizeMarket(rawOffer);
            expect(market).not.toBeNull();
        });

        it('marketId is prefixed with suibets:', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect(market.marketId).toBe('suibets:offer-123');
        });

        it('eventId is prefixed with suibets:', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect(market.eventId).toBe('suibets:match-456');
        });

        it('title contains the match name', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect(market.title).toContain('Real Madrid vs Barcelona');
        });

        it('slug is the raw offer id without prefix', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect(market.slug).toBe('offer-123');
        });

        it('produces exactly 2 outcomes', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect(market.outcomes).toHaveLength(2);
        });

        it('creator outcome has the correct outcomeId', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect(market.outcomes[0].outcomeId).toBe('offer-123:creator');
        });

        it('creator outcome label is the creatorTeam', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect(market.outcomes[0].label).toBe('Real Madrid');
        });

        it('creator outcome price is 1 / creatorOdds', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect(market.outcomes[0].price).toBeCloseTo(CREATOR_PROB, 5);
        });

        it('creator outcome marketId is suibets:offer-123', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect(market.outcomes[0].marketId).toBe('suibets:offer-123');
        });

        it('taker outcome has the correct outcomeId', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect(market.outcomes[1].outcomeId).toBe('offer-123:taker');
        });

        it('taker outcome label is the opposing team (awayTeam when creatorTeam is homeTeam)', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect(market.outcomes[1].label).toBe('Barcelona');
        });

        it('taker outcome price is 1 - (1 / creatorOdds)', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect(market.outcomes[1].price).toBeCloseTo(TAKER_PROB, 5);
        });

        it('taker outcome marketId is suibets:offer-123', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect(market.outcomes[1].marketId).toBe('suibets:offer-123');
        });

        it('creator and taker prices are in the open interval (0, 1)', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            for (const o of market.outcomes) {
                expect(o.price).toBeGreaterThan(0);
                expect(o.price).toBeLessThan(1);
            }
        });

        it('liquidity is remainingStake converted from MIST to SUI', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect(market.liquidity).toBeCloseTo(LIQUIDITY_SUI, 5);
        });

        it('volume24h is totalMatched converted from MIST to SUI', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect(market.volume24h).toBeCloseTo(VOLUME24H_SUI, 5);
        });

        it('status is "active" when raw status is "OPEN"', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect(market.status).toBe('active');
        });

        it('contractAddress is the onchainOfferId', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect(market.contractAddress).toBe('0xdef456');
        });

        it('resolutionDate is a valid Date instance', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect(market.resolutionDate).toBeInstanceOf(Date);
            expect(isNaN(market.resolutionDate.getTime())).toBe(false);
        });

        it('resolutionDate is derived from matchDate', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect(market.resolutionDate.toISOString()).toBe('2026-06-15T20:00:00.000Z');
        });

        it('category is "Sports"', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect(market.category).toBe('Sports');
        });

        it('tags include "Sports", "P2P", the sport, and the league', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect(Array.isArray(market.tags)).toBe(true);
            expect(market.tags).toContain('Sports');
            expect(market.tags).toContain('P2P');
            expect(market.tags).toContain('Football');
            expect(market.tags).toContain('La Liga');
        });

        it('url points to the suibets P2P page', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect(market.url).toContain('suibets');
        });

        it('yes is set to outcomes[0] (creator side)', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect((market as any).yes).toBeDefined();
            expect((market as any).yes.outcomeId).toBe('offer-123:creator');
        });

        it('no is set to outcomes[1] (taker side)', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect((market as any).no).toBeDefined();
            expect((market as any).no.outcomeId).toBe('offer-123:taker');
        });
    });

    // -------------------------------------------------------------------------
    // normalizeMarket — null / degenerate guards
    // -------------------------------------------------------------------------

    describe('normalizeMarket null guards', () => {
        it('returns null for null input', () => {
            expect(normalizer.normalizeMarket(null as any)).toBeNull();
        });

        it('returns null when id is undefined', () => {
            expect(normalizer.normalizeMarket({ id: undefined } as any)).toBeNull();
        });
    });

    // -------------------------------------------------------------------------
    // normalizeMarket — liquidity falls back to creatorStake when remainingStake
    // is absent
    // -------------------------------------------------------------------------

    describe('normalizeMarket liquidity fallback', () => {
        it('liquidity uses creatorStake when remainingStake is absent', () => {
            const offerNoRemaining: SuibetsRawOffer = {
                ...rawOffer,
                remainingStake: undefined,
            };
            const market = normalizer.normalizeMarket(offerNoRemaining)!;
            expect(market.liquidity).toBeCloseTo(CREATOR_STAKE_SUI, 5);
        });
    });

    // -------------------------------------------------------------------------
    // normalizeMarket — status mapping
    // -------------------------------------------------------------------------

    describe('normalizeMarket status mapping', () => {
        it('"OPEN" maps to "active"', () => {
            const market = normalizer.normalizeMarket(rawOffer)!;
            expect(market.status).toBe('active');
        });

        it('unrecognised status maps to "inactive"', () => {
            const closedOffer: SuibetsRawOffer = { ...rawOffer, status: 'CLOSED' };
            const market = normalizer.normalizeMarket(closedOffer)!;
            expect(market.status).toBe('inactive');
        });

        it('"MATCHED" maps to "matched"', () => {
            const matchedOffer: SuibetsRawOffer = { ...rawOffer, status: 'MATCHED' };
            const market = normalizer.normalizeMarket(matchedOffer)!;
            expect(market.status).toBe('matched');
        });

        it('"SETTLED" maps to "settled"', () => {
            const settledOffer: SuibetsRawOffer = { ...rawOffer, status: 'SETTLED' };
            const market = normalizer.normalizeMarket(settledOffer)!;
            expect(market.status).toBe('settled');
        });

        it('"EXPIRED" maps to "expired"', () => {
            const expiredOffer: SuibetsRawOffer = { ...rawOffer, status: 'EXPIRED' };
            const market = normalizer.normalizeMarket(expiredOffer)!;
            expect(market.status).toBe('expired');
        });
    });

    // -------------------------------------------------------------------------
    // normalizeEvent
    // -------------------------------------------------------------------------

    describe('normalizeEvent', () => {
        it('returns a non-null result for a valid event', () => {
            const event = normalizer.normalizeEvent(rawEvent);
            expect(event).not.toBeNull();
        });

        it('id is prefixed with suibets:', () => {
            const event = normalizer.normalizeEvent(rawEvent)!;
            expect(event.id).toBe('suibets:match-456');
        });

        it('title is taken from the event name', () => {
            const event = normalizer.normalizeEvent(rawEvent)!;
            expect(event.title).toBe('Real Madrid vs Barcelona');
        });

        it('slug is the raw event id without prefix', () => {
            const event = normalizer.normalizeEvent(rawEvent)!;
            expect(event.slug).toBe('match-456');
        });

        it('markets is populated from the offers array', () => {
            const event = normalizer.normalizeEvent(rawEvent)!;
            expect(Array.isArray(event.markets)).toBe(true);
            expect(event.markets).toHaveLength(1);
        });

        it('each nested market is a valid UnifiedMarket', () => {
            const event = normalizer.normalizeEvent(rawEvent)!;
            for (const m of event.markets) {
                expect(typeof m.marketId).toBe('string');
                expect(m.marketId.length).toBeGreaterThan(0);
                expect(Array.isArray(m.outcomes)).toBe(true);
                expect(m.outcomes.length).toBeGreaterThan(0);
            }
        });

        it('volume24h sums volume across all child markets', () => {
            const event = normalizer.normalizeEvent(rawEvent)!;
            const expectedSum = event.markets.reduce(
                (acc, m) => acc + (m.volume ?? m.volume24h ?? 0),
                0,
            );
            expect(event.volume24h).toBeCloseTo(expectedSum, 5);
        });

        it('volume24h is non-zero when totalMatched is present on offers', () => {
            const event = normalizer.normalizeEvent(rawEvent)!;
            expect(event.volume24h).toBeGreaterThan(0);
        });

        it('category is "Sports"', () => {
            const event = normalizer.normalizeEvent(rawEvent)!;
            expect(event.category).toBe('Sports');
        });

        it('tags include "Sports", "P2P", and "Sui"', () => {
            const event = normalizer.normalizeEvent(rawEvent)!;
            expect(Array.isArray(event.tags)).toBe(true);
            expect(event.tags).toContain('Sports');
            expect(event.tags).toContain('P2P');
            expect(event.tags).toContain('Sui');
        });

        it('url points to the suibets P2P page', () => {
            const event = normalizer.normalizeEvent(rawEvent)!;
            expect(event.url).toContain('suibets');
        });

        it('returns null for null input', () => {
            expect(normalizer.normalizeEvent(null as any)).toBeNull();
        });

        it('returns null when event id is absent', () => {
            expect(normalizer.normalizeEvent({ id: undefined } as any)).toBeNull();
        });

        it('markets is empty when offers is an empty array', () => {
            const emptyEvent: SuibetsRawEvent = { ...rawEvent, offers: [] };
            const event = normalizer.normalizeEvent(emptyEvent)!;
            expect(event.markets).toHaveLength(0);
        });

        it('markets is empty when offers is absent', () => {
            const noOffersEvent: SuibetsRawEvent = { ...rawEvent, offers: undefined };
            const event = normalizer.normalizeEvent(noOffersEvent)!;
            expect(event.markets).toHaveLength(0);
        });
    });

    // -------------------------------------------------------------------------
    // normalizePosition
    // -------------------------------------------------------------------------

    describe('normalizePosition', () => {
        it('marketId is suibets:matchId when matchId is present', () => {
            const position = normalizer.normalizePosition(rawOffer);
            expect(position.marketId).toBe('suibets:match-456');
        });

        it('outcomeId is offer-id:creator', () => {
            const position = normalizer.normalizePosition(rawOffer);
            expect(position.outcomeId).toBe('offer-123:creator');
        });

        it('outcomeLabel is the creator team name', () => {
            const position = normalizer.normalizePosition(rawOffer);
            expect(position.outcomeLabel).toBe('Real Madrid');
        });

        it('size is creatorStake converted from MIST to SUI', () => {
            const position = normalizer.normalizePosition(rawOffer);
            expect(position.size).toBeCloseTo(CREATOR_STAKE_SUI, 5);
        });

        it('entryPrice is 1 / creatorOdds', () => {
            const position = normalizer.normalizePosition(rawOffer);
            expect(position.entryPrice).toBeCloseTo(CREATOR_PROB, 5);
        });

        it('currentPrice equals entryPrice (no live price feed)', () => {
            const position = normalizer.normalizePosition(rawOffer);
            expect(position.currentPrice).toBeCloseTo(position.entryPrice, 5);
        });

        it('unrealizedPnL is 0', () => {
            const position = normalizer.normalizePosition(rawOffer);
            expect(position.unrealizedPnL).toBe(0);
        });

        it('entryPrice is in the open interval (0, 1)', () => {
            const position = normalizer.normalizePosition(rawOffer);
            expect(position.entryPrice).toBeGreaterThan(0);
            expect(position.entryPrice).toBeLessThan(1);
        });

        it('marketId falls back to suibets:offer-id when matchId is absent', () => {
            const offerNoMatch: SuibetsRawOffer = { ...rawOffer, matchId: undefined as any };
            const position = normalizer.normalizePosition(offerNoMatch);
            expect(position.marketId).toBe('suibets:offer-123');
        });
    });
});
