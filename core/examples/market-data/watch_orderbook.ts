import pmxt from '../../src';

const MAX_UPDATES = 10;
const MAX_DURATION_MS = 60000;

const main = async () => {
    const exchange = new pmxt.Polymarket();

    console.log('Fetching active markets...');
    const allMarkets = await exchange.fetchMarkets({ 
        limit: 100,
        sort: 'volume'
    });
    
    if (allMarkets.length === 0) {
        console.log('No markets found');
        return;
    }

    const activeMarkets = allMarkets
        .filter(m => (m.volume24h || 0) > 10000)
        .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
    
    const market = activeMarkets.length > 0 
        ? activeMarkets[0] 
        : allMarkets.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))[0];
    
    const tokenId = market.outcomes[0].id;
    
    console.log(`Selected market: ${market.title}`);
    console.log(`  24h Volume: $${(market.volume24h || 0).toLocaleString()}`);
    console.log(`  Liquidity: $${(market.liquidity || 0).toLocaleString()}`);
    console.log(`Token ID: ${tokenId}\n`);

    try {
        let updateCount = 0;
        const startTime = Date.now();
        
        let timeout: NodeJS.Timeout = setTimeout(() => {
            console.log(`\nStopping after ${MAX_DURATION_MS / 1000} seconds (received ${updateCount} update(s))...`);
            process.exit(0);
        }, MAX_DURATION_MS);
        
        for await (const orderbook of exchange.watchOrderBook(tokenId)) {
            clearTimeout(timeout);
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

            if (updateCount >= MAX_UPDATES) {
                clearTimeout(timeout);
                console.log('Stopping after 10 updates...');
                break;
            }
            
            timeout = setTimeout(() => {
                console.log(`\nStopping after ${MAX_DURATION_MS / 1000} seconds (received ${updateCount} update(s))...`);
                process.exit(0);
            }, MAX_DURATION_MS);
        }
        
        clearTimeout(timeout);
        console.log(`\nFinished. Received ${updateCount} update(s) total.`);
    } catch (error) {
        console.error('Error watching orderbook:', error);
    }
};

main().catch(console.error);
