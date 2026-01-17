import pmxt from '../../src';

/**
 * Example: Watch Polymarket Orderbook in Real-Time
 * 
 * This example demonstrates how to stream orderbook updates via WebSocket.
 * It fetches an initial snapshot, then streams real-time updates.
 */

const main = async () => {
    const exchange = new pmxt.Polymarket();

    // First, get a market to watch
    const markets = await exchange.searchMarkets('election', { limit: 1 });
    
    if (markets.length === 0) {
        console.log('No markets found');
        return;
    }

    const market = markets[0];
    const tokenId = market.outcomes[0].id; // Get the token ID for the first outcome

    console.log(`Watching orderbook for: ${market.title}`);
    console.log(`Token ID: ${tokenId}`);
    console.log('---');

    try {
        // Watch orderbook updates
        let updateCount = 0;
        for await (const orderbook of exchange.watchOrderBook(tokenId)) {
            updateCount++;
            
            const bestBid = orderbook.bids[0];
            const bestAsk = orderbook.asks[0];
            const spread = bestAsk && bestBid ? bestAsk.price - bestBid.price : 0;

            console.log(`Update #${updateCount}:`);
            console.log(`  Best Bid: ${bestBid ? `${bestBid.price} (${bestBid.size})` : 'N/A'}`);
            console.log(`  Best Ask: ${bestAsk ? `${bestAsk.price} (${bestAsk.size})` : 'N/A'}`);
            console.log(`  Spread: ${spread.toFixed(4)}`);
            console.log(`  Timestamp: ${orderbook.timestamp ? new Date(orderbook.timestamp).toISOString() : 'N/A'}`);
            console.log('---');

            // Stop after 10 updates for demo purposes
            if (updateCount >= 10) {
                console.log('Stopping after 10 updates...');
                break;
            }
        }
    } catch (error) {
        console.error('Error watching orderbook:', error);
    }
};

main().catch(console.error);
