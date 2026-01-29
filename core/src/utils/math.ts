import { OrderBook, OrderLevel } from '../types';

export function getExecutionPrice(
    orderBook: OrderBook,
    side: 'buy' | 'sell',
    amount: number
): number {
    const result = getExecutionPriceDetailed(orderBook, side, amount);
    return result.fullyFilled ? result.price : 0;
}

export interface ExecutionPriceResult {
    price: number;
    filledAmount: number;
    fullyFilled: boolean;
}

export function getExecutionPriceDetailed(
    orderBook: OrderBook,
    side: 'buy' | 'sell',
    amount: number
): ExecutionPriceResult {
    if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
    }

    // Defensive copy to avoid mutating the original object if we were to sort in place (though toSorted/spread is safer)
    // We filter out any zero-size levels just in case
    let levels = (side === 'buy' ? orderBook.asks : orderBook.bids).filter(l => l.size > 0);

    // Sort levels to ensure we get the best price
    // Asks: Lowest Price First (Ascending)
    // Bids: Highest Price First (Descending)
    levels.sort((a, b) => side === 'buy' ? a.price - b.price : b.price - a.price);

    if (levels.length === 0) {
        return {
            price: 0,
            filledAmount: 0,
            fullyFilled: false,
        };
    }

    let remainingAmount = amount;
    let totalCost = 0;
    let filledAmount = 0;

    // Use a small epsilon to handle floating point arithmetic errors
    const EPSILON = 0.00000001;

    for (const level of levels) {
        if (remainingAmount <= EPSILON) {
            break;
        }

        const fillSize = Math.min(remainingAmount, level.size);

        totalCost += fillSize * level.price;
        filledAmount += fillSize;

        remainingAmount -= fillSize;
    }

    const fullyFilled = remainingAmount <= EPSILON;
    const executionPrice = filledAmount > EPSILON ? totalCost / filledAmount : 0;

    return {
        price: executionPrice,
        filledAmount,
        fullyFilled,
    };
}
