/**
 * Normalizer fixture tests for HunchNormalizer.
 *
 * Hunch is a PARIMUTUEL prediction market on Base (USDC, x402/EIP-3009). Each
 * suite declares a frozen raw fixture mirroring the live agent API
 * (`/api/agent/v1/*`), runs it through the normalizer, and asserts every field
 * on the resulting Unified* shape. No network I/O.
 *
 * Money-path note: `outcomeId` MUST round-trip back to a Hunch trade `side`
 * (createOrder parses it via parseHunchSide). The buildOutcomeId/parseHunchSide
 * round-trip is asserted explicitly because a broken encoding would route a bet
 * to the wrong outcome.
 *
 * Prices are implied parimutuel odds (cents → 0..1). The list path carries no
 * live odds (flat 0); odds/ladder ride on the quote/research single-market reads
 * — mirrors Myriad's "static on list, live on detail" model.
 */

import { HunchNormalizer } from '../../src/exchanges/hunch/normalizer';
import {
    buildOutcomeId,
    parseHunchSide,
    mapHunchStatus,
    type HunchLadderOutcome,
} from '../../src/exchanges/hunch/utils';
import type {
    HunchRawMarket,
    HunchRawResearch,
    HunchRawPosition,
    HunchRawReadiness,
    HunchRawOddsHistoryPoint,
} from '../../src/exchanges/hunch/fetcher';

// ============================================================================
// HunchNormalizer
// ============================================================================

describe('HunchNormalizer', () => {
    const normalizer = new HunchNormalizer();

    // -------------------------------------------------------------------------
    // Fixtures — mirror src/agent/schemas.ts (AgentMarketRef et al.)
    // -------------------------------------------------------------------------

    /** A binary YES/NO market (e.g. "$HUNCH → $10M"). */
    const binaryMarket: HunchRawMarket = Object.freeze({
        id: 'hunch-10m',
        slug: 'hunch-10m',
        question: 'Will $HUNCH reach $10M market cap?',
        shortTitle: '$HUNCH → $10M',
        summary: 'A native Hunch YES/NO market.',
        category: 'market_cap',
        tokenSymbol: 'HUNCH',
        chainId: 'base',
        deadlineAt: '2026-06-30T00:00:00.000Z',
        deadlineLabel: 'Jun 30',
        status: 'open',
        feeBps: 200,
        feeRecipientLabel: 'Hunch market treasury',
        defaultTicketUsd: 1,
        virtualLiquidityUsd: 10_000,
        volumeUsd: 1_240,
        totalBets: 142,
        targetMarketCapUsd: 10_000_000,
        outcomes: null,
        headline: '$HUNCH → $10M · YES 12¢ / NO 88¢',
        links: {
            app: 'https://www.playhunch.xyz/markets/hunch-10m',
            quote: 'https://www.playhunch.xyz/api/agent/v1/quote?marketId=hunch-10m',
            trade: 'https://www.playhunch.xyz/api/agent/v1/trade',
            research: 'https://www.playhunch.xyz/api/agent/v1/markets/hunch-10m/research',
        },
    }) as HunchRawMarket;

    const binaryOdds = Object.freeze({ yesPriceCents: 12, noPriceCents: 88 });

    /** An N-way mcap-ladder market ("pick the closing range"). */
    const ladderMarket: HunchRawMarket = Object.freeze({
        ...binaryMarket,
        id: 'bnkr-mcap-ladder-jun-30-2026',
        slug: 'bnkr-mcap-ladder-jun-30-2026',
        question: 'Where does $BNKR market cap close on June 30?',
        tokenSymbol: 'BNKR',
        targetMarketCapUsd: null,
        headline: null,
        outcomes: [
            { key: 'le-330m', label: '$330M or less', shortLabel: '≤$330M', lowerUsd: null, upperUsd: 330_000_000 },
            { key: '330m-360m', label: '$330M – $360M', shortLabel: '$330–360M', lowerUsd: 330_000_000, upperUsd: 360_000_000 },
            { key: 'ge-360m', label: '$360M or more', shortLabel: '≥$360M', lowerUsd: 360_000_000, upperUsd: null },
        ],
    }) as HunchRawMarket;

    /** A live ladder (quote/research-derived) pricing the rungs. */
    const ladderOutcomes: HunchLadderOutcome[] = [
        { key: 'le-330m', label: '$330M or less', shortLabel: '≤$330M', lowerUsd: null, upperUsd: 330_000_000, impliedPct: 25, backedUsd: 50, isCurrent: false },
        { key: '330m-360m', label: '$330M – $360M', shortLabel: '$330–360M', lowerUsd: 330_000_000, upperUsd: 360_000_000, impliedPct: 55, backedUsd: 110, isCurrent: true },
        { key: 'ge-360m', label: '$360M or more', shortLabel: '≥$360M', lowerUsd: 360_000_000, upperUsd: null, impliedPct: 20, backedUsd: 40, isCurrent: false },
    ];

    // -------------------------------------------------------------------------
    // normalizeMarket — binary, WITH live odds
    // -------------------------------------------------------------------------

    describe('normalizeMarket — binary (with odds)', () => {
        const market = () => normalizer.normalizeMarket(binaryMarket, binaryOdds)!;

        it('returns a non-null UnifiedMarket', () => {
            expect(market()).not.toBeNull();
        });

        it('marketId is the raw Hunch id (slug-shaped, no prefix)', () => {
            expect(market().marketId).toBe('hunch-10m');
        });

        it('title is the question', () => {
            expect(market().title).toBe('Will $HUNCH reach $10M market cap?');
        });

        it('produces exactly 2 outcomes (YES / NO)', () => {
            expect(market().outcomes).toHaveLength(2);
        });

        it('YES outcomeId round-trips to side "yes"', () => {
            const yes = market().outcomes[0];
            expect(yes.outcomeId).toBe('hunch-10m:yes');
            expect(parseHunchSide(yes.outcomeId)).toEqual({ marketId: 'hunch-10m', side: 'yes' });
        });

        it('NO outcomeId round-trips to side "no"', () => {
            const no = market().outcomes[1];
            expect(no.outcomeId).toBe('hunch-10m:no');
            expect(parseHunchSide(no.outcomeId)).toEqual({ marketId: 'hunch-10m', side: 'no' });
        });

        it('YES price is yesPriceCents / 100', () => {
            expect(market().outcomes[0].price).toBeCloseTo(0.12, 5);
        });

        it('NO price is noPriceCents / 100', () => {
            expect(market().outcomes[1].price).toBeCloseTo(0.88, 5);
        });

        it('prices sit in the open interval (0, 1)', () => {
            for (const o of market().outcomes) {
                expect(o.price).toBeGreaterThan(0);
                expect(o.price).toBeLessThan(1);
            }
        });

        it('volume comes from volumeUsd (parimutuel pool size)', () => {
            expect(market().volume).toBe(1_240);
        });

        it('volume24h is 0 when this fixture carries no volume24hUsd', () => {
            expect(market().volume24h).toBe(0);
        });

        it('liquidity comes from virtualLiquidityUsd', () => {
            expect(market().liquidity).toBe(10_000);
        });

        it('status maps open → active', () => {
            expect(market().status).toBe('active');
        });

        it('resolutionDate is parsed from deadlineAt', () => {
            expect(market().resolutionDate?.toISOString()).toBe('2026-06-30T00:00:00.000Z');
        });

        it('url is the app link', () => {
            expect(market().url).toBe('https://www.playhunch.xyz/markets/hunch-10m');
        });

        it('tags carry the token symbol', () => {
            expect(market().tags).toContain('HUNCH');
        });

        it('addBinaryOutcomes sets the yes/no convenience accessors', () => {
            const m = market() as any;
            expect(m.yes?.outcomeId).toBe('hunch-10m:yes');
            expect(m.no?.outcomeId).toBe('hunch-10m:no');
        });

        it('sourceMetadata preserves non-promoted fields (headline, deadlineLabel)', () => {
            const meta = market().sourceMetadata as Record<string, unknown>;
            expect(meta.headline).toBe('$HUNCH → $10M · YES 12¢ / NO 88¢');
            expect(meta.deadlineLabel).toBe('Jun 30');
        });
    });

    // -------------------------------------------------------------------------
    // normalizeMarket — binary, NO odds (the bare list path)
    // -------------------------------------------------------------------------

    describe('normalizeMarket — binary (list path, no odds)', () => {
        it('still yields YES/NO outcomes with flat 0 prices', () => {
            const m = normalizer.normalizeMarket(binaryMarket)!;
            expect(m.outcomes).toHaveLength(2);
            expect(m.outcomes[0].price).toBe(0);
            expect(m.outcomes[1].price).toBe(0);
        });

        it('volume is undefined when volumeUsd is absent (prod not yet redeployed)', () => {
            const noVol: HunchRawMarket = { ...binaryMarket, volumeUsd: undefined };
            expect(normalizer.normalizeMarket(noVol)!.volume).toBeUndefined();
        });
    });

    // -------------------------------------------------------------------------
    // normalizeMarket — N-way ladder
    // -------------------------------------------------------------------------

    describe('normalizeMarket — N-way ladder (with live ladder)', () => {
        const market = () => normalizer.normalizeMarket(ladderMarket, undefined, { outcomes: ladderOutcomes })!;

        it('produces one outcome per rung', () => {
            expect(market().outcomes).toHaveLength(3);
        });

        it('each outcomeId is marketId:bucketKey and round-trips to the bucket side', () => {
            const o = market().outcomes[1];
            expect(o.outcomeId).toBe('bnkr-mcap-ladder-jun-30-2026:330m-360m');
            expect(parseHunchSide(o.outcomeId)).toEqual({
                marketId: 'bnkr-mcap-ladder-jun-30-2026',
                side: '330m-360m',
            });
        });

        it('rung price is the live impliedPct / 100', () => {
            expect(market().outcomes[1].price).toBeCloseTo(0.55, 5);
        });

        it('outcome metadata carries the bucket bounds + live backing', () => {
            const meta = market().outcomes[1].metadata as Record<string, unknown>;
            expect(meta.key).toBe('330m-360m');
            expect(meta.lowerUsd).toBe(330_000_000);
            expect(meta.upperUsd).toBe(360_000_000);
            expect(meta.isCurrent).toBe(true);
            expect(meta.backedUsd).toBe(110);
        });

        it('without a live ladder, rung prices fall back to 0', () => {
            const m = normalizer.normalizeMarket(ladderMarket)!;
            expect(m.outcomes.every((o) => o.price === 0)).toBe(true);
        });
    });

    // -------------------------------------------------------------------------
    // normalizeMarket — null / status guards
    // -------------------------------------------------------------------------

    describe('normalizeMarket guards + status mapping', () => {
        it('returns null for null input', () => {
            expect(normalizer.normalizeMarket(null as any)).toBeNull();
        });

        it('returns null when id is missing', () => {
            expect(normalizer.normalizeMarket({ slug: 'x' } as any)).toBeNull();
        });

        it('maps closed → inactive and resolved → closed', () => {
            expect(mapHunchStatus('closed')).toBe('inactive');
            expect(mapHunchStatus('resolved')).toBe('closed');
            expect(mapHunchStatus('open')).toBe('active');
            expect(mapHunchStatus(undefined)).toBe('active');
        });
    });

    // -------------------------------------------------------------------------
    // buildOutcomeId / parseHunchSide — the money-path encoding
    // -------------------------------------------------------------------------

    describe('outcomeId encoding round-trips (createOrder depends on this)', () => {
        it.each(['yes', 'no', 'up', 'down', 'le-330m', '330m-360m', 'jun-1-15'])(
            'side "%s" survives build→parse',
            (side) => {
                const id = buildOutcomeId('some-market-slug', side);
                expect(parseHunchSide(id)).toEqual({ marketId: 'some-market-slug', side });
            },
        );
    });

    // -------------------------------------------------------------------------
    // normalizeEvent — single-market wrap (Hunch has no event tier)
    // -------------------------------------------------------------------------

    describe('normalizeEvent', () => {
        it('wraps the market as a single-market event', () => {
            const ev = normalizer.normalizeEvent(binaryMarket)!;
            expect(ev.id).toBe('hunch-10m');
            expect(ev.markets).toHaveLength(1);
            expect(ev.markets[0].marketId).toBe('hunch-10m');
        });

        it('returns null when the underlying market is unmappable', () => {
            expect(normalizer.normalizeEvent({ slug: 'x' } as any)).toBeNull();
        });
    });

    // -------------------------------------------------------------------------
    // normalizeOHLCV — flat candles from oddsHistory
    // -------------------------------------------------------------------------

    describe('normalizeOHLCV', () => {
        const research = {
            oddsHistory: [
                { at: '2026-06-10T00:00:00.000Z', yesPct: 10, outcomeKey: null, sizeUsd: 5 },
                { at: '2026-06-11T00:00:00.000Z', yesPct: 12, outcomeKey: null, sizeUsd: 3 },
            ] as HunchRawOddsHistoryPoint[],
        } as HunchRawResearch;

        it('produces one flat candle per fill at the realized probability', () => {
            const candles = normalizer.normalizeOHLCV(research, { resolution: '1d' } as any, 'yes');
            expect(candles).toHaveLength(2);
            expect(candles[0]).toMatchObject({ open: 0.1, high: 0.1, low: 0.1, close: 0.1 });
            expect(candles[1].close).toBeCloseTo(0.12, 5);
        });

        it('honors the limit by keeping the most recent candles', () => {
            const candles = normalizer.normalizeOHLCV(research, { resolution: '1d', limit: 1 } as any, 'yes');
            expect(candles).toHaveLength(1);
            expect(candles[0].close).toBeCloseTo(0.12, 5);
        });
    });

    // -------------------------------------------------------------------------
    // normalizeOrderBook — emulated single level at the implied price
    // -------------------------------------------------------------------------

    describe('normalizeOrderBook (emulated parimutuel level)', () => {
        const research = {
            odds: { yesPriceCents: 12, noPriceCents: 88 },
            stats: { totalBets: 142, totalPoolUsd: 1_240, yesPoolUsd: 600, noPoolUsd: 640, feeUsd: 24.8 },
            ladder: null,
            market: binaryMarket,
        } as unknown as HunchRawResearch;

        it('YES book is a single level at the YES implied price, pool as depth', () => {
            const book = normalizer.normalizeOrderBook(research, 'hunch-10m:yes');
            expect(book.bids).toHaveLength(1);
            expect(book.asks).toHaveLength(1);
            expect(book.bids[0].price).toBeCloseTo(0.12, 5);
            expect(book.bids[0].size).toBe(1_240);
        });

        it('NO book reflects the NO implied price', () => {
            const book = normalizer.normalizeOrderBook(research, 'hunch-10m:no');
            expect(book.bids[0].price).toBeCloseTo(0.88, 5);
        });
    });

    // -------------------------------------------------------------------------
    // normalizePosition / normalizeBalance
    // -------------------------------------------------------------------------

    describe('normalizePosition', () => {
        const rawPosition: HunchRawPosition = Object.freeze({
            marketId: 'hunch-10m',
            slug: 'hunch-10m',
            question: 'Will $HUNCH reach $10M market cap?',
            side: 'yes',
            outcomeLabel: 'YES',
            shares: 9.6,
            stakedUsd: 5,
            avgEntryCents: 52,
            currentCents: 53,
            pnlUsd: 0.1,
            maxPayoutUsd: 9.6,
            status: 'open',
            appUrl: 'https://www.playhunch.xyz/markets/hunch-10m',
            proofUrl: null,
            filledAt: '2026-06-12T00:00:01.000Z',
        }) as HunchRawPosition;

        it('size is the share count', () => {
            expect(normalizer.normalizePosition(rawPosition).size).toBe(9.6);
        });

        it('outcomeId round-trips to the held side', () => {
            const pos = normalizer.normalizePosition(rawPosition);
            expect(pos.outcomeId).toBe('hunch-10m:yes');
            expect(parseHunchSide(pos.outcomeId).side).toBe('yes');
        });

        it('entry/current cents convert to 0..1 probabilities', () => {
            const pos = normalizer.normalizePosition(rawPosition);
            expect(pos.entryPrice).toBeCloseTo(0.52, 5);
            expect(pos.currentPrice).toBeCloseTo(0.53, 5);
        });

        it('carries pnl + base chain', () => {
            const pos = normalizer.normalizePosition(rawPosition);
            expect(pos.unrealizedPnL).toBeCloseTo(0.1, 5);
            expect(pos.chain).toBe('base');
        });
    });

    describe('normalizeBalance', () => {
        it('maps readiness usdcBalanceUsd to a single USDC balance', () => {
            const readiness = { usdcBalanceUsd: 12.5 } as HunchRawReadiness;
            const [bal] = normalizer.normalizeBalance(readiness);
            expect(bal).toEqual({ currency: 'USDC', total: 12.5, available: 12.5, locked: 0 });
        });

        it('defaults to 0 when balance is null (unfunded / unknown wallet)', () => {
            const readiness = { usdcBalanceUsd: null } as HunchRawReadiness;
            expect(normalizer.normalizeBalance(readiness)[0].total).toBe(0);
        });
    });

    // -------------------------------------------------------------------------
    // pmxt surfacing: live odds + 24h volume + category/tags off the LIST item
    // -------------------------------------------------------------------------
    describe('normalizeMarket — list odds + 24h volume (pmxt surfacing)', () => {
        it('prices binary YES/NO from raw.odds on the bare list path (no explicit odds arg)', () => {
            const raw = { ...binaryMarket, odds: { yesPriceCents: 64, noPriceCents: 36 } } as HunchRawMarket;
            const m = normalizer.normalizeMarket(raw)!;
            expect(m.outcomes[0].price).toBeCloseTo(0.64, 5);
            expect(m.outcomes[1].price).toBeCloseTo(0.36, 5);
        });

        it('lets an explicit odds arg (detail/quote) win over raw.odds', () => {
            const raw = { ...binaryMarket, odds: { yesPriceCents: 64, noPriceCents: 36 } } as HunchRawMarket;
            const m = normalizer.normalizeMarket(raw, { yesPriceCents: 90, noPriceCents: 10 })!;
            expect(m.outcomes[0].price).toBeCloseTo(0.9, 5);
        });

        it('passes through volume24h from raw.volume24hUsd', () => {
            const raw = { ...binaryMarket, volume24hUsd: 320 } as HunchRawMarket;
            expect(normalizer.normalizeMarket(raw)!.volume24h).toBe(320);
        });

        it('volume24h is 0 when the list item carries no 24h figure', () => {
            expect(normalizer.normalizeMarket(binaryMarket)!.volume24h).toBe(0);
        });
    });

    describe('category + tags alignment (pmxt taxonomy)', () => {
        it('maps a Hunch crypto subtype to the top-level "Crypto" category', () => {
            expect(normalizer.normalizeMarket(binaryMarket)!.category).toBe('Crypto');
        });

        it('maps an event market to "Culture"', () => {
            const raw = { ...binaryMarket, category: 'event' } as HunchRawMarket;
            expect(normalizer.normalizeMarket(raw)!.category).toBe('Culture');
        });

        it('tags carry the top category, a human subtype label, and the token', () => {
            const tags = normalizer.normalizeMarket(binaryMarket)!.tags ?? [];
            expect(tags).toContain('Crypto');
            expect(tags).toContain('Market Cap');
            expect(tags).toContain('HUNCH');
        });
    });
});
