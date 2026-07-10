import { UnifiedMarket, UnifiedEvent, OrderBook, Trade, UserTrade, Position, Balance, MarketOutcome, Order } from '../../types';
import { IExchangeNormalizer } from '../interfaces';
import { addBinaryOutcomes } from '../../utils/market-utils';
import { buildSourceMetadata } from '../../utils/metadata';
import { fromBasisPoints, fromQuantityUnits } from './price';
import {
    SmarketsRawEventWithMarkets,
    SmarketsRawEvent,
    SmarketsRawMarket,
    SmarketsRawContract,
    SmarketsRawQuote,
    SmarketsRawActivityRow,
    SmarketsRawOrder,
    SmarketsRawVolume,
    SmarketsRawBalance,
} from './fetcher';

// Raw Smarkets event fields already promoted to first-class Unified columns —
// excluded from sourceMetadata so we capture only vendor data not in the
// unified shape.
const SMARKETS_PROMOTED_EVENT_KEYS = [
    'id', 'name', 'description', 'slug', 'full_slug',
    'start_datetime', 'end_date',
] as const;

// Raw Smarkets market fields already promoted to first-class Unified columns.
const SMARKETS_PROMOTED_MARKET_KEYS = [
    'id', 'event_id', 'name', 'slug', 'description',
    'category', 'categories',
] as const;

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function extractEventCategory(event: SmarketsRawEvent): string | undefined {
    const eventType = event.type;
    if (typeof eventType === 'object' && eventType !== null) {
        return eventType.domain;
    }
    if (typeof eventType === 'string') {
        // e.g. "football_match" -> "football"
        const parts = eventType.split('_');
        if (parts.length >= 2) {
            return parts.slice(0, -1).join('_');
        }
        return eventType;
    }
    return undefined;
}

function buildEventUrl(event: SmarketsRawEvent): string {
    if (event.full_slug) {
        return `https://smarkets.com${event.full_slug}`;
    }
    return `https://smarkets.com/event/${event.id}/${event.slug}`;
}

function buildContractOutcome(
    contract: SmarketsRawContract,
    marketId: string,
): MarketOutcome {
    return {
        outcomeId: contract.id,
        marketId,
        label: contract.name,
        price: 0,
    };
}

function parseSmarketsResolutionDate(event: SmarketsRawEvent): Date | undefined {
    // Smarkets list and detail endpoints currently return end_date as null for
    // many events. start_datetime is an event start, not a market resolution,
    // so leave the unified resolution date unset instead of using a misleading
    // fallback that can corrupt cross-venue ordering.
    return event.end_date ? new Date(event.end_date) : undefined;
}

// ----------------------------------------------------------------------------
// Normalizer
// ----------------------------------------------------------------------------

export class SmarketsNormalizer implements IExchangeNormalizer<SmarketsRawEventWithMarkets, SmarketsRawEventWithMarkets> {

    normalizeMarket(raw: SmarketsRawEventWithMarkets): UnifiedMarket | null {
        if (!raw || !raw.markets || raw.markets.length === 0) return null;
        return this.normalizeRawMarket(raw.event, raw.markets[0], raw.contracts, raw.volumes);
    }

    normalizeMarketsFromEvent(raw: SmarketsRawEventWithMarkets): UnifiedMarket[] {
        const results: UnifiedMarket[] = [];
        for (const market of raw.markets) {
            const marketContracts = raw.contracts.filter(c => c.market_id === market.id);
            const marketVolumes = raw.volumes.filter(v => v.market_id === market.id);
            const um = this.normalizeRawMarket(raw.event, market, marketContracts, marketVolumes);
            if (um) results.push(um);
        }
        return results;
    }

    normalizeRawMarket(
        event: SmarketsRawEvent,
        market: SmarketsRawMarket,
        contracts: SmarketsRawContract[],
        volumes: SmarketsRawVolume[]
    ): UnifiedMarket | null {
        if (!market) return null;

        const marketContracts = contracts.filter(c => c.market_id === market.id);
        const volume = volumes.find(v => v.market_id === market.id);

        const outcomes: MarketOutcome[] = marketContracts.map(contract =>
            buildContractOutcome(contract, market.id)
        );

        const category = extractEventCategory(event);
        const tags: string[] = [];
        if (category) tags.push(category);
        if (market.category && !tags.includes(market.category)) {
            tags.push(market.category);
        }
        if (market.categories) {
            for (const cat of market.categories) {
                if (!tags.includes(cat)) tags.push(cat);
            }
        }

        const resolutionDate = parseSmarketsResolutionDate(event);

        const um = {
            marketId: market.id,
            eventId: event.id,
            title: event.name,
            description: market.description || market.name || '',
            slug: market.slug,
            outcomes,
            resolutionDate,
            volume24h: 0, // Smarkets does not provide 24h volume separately
            volume: volume ? fromQuantityUnits(volume.volume) : undefined,
            liquidity: 0,
            url: buildEventUrl(event),
            category,
            tags,
            // event_id is promoted to eventId; parent_id lives on the raw event
            // (not a recurring/series market field), so no extra is needed.
            sourceMetadata: buildSourceMetadata(
                market as unknown as Record<string, unknown>,
                SMARKETS_PROMOTED_MARKET_KEYS,
            ),
        } as UnifiedMarket;

        addBinaryOutcomes(um);
        return um;
    }

    normalizeEvent(raw: SmarketsRawEventWithMarkets): UnifiedEvent | null {
        if (!raw || !raw.event) return null;

        const markets = this.normalizeMarketsFromEvent(raw);
        const category = extractEventCategory(raw.event);

        return {
            id: raw.event.id,
            title: raw.event.name,
            description: raw.event.description || '',
            slug: raw.event.slug,
            markets,
            volume24h: markets.reduce((sum, m) => sum + m.volume24h, 0),
            volume: markets.some(m => m.volume !== undefined)
                ? markets.reduce((sum, m) => sum + (m.volume ?? 0), 0)
                : undefined,
            url: buildEventUrl(raw.event),
            category,
            tags: category ? [category] : [],
            // Captures non-promoted event fields: state, type, parent_id,
            // start_date, created, modified, bettable, hidden, inplay_enabled,
            // short_name, seo_description, special_rules, chart_time_period, etc.
            sourceMetadata: buildSourceMetadata(
                raw.event as unknown as Record<string, unknown>,
                SMARKETS_PROMOTED_EVENT_KEYS,
            ),
        };
    }

    normalizeOrderBook(raw: Record<string, SmarketsRawQuote>, _id: string): OrderBook {
        const allBids: Array<{ price: number; size: number }> = [];
        const allAsks: Array<{ price: number; size: number }> = [];

        for (const contractId of Object.keys(raw)) {
            const quote = raw[contractId];
            if (!quote) continue;

            for (const bid of (quote.bids || [])) {
                allBids.push({
                    price: fromBasisPoints(bid.price),
                    size: fromQuantityUnits(bid.quantity),
                });
            }

            for (const offer of (quote.offers || [])) {
                allAsks.push({
                    price: fromBasisPoints(offer.price),
                    size: fromQuantityUnits(offer.quantity),
                });
            }
        }

        const sortedBids = [...allBids].sort((a, b) => b.price - a.price);
        const sortedAsks = [...allAsks].sort((a, b) => a.price - b.price);

        return {
            bids: sortedBids,
            asks: sortedAsks,
            timestamp: Date.now(),
        };
    }

    normalizeActivityTrade(raw: SmarketsRawActivityRow, index: number): Trade {
        const price = raw.price !== null ? fromBasisPoints(raw.price) : 0;
        const amount = raw.quantity !== null ? fromQuantityUnits(raw.quantity) : 0;

        let side: 'buy' | 'sell' | 'unknown' = 'unknown';
        if (raw.side === 'buy') side = 'buy';
        else if (raw.side === 'sell') side = 'sell';

        return {
            id: `${raw.seq}-${raw.subseq}`,
            timestamp: new Date(raw.timestamp).getTime(),
            price,
            amount,
            side,
            outcomeId: raw.contract_id || undefined,
        };
    }

    normalizeActivityUserTrade(raw: SmarketsRawActivityRow, index: number): UserTrade {
        const trade = this.normalizeActivityTrade(raw, index);

        return {
            ...trade,
            orderId: raw.order_id || undefined,
        };
    }

    normalizeOrder(raw: SmarketsRawOrder): Order {
        return {
            id: raw.id,
            marketId: raw.market_id,
            outcomeId: raw.contract_id,
            side: raw.side === 'buy' ? 'buy' : 'sell',
            type: this.mapOrderType(raw.type),
            price: fromBasisPoints(raw.price),
            amount: fromQuantityUnits(raw.quantity),
            status: this.mapOrderStatus(raw.state),
            filled: fromQuantityUnits(raw.quantity_filled),
            remaining: fromQuantityUnits(raw.quantity_unfilled),
            timestamp: new Date(raw.created_datetime).getTime(),
        };
    }

    normalizeCreateOrderResponse(raw: Record<string, any>): Order {
        const totalExecuted = raw.total_executed_quantity || 0;
        const availableQty = raw.available_quantity || 0;
        const quantity = raw.quantity || (totalExecuted + availableQty);

        let status: 'pending' | 'open' | 'filled' | 'canceled' | 'rejected' = 'open';
        if (totalExecuted > 0 && availableQty === 0) {
            status = 'filled';
        } else if (totalExecuted > 0) {
            status = 'open';
        } else {
            status = 'pending';
        }

        return {
            id: raw.order_id,
            marketId: raw.market_id,
            outcomeId: raw.contract_id,
            side: raw.side === 'buy' ? 'buy' : 'sell',
            type: 'limit',
            price: fromBasisPoints(raw.price),
            amount: fromQuantityUnits(quantity),
            status,
            filled: fromQuantityUnits(totalExecuted),
            remaining: fromQuantityUnits(availableQty),
            timestamp: Date.now(),
        };
    }

    normalizePosition(raw: SmarketsRawOrder): Position {
        const size = fromQuantityUnits(raw.quantity_filled);
        const entryPrice = raw.average_price_matched
            ? fromBasisPoints(raw.average_price_matched)
            : fromBasisPoints(raw.price);

        return {
            marketId: raw.market_id,
            outcomeId: raw.contract_id,
            outcomeLabel: raw.contract_id,
            size: raw.side === 'buy' ? size : -size,
            entryPrice,
            currentPrice: entryPrice,
            unrealizedPnL: 0,
        };
    }

    normalizeBalance(raw: SmarketsRawBalance): Balance[] {
        const balance = parseFloat(raw.balance || '0');
        const available = parseFloat(raw.available_balance || '0');

        return [{
            currency: raw.currency || 'GBP',
            total: balance,
            available,
            locked: balance - available,
        }];
    }

    // -- Private helpers ------------------------------------------------------

    private mapOrderStatus(state: string): 'pending' | 'open' | 'filled' | 'canceled' | 'rejected' {
        switch (state) {
            case 'created':
                return 'pending';
            case 'partial':
                return 'open';
            case 'filled':
            case 'settled':
                return 'filled';
            default:
                return 'open';
        }
    }

    private mapOrderType(type: string): 'market' | 'limit' {
        switch (type) {
            case 'immediate_or_cancel':
                return 'market';
            case 'good_til_cancelled':
            case 'good_til_halted':
            case 'keep_in_play':
            default:
                return 'limit';
        }
    }
}
