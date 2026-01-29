import { UnifiedMarket, MarketOutcome, CandleInterval } from '../../types';
import { addBinaryOutcomes } from '../../utils/market-utils';

export const KALSHI_API_URL = "https://api.elections.kalshi.com/trade-api/v2/events";
export const KALSHI_SERIES_URL = "https://api.elections.kalshi.com/trade-api/v2/series";

export function mapMarketToUnified(event: any, market: any): UnifiedMarket | null {
    if (!market) return null;

    // Calculate price
    let price = 0.5;
    if (market.last_price) {
        price = market.last_price / 100;
    } else if (market.yes_ask && market.yes_bid) {
        price = (market.yes_ask + market.yes_bid) / 200;
    } else if (market.yes_ask) {
        price = market.yes_ask / 100;
    }

    // Extract candidate name
    let candidateName: string | null = null;
    if (market.subtitle || market.yes_sub_title) {
        candidateName = market.subtitle || market.yes_sub_title;
    }

    // Calculate 24h change
    let priceChange = 0;
    if (market.previous_price_dollars !== undefined && market.last_price_dollars !== undefined) {
        priceChange = market.last_price_dollars - market.previous_price_dollars;
    }

    const outcomes: MarketOutcome[] = [
        {
            id: market.ticker, // The actual market ticker (primary tradeable)
            label: candidateName || 'Yes',
            price: price,
            priceChange24h: priceChange
        },
        {
            id: `${market.ticker}-NO`, // Virtual ID for the No outcome
            label: candidateName ? `Not ${candidateName}` : 'No',
            price: 1 - price,
            priceChange24h: -priceChange // Inverse change for No? simplified assumption
        }
    ];

    // Combine category and tags into a unified tags array
    const unifiedTags: string[] = [];

    // Add category first (if it exists)
    if (event.category) {
        unifiedTags.push(event.category);
    }

    // Add tags (if they exist and avoid duplicates)
    if (event.tags && Array.isArray(event.tags)) {
        for (const tag of event.tags) {
            if (!unifiedTags.includes(tag)) {
                unifiedTags.push(tag);
            }
        }
    }

    const um = {
        id: market.ticker,
        title: event.title,
        description: market.rules_primary || market.rules_secondary || "",
        outcomes: outcomes,
        resolutionDate: new Date(market.expiration_time),
        volume24h: Number(market.volume_24h || market.volume || 0),
        volume: Number(market.volume || 0),
        liquidity: Number(market.liquidity || 0), // Kalshi 'liquidity' might need specific mapping if available, otherwise 0 to avoid conflation
        openInterest: Number(market.open_interest || 0),
        url: `https://kalshi.com/events/${event.event_ticker}`,
        category: event.category,
        tags: unifiedTags
    } as UnifiedMarket;

    addBinaryOutcomes(um);
    return um;
}

export function mapIntervalToKalshi(interval: CandleInterval): number {
    const mapping: Record<CandleInterval, number> = {
        '1m': 1,
        '5m': 1,
        '15m': 1,
        '1h': 60,
        '6h': 60,
        '1d': 1440
    };
    return mapping[interval];
}
