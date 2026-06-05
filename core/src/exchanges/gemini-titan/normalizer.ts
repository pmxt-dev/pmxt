import {
    UnifiedMarket,
    UnifiedEvent,
    UnifiedSeries,
    OrderBook,
    Order,
    Position,
    MarketOutcome,
} from '../../types';
import { IExchangeNormalizer } from '../interfaces';
import { addBinaryOutcomes } from '../../utils/market-utils';
import { buildSourceMetadata } from '../../utils/metadata';
import { toMarketId, toOutcomeId } from './utils';
import { TICK_SIZE } from './config';
import {
    GeminiRawEvent,
    GeminiRawContract,
    GeminiRawOrder,
    GeminiRawPosition,
    GeminiRawOrderBook,
} from './types';

// Raw GeminiRawEvent fields already promoted to first-class unified columns.
// Omitted from sourceMetadata so we capture only vendor data the unified shape
// would otherwise drop.
const GEMINI_PROMOTED_EVENT_KEYS = [
    'ticker',       // -> id
    'title',
    'description',
    'slug',
    'contracts',    // -> markets (nested child array, always omitted)
    'volume24h',
    'imageUrl',     // -> image
    'category',
    'tags',
] as const;

// Raw GeminiRawContract fields already promoted to first-class unified columns.
const GEMINI_PROMOTED_CONTRACT_KEYS = [
    'instrumentSymbol', // -> marketId, slug
    'label',            // -> title
    'description',
    'ticker',           // parent event ticker feeds eventId
    'status',           // -> status
    'prices',           // -> outcomes prices
    'expiryDate',       // -> resolutionDate
] as const;

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function mapEventStatus(geminiStatus: string): string {
    switch (geminiStatus) {
        case 'active': return 'active';
        case 'approved': return 'active';
        case 'closed': return 'closed';
        case 'settled': return 'closed';
        case 'under_review': return 'closed';
        case 'invalid': return 'closed';
        default: return 'active';
    }
}

function mapOrderStatus(geminiStatus: string): Order['status'] {
    switch (geminiStatus.toLowerCase()) {
        case 'open': return 'open';
        case 'accepted': return 'open';
        case 'filled': return 'filled';
        case 'cancelled': return 'canceled';
        case 'canceled': return 'canceled';
        case 'rejected': return 'rejected';
        default: return 'open';
    }
}

function buildExchangeUrl(eventTicker: string): string {
    return `https://exchange.gemini.com/prediction-markets/events/${encodeURIComponent(eventTicker)}`;
}

/**
 * Extract plain text from a Gemini rich text description.
 * Contract descriptions come as Contentful-style rich text objects,
 * while event descriptions are plain strings.
 */
function extractDescription(desc: unknown): string {
    if (typeof desc === 'string') return desc;
    if (!desc || typeof desc !== 'object') return '';
    const obj = desc as Record<string, unknown>;
    // Contentful rich text: { nodeType: "document", content: [{ value: "...", nodeType: "text" }] }
    if (Array.isArray(obj.content)) {
        return obj.content
            .map((node: any) => {
                if (typeof node.value === 'string') return node.value;
                if (Array.isArray(node.content)) {
                    return node.content
                        .filter((n: any) => typeof n.value === 'string')
                        .map((n: any) => n.value)
                        .join('');
                }
                return '';
            })
            .join(' ')
            .trim();
    }
    return '';
}

/**
 * Round to 2 decimal places to avoid floating point noise.
 */
function roundPrice(n: number): number {
    return Math.round(n * 100) / 100;
}

// ----------------------------------------------------------------------------
// Normalizer
// ----------------------------------------------------------------------------

export class GeminiNormalizer implements IExchangeNormalizer<GeminiRawEvent, GeminiRawEvent> {

    normalizeMarket(raw: GeminiRawEvent): UnifiedMarket | null {
        // Gemini events contain multiple contracts -- each event becomes
        // multiple markets. This method is called per-event, so we return
        // the first contract as a market. Use normalizeMarketsFromEvent
        // for the full list.
        if (!raw || !raw.contracts || raw.contracts.length === 0) return null;
        return this.normalizeContract(raw.contracts[0], raw);
    }

    normalizeEvent(raw: GeminiRawEvent): UnifiedEvent | null {
        if (!raw) return null;

        return {
            id: raw.ticker,
            title: raw.title,
            description: raw.description ?? '',
            slug: raw.slug ?? raw.ticker.toLowerCase(),
            markets: [],
            volume24h: raw.volume24h ? parseFloat(raw.volume24h) : 0,
            url: buildExchangeUrl(raw.ticker),
            category: raw.category,
            tags: raw.tags ?? [],
            image: raw.imageUrl,
            sourceMetadata: buildSourceMetadata(
                raw as unknown as Record<string, unknown>,
                GEMINI_PROMOTED_EVENT_KEYS,
            ),
        };
    }

    normalizeEventWithMarkets(raw: GeminiRawEvent): UnifiedEvent | null {
        const event = this.normalizeEvent(raw);
        if (!event) return null;

        const markets: UnifiedMarket[] = [];
        for (const contract of raw.contracts) {
            if (contract.status === 'settled' || contract.marketState === 'closed') continue;
            const market = this.normalizeContract(contract, raw);
            if (market) markets.push(market);
        }

        return {
            ...event,
            markets,
            volume24h: markets.reduce((sum, m) => sum + m.volume24h, 0),
        };
    }

    /**
     * Produce a UnifiedSeries from a Gemini `series` object (raw Record).
     * The series id is taken from the first non-null of: id, ticker, symbol.
     * `events` is optionally injected by the caller when doing a single-id lookup.
     */
    normalizeSeries(raw: Record<string, unknown>, events?: UnifiedEvent[]): UnifiedSeries {
        const id = String(raw['id'] ?? raw['ticker'] ?? raw['symbol'] ?? '');
        const ticker = raw['ticker'] != null ? String(raw['ticker']) : undefined;
        const title = String(raw['title'] ?? raw['name'] ?? id);
        const recurrence = raw['frequency'] != null
            ? String(raw['frequency'])
            : raw['recurrence'] != null
                ? String(raw['recurrence'])
                : null;

        return {
            id,
            ticker,
            title,
            recurrence,
            events,
            sourceMetadata: buildSourceMetadata(
                raw,
                ['id', 'ticker', 'title', 'name', 'frequency', 'recurrence'],
            ),
        };
    }

    normalizeMarketsFromEvent(raw: GeminiRawEvent): UnifiedMarket[] {
        const markets: UnifiedMarket[] = [];
        for (const contract of raw.contracts) {
            const market = this.normalizeContract(contract, raw);
            if (market) markets.push(market);
        }
        return markets;
    }

    normalizeContract(contract: GeminiRawContract, event: GeminiRawEvent): UnifiedMarket | null {
        if (!contract || !contract.instrumentSymbol) return null;

        const instrumentSymbol = contract.instrumentSymbol;
        const marketId = toMarketId(instrumentSymbol);

        // Extract prices
        const bestBid = contract.prices?.bestBid ? parseFloat(contract.prices.bestBid) : 0.5;
        const bestAsk = contract.prices?.bestAsk ? parseFloat(contract.prices.bestAsk) : 0.5;
        const buyYes = contract.prices?.buy?.yes ? parseFloat(contract.prices.buy.yes) : undefined;
        const sellYes = contract.prices?.sell?.yes ? parseFloat(contract.prices.sell.yes) : undefined;
        const buyNo = contract.prices?.buy?.no ? parseFloat(contract.prices.buy.no) : undefined;
        const sellNo = contract.prices?.sell?.no ? parseFloat(contract.prices.sell.no) : undefined;
        const lastPrice = contract.prices?.lastTradePrice
            ? parseFloat(contract.prices.lastTradePrice)
            : (bestBid + bestAsk) / 2;

        const yesPriceSource = buyYes ?? sellYes ?? lastPrice;
        const noPriceSource = buyNo ?? sellNo ?? (1 - yesPriceSource);

        const yesPrice = roundPrice(Math.max(0, Math.min(1, yesPriceSource)));
        const noPrice = roundPrice(Math.max(0, Math.min(1, noPriceSource)));

        const outcomes: MarketOutcome[] = [
            {
                outcomeId: toOutcomeId(instrumentSymbol, 'yes'),
                marketId,
                label: contract.label || 'Yes',
                price: yesPrice,
            },
            {
                outcomeId: toOutcomeId(instrumentSymbol, 'no'),
                marketId,
                label: `${contract.label || 'Yes'} (No)`,
                price: noPrice,
            },
        ];

        // Resolution date
        const expiryStr = contract.expiryDate ?? event.expiryDate;
        const resolutionDate = expiryStr ? new Date(expiryStr) : new Date(0);

        const tags: string[] = [...(event.tags ?? [])];
        if (event.category && !tags.includes(event.category)) {
            tags.push(event.category);
        }

        const seriesExtra: Record<string, unknown> = {};
        if (event.series != null) {
            seriesExtra['series'] = event.series;
        }

        const um: UnifiedMarket = {
            marketId,
            eventId: event.ticker,
            title: contract.label || event.title,
            description: extractDescription(contract.description) || extractDescription(event.description),
            slug: instrumentSymbol.toLowerCase(),
            outcomes,
            resolutionDate,
            volume24h: 0,
            liquidity: event.liquidity ? parseFloat(event.liquidity) : (event.volume24h ? parseFloat(event.volume24h) : (event.volume ? parseFloat(event.volume) : 0)),
            url: buildExchangeUrl(event.ticker),
            category: event.category,
            tags,
            tickSize: TICK_SIZE,
            status: mapEventStatus(contract.status),
            sourceMetadata: buildSourceMetadata(
                contract as unknown as Record<string, unknown>,
                GEMINI_PROMOTED_CONTRACT_KEYS,
                Object.keys(seriesExtra).length > 0 ? seriesExtra : undefined,
            ),
        };

        addBinaryOutcomes(um);
        return um;
    }

    normalizeOrderBook(raw: GeminiRawOrderBook, _outcomeId: string): OrderBook {
        const bids = (raw.bids ?? []).map(level => ({
            price: parseFloat(level.price),
            size: parseFloat(level.size),
        }));

        const asks = (raw.asks ?? []).map(level => ({
            price: parseFloat(level.price),
            size: parseFloat(level.size),
        }));

        return {
            bids: [...bids].sort((a, b) => b.price - a.price),
            asks: [...asks].sort((a, b) => a.price - b.price),
            timestamp: raw.timestamp ?? Date.now(),
        };
    }

    normalizeOrder(raw: GeminiRawOrder): Order {
        const quantity = parseFloat(raw.quantity);
        const filled = parseFloat(raw.filledQuantity);

        return {
            id: String(raw.orderId),
            marketId: toMarketId(raw.symbol),
            outcomeId: toOutcomeId(raw.symbol, raw.outcome as 'yes' | 'no'),
            side: raw.side as 'buy' | 'sell',
            type: 'limit',
            price: parseFloat(raw.price),
            amount: quantity,
            status: mapOrderStatus(raw.status),
            filled,
            remaining: quantity - filled,
            timestamp: new Date(raw.createdAt).getTime(),
        };
    }

    normalizePosition(raw: GeminiRawPosition): Position {
        const currentPrice = raw.prices?.bestBid
            ? parseFloat(raw.prices.bestBid)
            : 0;
        const entryPrice = parseFloat(raw.avgPrice);
        const size = parseFloat(raw.totalQuantity);

        return {
            marketId: toMarketId(raw.symbol),
            outcomeId: toOutcomeId(raw.symbol, raw.outcome as 'yes' | 'no'),
            outcomeLabel: raw.outcome === 'yes' ? 'Yes' : 'No',
            size,
            entryPrice,
            currentPrice,
            unrealizedPnL: (currentPrice - entryPrice) * size,
        };
    }
}
