import { UnifiedMarket } from '../../types';
import { ValidationError } from '../../errors';

export const BASE_URL = 'https://gaduin.com/api/v1';
const SITE_URL = 'https://gaduin.com';

/** Market shape from GET /markets and GET /markets/{id} (see core/specs/gaduin/gaduin.yaml). */
export interface GaduinMarket {
    id: string;
    slug: string;
    kind: string;
    category: string;
    question: string;
    rules?: string;
    status: string;
    close_at: string;
    trading_closes_at: string;
    tradable?: boolean;
    prices: number[] | null;
    volume: string;
    outcomes: { idx: number; label: string }[];
    settled_outcome_idx?: number;
}

/** Outcome ids are `<market uuid>:<outcome idx>`. */
export function parseOutcomeId(outcomeId: string): { marketId: string; idx: number } {
    const match = /^(.+):(\d+)$/.exec(outcomeId);
    if (!match) {
        throw new ValidationError(
            `Invalid Gaduin outcomeId "${outcomeId}". Expected "<marketId>:<outcome index>".`,
            'outcomeId',
            'Gaduin',
        );
    }
    return { marketId: match[1], idx: Number(match[2]) };
}

export function mapMarketToUnified(raw: GaduinMarket): UnifiedMarket {
    const market: UnifiedMarket = {
        marketId: raw.id,
        title: raw.question,
        description: raw.rules ?? '',
        slug: raw.slug,
        outcomes: raw.outcomes.map((o) => ({
            outcomeId: `${raw.id}:${o.idx}`,
            marketId: raw.id,
            label: o.label,
            // prices is null on CANCELLED and DISPUTED markets.
            price: raw.prices?.[o.idx] ?? 0,
        })),
        resolutionDate: new Date(raw.close_at),
        // The API publishes lifetime volume only, and no liquidity figure.
        volume24h: 0,
        volume: Number(raw.volume),
        liquidity: 0,
        url: `${SITE_URL}/markets/${encodeURIComponent(raw.slug)}`,
        category: raw.category,
        status: raw.status === 'OPEN' ? 'active' : raw.status.toLowerCase(),
        sourceMetadata: {
            kind: raw.kind,
            tradable: raw.tradable,
            tradingClosesAt: raw.trading_closes_at,
            settledOutcomeIdx: raw.settled_outcome_idx,
        },
    };
    // Only literal yes/no markets get yes/no accessors, labels kept as published; other outcome sets (e.g. on_time/delayed) get none.
    const yes = market.outcomes.find((o) => o.label.toLowerCase() === 'yes');
    const no = market.outcomes.find((o) => o.label.toLowerCase() === 'no');
    if (market.outcomes.length === 2 && yes && no) {
        market.yes = yes;
        market.no = no;
    }
    return market;
}
