import { UnifiedMarket, UnifiedEvent, MarketOutcome } from '../../types';
import { addBinaryOutcomes } from '../../utils/market-utils';
import { buildSourceMetadata } from '../../utils/metadata';

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

export const DEFAULT_BASE_URL = 'https://api-v2.myriadprotocol.com';

// Mainnet network IDs
export const NETWORKS = {
    ABSTRACT: 2741,
    LINEA: 59144,
    BNB: 56,
} as const;

// Mainnet contract addresses
export const CONTRACTS: Record<number, { predictionMarket: string; querier: string }> = {
    [NETWORKS.ABSTRACT]: {
        predictionMarket: '0x3e0F5F8F5Fb043aBFA475C0308417Bf72c463289',
        querier: '0x1d5773Cd0dC74744C1F7a19afEeECfFE64f233Ff',
    },
    [NETWORKS.LINEA]: {
        predictionMarket: '0x39e66ee6b2ddaf4defded3038e0162180dbef340',
        querier: '0x503c9f98398dc3433ABa819BF3eC0b97e02B8D04',
    },
    [NETWORKS.BNB]: {
        predictionMarket: '0x39E66eE6b2ddaf4DEfDEd3038E0162180dbeF340',
        querier: '0xDeFb36c47754D2e37d44b8b8C647D4D643e03bAd',
    },
};

export function mapMarketState(state: string): 'active' | 'inactive' | 'closed' {
    switch (state) {
        case 'open':
            return 'active';
        case 'closed':
            return 'inactive';
        case 'resolved':
            return 'closed';
        case 'voided':
            return 'closed';
        default:
            return 'active';
    }
}

export function mapStatusToMyriad(status?: string): string | undefined {
    if (!status) return undefined;
    switch (status) {
        case 'active':
            return 'open';
        case 'inactive':
        case 'closed':
            return 'closed';
        default:
            return undefined;
    }
}

export function mapMarketToUnified(market: any): UnifiedMarket | null {
    if (!market) return null;

    const outcomes: MarketOutcome[] = (market.outcomes || []).map((o: any) => ({
        outcomeId: `${market.networkId}:${market.id}:${o.id}`,
        marketId: `${market.networkId}:${market.id}`,
        label: o.title || `Outcome ${o.id}`,
        price: Number(o.price) || 0,
        priceChange24h: o.priceChange24h != null ? Number(o.priceChange24h) : undefined,
    }));

    const um = {
        marketId: `${market.networkId}:${market.id}`,
        eventId: market.eventId ? String(market.eventId) : undefined,
        title: market.title || '',
        description: market.description || '',
        outcomes,
        resolutionDate: market.expiresAt ? new Date(market.expiresAt) : new Date(0),
        volume24h: Number(market.volume24h || 0),
        volume: Number(market.volume || 0),
        liquidity: Number(market.liquidity || 0),
        url: `https://myriad.markets/markets/${market.slug || market.id}`,
        image: market.imageUrl,
        tags: market.topics || [],
        sourceMetadata: buildSourceMetadata(
            market as unknown as Record<string, unknown>,
            MYRIAD_PROMOTED_MARKET_KEYS,
        ),
    } as UnifiedMarket;

    addBinaryOutcomes(um);
    return um;
}

export function mapQuestionToEvent(question: any): UnifiedEvent | null {
    if (!question) return null;

    const markets: UnifiedMarket[] = [];
    for (const m of question.markets || []) {
        const um = mapMarketToUnified(m);
        if (um) markets.push(um);
    }

    const unifiedEvent = {
        id: String(question.id),
        title: question.title || '',
        description: '',
        slug: String(question.id),
        markets,
        volume24h: markets.reduce((sum, m) => sum + m.volume24h, 0),
        volume: markets.some(m => m.volume !== undefined) ? markets.reduce((sum, m) => sum + (m.volume ?? 0), 0) : undefined,
        url: `https://myriad.markets`,
        // Keeps non-promoted question fields; raw markets array is promoted.
        sourceMetadata: buildSourceMetadata(
            question as unknown as Record<string, unknown>,
            MYRIAD_PROMOTED_EVENT_KEYS,
        ),
    };

    return unifiedEvent;
}
