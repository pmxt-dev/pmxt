import pmxt from 'pmxtjs';

const main = async () => {
    const api = new pmxt.Polymarket();
    const markets = await api.fetchMarkets({ query: 'Trump' });
    const outcomeId = markets[0].outcomes[0].outcomeId;

    const orderBook = await api.fetchOrderBook(outcomeId);
    const price = api.getExecutionPrice(orderBook, 'buy', 100);
    console.log(`Average price for 100 shares: ${price}`);

    // Get detailed information
    const detailed = await api.getExecutionPriceDetailed(orderBook, 'buy', 100);
    console.log(`Filled: ${detailed.filledAmount}, Fully filled: ${detailed.fullyFilled}`);
};

main();
