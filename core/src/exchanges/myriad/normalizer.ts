import { OHLCVParams } from '../../BaseExchange';
import { UnifiedMarket, UnifiedEvent, PriceCandle, OrderBook, Trade, UserTrade, Position, Balance, CandleInterval, MarketOutcome } from '../../types';
import { IExchangeNormalizer } from '../interfaces';
import { addBinaryOutcomes } from '../../utils/market-utils';
import { buildSourceMetadata } from '../../utils/metadata';
import { MyriadRawMarket, MyriadRawQuestion, MyriadRawTradeEvent, MyriadRawPortfolioItem } from './fetcher';
import { resolveMyriadPrice } from './price';
import { mapMarketState } from './utils';

// Raw Myriad fields already promoted to first-class Unified columns — excluded
// from sourceMetadata so we capture only what the unified shape would drop.
const MYRIAD_PROMOTED_MARKET_KEYS = [
    'id', 'networkId', 'title', 'description', 'slug', 'imageUrl',
    'expiresAt', 'volume24h', 'volume', 'liquidity', 'eventId',
    'topics', 'outcomes', 'state',
] as const;

const MYRIAD_PROMOTED_EVENT_KEYS = [
    'id', 'title', 'markets',
] as const;

const WEI_SCALE = BigInt('1000000000000000000');
const PRECISION_SCALE = BigInt('1000000000000');

function weiStringToNumber(value: string): number {
    const scaled = (BigInt(value) * PRECISION_SCALE) / WEI_SCALE;
    return Number(scaled) / Number(PRECISION_SCALE);
}

function selectTimeframe(interval: CandleInterval): string {
    switch (interval) {
        case '1m':
        case '5m':
            return '24h';
        case '15m':
        case '1h':
            return '7d';
        case '6h':
        case '1d':
            return '30d';
        default:
            return '7d';
    }
}

export class MyriadNormalizer implements IExchangeNormalizer<MyriadRawMarket, MyriadRawQuestion> {

    normalizeMarket(raw: MyriadRawMarket): UnifiedMarket | null {
        if (!raw) return null;

        const outcomes: MarketOutcome[] = (raw.outcomes || []).map((o) => ({
            outcomeId: `${raw.networkId}:${raw.id}:${o.id}`,
            marketId: `${raw.networkId}:${raw.id}`,
            label: o.title || `Outcome ${o.id}`,
            price: Number(o.price) || 0,
            priceChange24h: o.priceChange24h != null ? Number(o.priceChange24h) : undefined,
        }));

        const status = typeof raw.state === 'string' ? mapMarketState(raw.state) : undefined;

        const um = {
            marketId: `${raw.networkId}:${raw.id}`,
            eventId: raw.eventId ? String(raw.eventId) : undefined,
            title: raw.title || '',
            description: raw.description || '',
            outcomes,
            resolutionDate: raw.expiresAt ? new Date(raw.expiresAt) : new Date(0),
            volume24h: Number(raw.volume24h || 0),
            volume: Number(raw.volume || 0),
            liquidity: Number(raw.liquidity || 0),
            url: `https://myriad.markets/markets/${raw.slug || raw.id}`,
            image: raw.imageUrl,
            tags: raw.topics || [],
            status,
            sourceMetadata: buildSourceMetadata(
                raw as unknown as Record<string, unknown>,
                MYRIAD_PROMOTED_MARKET_KEYS,
            ),
        } as UnifiedMarket;

        addBinaryOutcomes(um);
        return um;
    }

    normalizeEvent(raw: MyriadRawQuestion): UnifiedEvent | null {
        if (!raw) return null;

        const markets: UnifiedMarket[] = [];
        for (const m of raw.markets || []) {
            const rawOutcomes = m.outcomes || [];

            // Binary markets (2 outcomes): keep as-is.
            // Multi-outcome markets (>2): expand each outcome into a separate
            // binary market with a specific title (e.g. "Premier League - Arsenal")
            // so the matching engine can find cross-venue identity matches against
            // venues like Polymarket that split each outcome into its own market.
            if (rawOutcomes.length <= 2) {
                const um = this.normalizeMarket(m);
                if (um) markets.push(um);
            } else {
                const eventTitle = m.title || raw.title || '';
                for (const outcome of rawOutcomes) {
                    const outcomeTitle = outcome.title || `Outcome ${outcome.id}`;
                    const syntheticMarket: MyriadRawMarket = {
                        ...m,
                        id: m.id,
                        title: `${eventTitle} - ${outcomeTitle}`,
                        outcomes: [
                            { ...outcome, title: outcomeTitle },
                            { id: -(outcome.id || 0), title: `Not ${outcomeTitle}`, price: 1 - (Number(outcome.price) || 0) },
                        ],
                    };
                    const um = this.normalizeMarket(syntheticMarket);
                    if (um) {
                        um.marketId = `${m.networkId}:${m.id}:${outcome.id}`;
                        markets.push(um);
                    }
                }
            }
        }

        return {
            id: String(raw.id),
            title: raw.title || '',
            description: '',
            slug: String(raw.id),
            markets,
            volume24h: markets.reduce((sum, m) => sum + m.volume24h, 0),
            volume: markets.some(m => m.volume !== undefined)
                ? markets.reduce((sum, m) => sum + (m.volume ?? 0), 0)
                : undefined,
            url: `https://myriad.markets`,
            // Keeps non-promoted question fields; raw markets array is promoted.
            sourceMetadata: buildSourceMetadata(
                raw as unknown as Record<string, unknown>,
                MYRIAD_PROMOTED_EVENT_KEYS,
            ),
        };
    }

    normalizeOHLCV(raw: MyriadRawMarket, params: OHLCVParams, outcomeId?: string): PriceCandle[] {
        const outcomes = raw.outcomes || [];

        let targetOutcome = outcomes[0];
        if (outcomeId !== undefined) {
            const found = outcomes.find((o) => String(o.id) === outcomeId);
            if (found) targetOutcome = found;
        }

        if (!targetOutcome || !targetOutcome.price_charts) {
            return [];
        }

        const desiredTimeframe = selectTimeframe(params.resolution);
        const charts = targetOutcome.price_charts;

        let prices: { value: number; timestamp: number }[] | null = null;
        for (const key of Object.keys(charts)) {
            const chart = charts[key];
            if (chart && chart.timeframe === desiredTimeframe && Array.isArray(chart.prices)) {
                prices = chart.prices;
                break;
            }
        }

        if (!prices || prices.length === 0) {
            return [];
        }

        const candles: PriceCandle[] = prices.map((point) => ({
            timestamp: point.timestamp ? point.timestamp * 1000 : Date.now(),
            open: Number(point.value || 0),
            high: Number(point.value || 0),
            low: Number(point.value || 0),
            close: Number(point.value || 0),
            volume: undefined,
        }));

        if (params.limit && candles.length > params.limit) {
            return candles.slice(-params.limit);
        }

        return candles;
    }

    normalizeOrderBook(raw: MyriadRawMarket, id: string): OrderBook {
        const parts = id.split(':');
        const outcomeId = parts.length >= 3 ? parts[2] : undefined;
        const outcomes = raw.outcomes || [];

        if (!outcomes.length) {
            return { bids: [], asks: [], timestamp: Date.now() };
        }

        const numericId = Number(outcomeId);
        let price: number;

        if (!isNaN(numericId) && numericId < 0) {
            // Synthetic NO outcome (negative ID from normalizeEvent).
            // The NO price is the sum of all other outcomes in the AMM pool.
            const positiveId = -numericId;
            price = outcomes
                .filter((o) => Number(o.id) !== positiveId)
                .reduce((sum, o) => sum + (Number(o.price) || 0), 0);
        } else {
            const outcome = outcomes.find((o) => String(o.id) === outcomeId) || outcomes[0];
            if (!outcome) {
                return { bids: [], asks: [], timestamp: Date.now() };
            }
            price = Number(outcome.price) || 0;
        }

        const liquidity = Number(raw.liquidity || 0);
        const size = liquidity > 0 ? liquidity : 1;

        return {
            bids: [{ price, size }],
            asks: [{ price, size }],
            timestamp: Date.now(),
        };
    }

    normalizeClobOrderBook(raw: { bids: [string, string][]; asks: [string, string][] }): OrderBook {
        return {
            bids: raw.bids.map(([priceWei, sizeWei]) => ({
                price: weiStringToNumber(priceWei),
                size: weiStringToNumber(sizeWei),
            })),
            asks: raw.asks.map(([priceWei, sizeWei]) => ({
                price: weiStringToNumber(priceWei),
                size: weiStringToNumber(sizeWei),
            })),
            timestamp: Date.now(),
        };
    }

    normalizeTrade(raw: MyriadRawTradeEvent, index: number): Trade {
        return {
            id: raw.txId ?? `${raw.blockNumber || raw.timestamp}-${index}`,
            timestamp: (raw.timestamp || 0) * 1000,
            price: resolveMyriadPrice(raw),
            amount: Number(raw.shares || 0),
            side: raw.action === 'buy' ? 'buy' as const : 'sell' as const,
        };
    }

    normalizeUserTrade(raw: MyriadRawTradeEvent, index: number): UserTrade {
        return {
            id: raw.txId ?? `${raw.blockNumber || raw.timestamp}-${index}`,
            timestamp: (raw.timestamp || 0) * 1000,
            price: resolveMyriadPrice(raw),
            amount: Number(raw.shares || 0),
            side: raw.action === 'buy' ? 'buy' as const : 'sell' as const,
        };
    }

    normalizePosition(raw: MyriadRawPortfolioItem): Position {
        return {
            marketId: `${raw.networkId}:${raw.marketId}`,
            outcomeId: `${raw.networkId}:${raw.marketId}:${raw.outcomeId}`,
            outcomeLabel: raw.outcomeTitle || `Outcome ${raw.outcomeId}`,
            size: Number(raw.shares || 0),
            entryPrice: Number(raw.price || 0),
            currentPrice: resolveMyriadPrice(raw),
            unrealizedPnL: Number(raw.profit || 0),
        };
    }

    normalizeBalance(rawItems: MyriadRawPortfolioItem[]): Balance[] {
        let totalValue = 0;
        for (const pos of rawItems) {
            totalValue += Number(pos.value || 0);
        }

        return [{
            currency: 'USDC',
            total: totalValue,
            available: 0,
            locked: totalValue,
        }];
    }
}
