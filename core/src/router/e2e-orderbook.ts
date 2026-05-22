/**
 * E2E test for Router.fetchOrderBook — run with:
 *   npx ts-node src/router/e2e-orderbook.ts
 *
 * Requires PMXT_API_KEY in env.
 */
import { Router } from './Router';
import { PolymarketExchange } from '../exchanges/polymarket';
import { LimitlessExchange } from '../exchanges/limitless';

async function main() {
    const apiKey = process.env.PMXT_API_KEY;
    if (!apiKey) {
        console.error('Set PMXT_API_KEY');
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

    console.log('Fetching unified orderbook for Morocco (Polymarket + Limitless)...');
    console.log(`Input market ID: ${marketId}`);
    console.log('---');

    const book = await router.fetchOrderBook(marketId, undefined, { side: 'yes' });

    console.log(`Bids: ${book.bids.length} levels`);
    console.log(`Asks: ${book.asks.length} levels`);
    console.log('Top 5 bids:', book.bids.slice(0, 5));
    console.log('Top 5 asks:', book.asks.slice(0, 5));

    // Verify we got data from BOTH exchanges
    // Polymarket top bid was 0.016, Limitless had 0.002
    // If merged correctly, we should see both
    const hasPoly = book.bids.some((b) => b.price === 0.016);
    const hasLimitless = book.bids.some((b) => b.price === 0.002);

    console.log('---');
    console.log(`Has Polymarket levels: ${hasPoly}`);
    console.log(`Has Limitless levels: ${hasLimitless}`);

    if (hasPoly && hasLimitless) {
        console.log('SUCCESS: Merged orderbook contains levels from both exchanges');
    } else if (!hasPoly && hasLimitless) {
        console.log('PARTIAL: Only Limitless book (source market fetch failed)');
    } else if (hasPoly && !hasLimitless) {
        console.log('PARTIAL: Only Polymarket book (matched market fetch failed)');
    } else {
        console.log('FAIL: No data from either exchange');
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
