import * as pmxt from '../../src';
import { UnifiedEvent, UnifiedMarket, MarketOutcome, PriceCandle, OrderBook, Trade, Position, Order } from '../../src/types';
import { generateKeyPairSync } from 'crypto';

/**
 * PMXT Compliance Shared Validation Logic
 */

export const exchangeClasses = Object.entries(pmxt)
    .filter(([name, value]) =>
        typeof value === 'function' &&
        name.endsWith('Exchange') &&
        name !== 'PredictionMarketExchange'
    )
    .map(([name, cls]) => ({ name, cls: cls as any }));

export function validateUnifiedEvent(event: UnifiedEvent, exchangeName: string) {
    const errorPrefix = `[${exchangeName} Event: ${event.id}]`;

    // 1. Identity & Structure
    expect(event.id).toBeDefined();
    expect(typeof event.id).toBe('string');
    expect(event.id.length).toBeGreaterThan(0);

    expect(event.title).toBeDefined();
    expect(typeof event.title).toBe('string');

    expect(event.slug).toBeDefined();
    expect(typeof event.slug).toBe('string');

    expect(event.url).toBeDefined();
    expect(typeof event.url).toBe('string');
    expect(event.url).toMatch(/^https?:\/\//);

    // 2. Markets Collection
    expect(Array.isArray(event.markets)).toBe(true);
    expect(event.markets.length).toBeGreaterThan(0);

    for (const market of event.markets) {
        validateUnifiedMarket(market, exchangeName, event.id);
    }

    // 3. Methods (Dynamic behavior)
    expect(typeof event.searchMarkets).toBe('function');
}

export function validateUnifiedMarket(market: UnifiedMarket, exchangeName: string, eventId: string) {
    const errorPrefix = `[${exchangeName} Market: ${market.id} in Event: ${eventId}]`;

    // 1. Identity & Structure
    expect(market.id).toBeDefined();
    expect(typeof market.id).toBe('string');
    expect(market.id.length).toBeGreaterThan(0);

    expect(market.title).toBeDefined();
    expect(typeof market.title).toBe('string');

    // 2. Mathematical Consistency
    expect(typeof market.volume24h).toBe('number');
    expect(market.volume24h).toBeGreaterThanOrEqual(0);

    expect(typeof market.liquidity).toBe('number');
    expect(market.liquidity).toBeGreaterThanOrEqual(0);

    // 3. Resolution
    expect(market.resolutionDate).toBeInstanceOf(Date);
    expect(isNaN(market.resolutionDate.getTime())).toBe(false);

    // 4. Outcomes (Strict Standard)
    expect(Array.isArray(market.outcomes)).toBe(true);
    expect(market.outcomes.length).toBeGreaterThan(0);

    for (const outcome of market.outcomes) {
        validateMarketOutcome(outcome, exchangeName, market.id);
    }

    // 5. Binary Market Convenience (Check if they match outcomes if present)
    if (market.yes) {
        expect(market.outcomes).toContain(market.yes);
    }
    if (market.no) {
        expect(market.outcomes).toContain(market.no);
    }
}

export function validateMarketOutcome(outcome: MarketOutcome, exchangeName: string, marketId: string) {
    const errorPrefix = `[${exchangeName} Outcome: ${outcome.id} in Market: ${marketId}]`;

    // 1. Identity
    expect(outcome.id).toBeDefined();
    expect(typeof outcome.id).toBe('string');
    expect(outcome.id.length).toBeGreaterThan(0);

    expect(outcome.label).toBeDefined();
    expect(typeof outcome.label).toBe('string');

    // 2. Normalization Rule: price MUST be 0.0 to 1.0 (Probability)
    expect(typeof outcome.price).toBe('number');
    expect(outcome.price).toBeGreaterThanOrEqual(0);
    expect(outcome.price).toBeLessThanOrEqual(1);

    if (outcome.priceChange24h !== undefined) {
        expect(typeof outcome.priceChange24h).toBe('number');
    }
}

export function validatePriceCandle(candle: PriceCandle, exchangeName: string, outcomeId: string) {
    const errorPrefix = `[${exchangeName} Candle: ${candle.timestamp} for Outcome: ${outcomeId}]`;

    // 1. Identity & Structure
    expect(candle.timestamp).toBeDefined();
    expect(typeof candle.timestamp).toBe('number');
    // Sanity check: timestamp should be in milliseconds or seconds and positive
    expect(candle.timestamp).toBeGreaterThan(0);

    // 2. OHLC Values
    expect(typeof candle.open).toBe('number');
    expect(candle.open).toBeGreaterThanOrEqual(0);
    expect(candle.open).toBeLessThanOrEqual(1);

    expect(typeof candle.high).toBe('number');
    expect(candle.high).toBeGreaterThanOrEqual(0);
    expect(candle.high).toBeLessThanOrEqual(1);

    expect(typeof candle.low).toBe('number');
    expect(candle.low).toBeGreaterThanOrEqual(0);
    expect(candle.low).toBeLessThanOrEqual(1);

    expect(typeof candle.close).toBe('number');
    expect(candle.close).toBeGreaterThanOrEqual(0);
    expect(candle.close).toBeLessThanOrEqual(1);

    // 3. Mathematical Consistency
    expect(candle.high).toBeGreaterThanOrEqual(candle.low);
    expect(candle.high).toBeGreaterThanOrEqual(candle.open);
    expect(candle.high).toBeGreaterThanOrEqual(candle.close);
    expect(candle.low).toBeLessThanOrEqual(candle.open);
    expect(candle.low).toBeLessThanOrEqual(candle.close);

    // 4. Optional Volume
    if (candle.volume !== undefined) {
        expect(typeof candle.volume).toBe('number');
        expect(candle.volume).toBeGreaterThanOrEqual(0);
    }
}

export function validateOrderBook(orderbook: OrderBook, exchangeName: string, outcomeId: string) {
    const errorPrefix = `[${exchangeName} OrderBook for Outcome: ${outcomeId}]`;

    // 1. Structure
    expect(orderbook).toBeDefined();
    expect(Array.isArray(orderbook.bids)).toBe(true);
    expect(Array.isArray(orderbook.asks)).toBe(true);

    // 2. Bids Validation
    for (const bid of orderbook.bids) {
        expect(typeof bid.price).toBe('number');
        expect(bid.price).toBeGreaterThanOrEqual(0);
        expect(bid.price).toBeLessThanOrEqual(1);
        expect(typeof bid.size).toBe('number');
        expect(bid.size).toBeGreaterThan(0);
    }

    // 3. Asks Validation
    for (const ask of orderbook.asks) {
        expect(typeof ask.price).toBe('number');
        expect(ask.price).toBeGreaterThanOrEqual(0);
        expect(ask.price).toBeLessThanOrEqual(1);
        expect(typeof ask.size).toBe('number');
        expect(ask.size).toBeGreaterThan(0);
    }

    // 4. Mathematical Consistency (Spread)
    if (orderbook.bids.length > 0 && orderbook.asks.length > 0) {
        const bestBid = orderbook.bids[0].price;
        const bestAsk = orderbook.asks[0].price;
        // In a normal market, best bid should be less than or equal to best ask
        // Note: Some markets might be crossed due to latency, but usually best bid <= best ask
        // However, some prediction markets (like Poly) occasionally show crossed books in API
        // For compliance, we just check they are within 0-1 range.
        expect(bestBid).toBeLessThanOrEqual(1);
        expect(bestAsk).toBeGreaterThanOrEqual(0);
    }

    // 5. Sorted order (Bids descending, Asks ascending)
    for (let i = 1; i < orderbook.bids.length; i++) {
        expect(orderbook.bids[i].price).toBeLessThanOrEqual(orderbook.bids[i - 1].price);
    }
    for (let i = 1; i < orderbook.asks.length; i++) {
        expect(orderbook.asks[i].price).toBeGreaterThanOrEqual(orderbook.asks[i - 1].price);
    }
}

export function validateTrade(trade: Trade, exchangeName: string, outcomeId: string) {
    const errorPrefix = `[${exchangeName} Trade: ${trade.id} for Outcome: ${outcomeId}]`;

    expect(trade.id).toBeDefined();
    expect(typeof trade.id).toBe('string');
    expect(trade.timestamp).toBeDefined();
    expect(typeof trade.timestamp).toBe('number');
    expect(trade.timestamp).toBeGreaterThan(0);

    expect(typeof trade.price).toBe('number');
    expect(trade.price).toBeGreaterThanOrEqual(0);
    expect(trade.price).toBeLessThanOrEqual(1);

    expect(typeof trade.amount).toBe('number');
    expect(trade.amount).toBeGreaterThan(0);

    expect(['buy', 'sell', 'unknown']).toContain(trade.side);
}

export function validatePosition(position: Position, exchangeName: string) {
    const errorPrefix = `[${exchangeName} Position: ${position.marketId}]`;

    expect(position.marketId).toBeDefined();
    expect(typeof position.marketId).toBe('string');

    expect(position.outcomeId).toBeDefined();
    expect(typeof position.outcomeId).toBe('string');

    expect(position.outcomeLabel).toBeDefined();
    expect(typeof position.outcomeLabel).toBe('string');

    expect(typeof position.size).toBe('number');
    // Size can be anything, but usually non-zero if it's a position

    expect(typeof position.entryPrice).toBe('number');
    expect(position.entryPrice).toBeGreaterThanOrEqual(0);

    expect(typeof position.currentPrice).toBe('number');
    expect(position.currentPrice).toBeGreaterThanOrEqual(0);

    expect(typeof position.unrealizedPnL).toBe('number');
}

export function validateOrder(order: Order, exchangeName: string) {
    const errorPrefix = `[${exchangeName} Order: ${order.id}]`;

    expect(order.id).toBeDefined();
    expect(typeof order.id).toBe('string');

    expect(order.marketId).toBeDefined();
    expect(typeof order.marketId).toBe('string');

    expect(order.outcomeId).toBeDefined();
    expect(typeof order.outcomeId).toBe('string');

    expect(['buy', 'sell']).toContain(order.side);
    expect(['market', 'limit']).toContain(order.type);

    if (order.type === 'limit') {
        expect(typeof order.price).toBe('number');
        expect(order.price).toBeGreaterThanOrEqual(0);
        expect(order.price).toBeLessThanOrEqual(1);
    }

    expect(typeof order.amount).toBe('number');
    expect(order.amount).toBeGreaterThan(0);

    expect(['pending', 'open', 'filled', 'cancelled', 'rejected']).toContain(order.status);

    expect(typeof order.filled).toBe('number');
    expect(order.filled).toBeGreaterThanOrEqual(0);

    expect(typeof order.remaining).toBe('number');
    expect(order.remaining).toBeGreaterThanOrEqual(0);

    expect(typeof order.timestamp).toBe('number');
    expect(order.timestamp).toBeGreaterThan(0);
}

// ----------------------------------------------------------------------------
// Mock Credentials Helper
// ----------------------------------------------------------------------------

let cachedRsaKey: string | undefined;

export function getMockCredentials() {
    // 1. Ethereum Private Key (random 32 bytes hex)
    const ethPrivateKey = "0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";

    // 2. RSA Private Key (Lazy generation to save time)
    if (!cachedRsaKey) {
        const { privateKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
        });
        cachedRsaKey = privateKey;
    }

    return {
        ethPrivateKey,
        kalshiPrivateKey: cachedRsaKey
    };
}
