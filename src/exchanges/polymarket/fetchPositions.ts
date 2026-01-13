import axios from 'axios';
import { Position } from '../../types';

const DATA_API_URL = 'https://data-api.polymarket.com';

interface PolymarketPosition {
    asset: string;
    conditionId: string;
    size: string;
    avgPrice: string;
    currentValue: string;
    cashPnl: string;
    percentPnl: string;
    title: string;
    outcomeIndex: string;
    outcome: string;
    eventSlug: string;
    curPrice?: string;
    realizedPnl?: string;
}

export async function fetchPositions(userAddress: string): Promise<Position[]> {
    const response = await axios.get(`${DATA_API_URL}/positions`, {
        params: {
            user: userAddress,
            limit: 100
        }
    });

    const data = Array.isArray(response.data) ? response.data : [];

    return data.map((p: PolymarketPosition) => ({
        marketId: p.conditionId,
        outcomeId: p.asset,
        outcomeLabel: p.outcome || 'Unknown',
        size: parseFloat(p.size),
        entryPrice: parseFloat(p.avgPrice),
        currentPrice: parseFloat(p.curPrice || '0'),
        unrealizedPnL: parseFloat(p.cashPnl || '0'),
        realizedPnL: parseFloat(p.realizedPnl || '0')
    }));
}
