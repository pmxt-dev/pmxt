import axios from 'axios';
import { HistoryFilterParams } from '../../BaseExchange';
import { Trade } from '../../types';
import { LIMITLESS_API_URL } from './utils';
import { limitlessErrorMapper } from './errors';

/**
 * Fetch trade history for a specific market or user.
 * @param id - The market slug or wallet address
 */
export async function fetchTrades(id: string, params: HistoryFilterParams): Promise<Trade[]> {
    try {
        // Limitless API v1 does not provide a public endpoint to fetch trades for a specific market/outcome.
        // The previous implementation used /portfolio/trades which returns the *authenticated user's* trades,
        // not the market's trades. This caused compliance tests to fail because they expect public data
        // (and a fresh test account has 0 trades).
        //
        // Until a public /markets/{slug}/trades endpoint exists, we mark this as not implemented
        // so compliance tests can correctly skip it.
        throw new Error('Limitless fetchTrades not implemented: No public market trades API available.');
    } catch (error: any) {
        throw limitlessErrorMapper.mapError(error);
    }
}
