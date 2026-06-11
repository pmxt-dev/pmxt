/**
 * E2E test for Router.fetchOrderBook — run with:
 *   npx ts-node src/router/e2e-orderbook.ts
 *
 * Requires PMXT_API_KEY in env.
 */
import { Router } from './Router';
import { PolymarketExchange } from '../exchanges/polymarket';
import { LimitlessExchange } from '../exchanges/limitless';
import { logger } from '../utils/logger';

async function main() {
    const apiKey = process.env.PMXT_API_KEY;
    if (!apiKey) {
        logger.error('Set PMXT_API_KEY');
        process.exit(1);
    }

    const polymarket = new PolymarketExchange({});
    const limitless = new LimitlessExchange({});

    const router = new Router({
        apiKey,
        exchanges: { polymarket, limitless },
    });

    // Morocco FIFA World Cup market on Polymarket
    const marketId = 'f017596d-4d53-49d5-a7d6-36ed9c37fdc4';

    logger.info('Fetching unified orderbook for Morocco (Polymarket + Limitless)...');
    logger.info(`Input market ID: ${marketId}`);
    logger.info('---');

    const book = await router.fetchOrderBook(marketId, undefined, { side: 'yes' });

    logger.info(`Bids: ${book.bids.length} levels`);
    logger.info(`Asks: ${book.asks.length} levels`);
    logger.info('Top 5 bids:', { bids: book.bids.slice(0, 5) });
    logger.info('Top 5 asks:', { asks: book.asks.slice(0, 5) });

    // Verify we got data from BOTH exchanges
    // Polymarket top bid was 0.016, Limitless had 0.002
    // If merged correctly, we should see both
    const hasPoly = book.bids.some((b) => b.price === 0.016);
    const hasLimitless = book.bids.some((b) => b.price === 0.002);

    logger.info('---');
    logger.info(`Has Polymarket levels: ${hasPoly}`);
    logger.info(`Has Limitless levels: ${hasLimitless}`);

    if (hasPoly && hasLimitless) {
        logger.info('SUCCESS: Merged orderbook contains levels from both exchanges');
    } else if (!hasPoly && hasLimitless) {
        logger.info('PARTIAL: Only Limitless book (source market fetch failed)');
    } else if (hasPoly && !hasLimitless) {
        logger.info('PARTIAL: Only Polymarket book (matched market fetch failed)');
    } else {
        logger.info('FAIL: No data from either exchange');
    }
}

main().catch((err) => {
    logger.error('E2E orderbook script failed', { error: String(err) });
    process.exit(1);
});
