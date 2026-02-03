import axios from 'axios';
import { OrderBook } from '../../types';
import { validateIdFormat } from '../../utils/validation';
import { kalshiErrorMapper } from './errors';

export async function fetchOrderBook(id: string): Promise<OrderBook> {
    validateIdFormat(id, 'OrderBook');

    try {
        // Check if this is a NO outcome request
        const isNoOutcome = id.endsWith('-NO');
        const ticker = id.replace(/-NO$/, '');
        const url = `https://api.elections.kalshi.com/trade-api/v2/markets/${ticker}/orderbook`;
        const response = await axios.get(url);
        const data = response.data.orderbook;

        // Structure: { yes: [[price, qty], ...], no: [[price, qty], ...] }
        // Kalshi returns bids at their actual prices (not inverted)
        // - yes: bids for buying YES at price X
        // - no: bids for buying NO at price X

        let bids: any[];
        let asks: any[];

        if (isNoOutcome) {
            // NO outcome order book:
            // - Bids: people buying NO (use data.no directly)
            // - Asks: people selling NO = people buying YES (invert data.yes)
            bids = (data.no || []).map((level: number[]) => ({
                price: level[0] / 100,
                size: level[1]
            }));

            asks = (data.yes || []).map((level: number[]) => ({
                price: 1 - (level[0] / 100),  // Invert YES price to get NO ask price
                size: level[1]
            }));
        } else {
            // YES outcome order book:
            // - Bids: people buying YES (use data.yes directly)
            // - Asks: people selling YES = people buying NO (invert data.no)
            bids = (data.yes || []).map((level: number[]) => ({
                price: level[0] / 100,
                size: level[1]
            }));

            asks = (data.no || []).map((level: number[]) => ({
                price: 1 - (level[0] / 100),  // Invert NO price to get YES ask price
                size: level[1]
            }));
        }

        // Sort bids desc, asks asc
        bids.sort((a: any, b: any) => b.price - a.price);
        asks.sort((a: any, b: any) => a.price - b.price);

        return { bids, asks, timestamp: Date.now() };
    } catch (error: any) {
        throw kalshiErrorMapper.mapError(error);
    }
}
