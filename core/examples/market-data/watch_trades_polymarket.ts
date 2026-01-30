import pmxt from '../../src';

async function run() {
    const api = new pmxt.polymarket();

    // 1. Search for the broad Event
    console.log("Searching for Event: Fed Chair...");
    const events = await api.searchEvents("Who will Trump nominate as Fed Chair?");
    const event = events[0];

    // 2. Search for the specific Market within that event
    console.log("Searching for Market: Kevin Warsh...");
    const markets = event.searchMarkets("Kevin Warsh");

    const market = markets[0];
    const outcome = market.yes!; // Convenience access
    const assetId = outcome.id;

    console.log(`Watching trades for: ${market.title}`);
    console.log(`Outcome: ${outcome.label} (Asset ID: ${assetId})\n`);

    try {
        while (true) {
            const trades = await api.watchTrades(assetId);
            for (const trade of trades) {
                console.log(`[TRADE] ${trade.side.toUpperCase().padStart(4)} | ${trade.amount.toLocaleString().padStart(10)} shares @ $${trade.price.toFixed(3)} | ${new Date(trade.timestamp).toLocaleTimeString()}`);
            }
        }
    } catch (error: any) {
        console.error('Error:', error.message);
    } finally {
        await api.close();
    }
}

run().catch(console.error);
