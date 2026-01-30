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

    console.log(`Watching equilibrium for: ${market.title}`);
    console.log(`Outcome: ${outcome.label} (Asset ID: ${assetId})\n`);

    try {
        while (true) {
            const book = await api.watchOrderBook(assetId);

            console.clear();
            console.log(`Market: ${market.title}`);
            console.log(`Outcome: ${outcome.label} | Time: ${new Date().toLocaleTimeString()}\n`);

            console.log("--- ASKS (Sellers) ---");
            const topAsks = book.asks.slice(0, 5).reverse();
            topAsks.forEach(a => console.log(`  $${a.price.toFixed(3)} | ${a.size.toLocaleString().padStart(10)}`));

            if (book.asks[0] && book.bids[0]) {
                const spread = book.asks[0].price - book.bids[0].price;
                const mid = (book.asks[0].price + book.bids[0].price) / 2;
                console.log(`\n>> SPREAD: ${spread.toFixed(3)} | MID: $${mid.toFixed(3)} <<\n`);
            } else {
                console.log("\n--- SPREAD N/A ---\n");
            }

            console.log("--- BIDS (Buyers) ---");
            const topBids = book.bids.slice(0, 5);
            topBids.forEach(b => console.log(`  $${b.price.toFixed(3)} | ${b.size.toLocaleString().padStart(10)}`));

            console.log("\n(Watching live updates...)");
        }
    } catch (error: any) {
        console.error('Error:', error.message);
    } finally {
        await api.close();
    }
}

run().catch(console.error);
