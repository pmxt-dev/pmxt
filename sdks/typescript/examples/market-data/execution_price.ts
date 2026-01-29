import pmxt from 'pmxtjs';

const main = async () => {
    const api = new pmxt.Polymarket();
    const markets = await api.searchMarkets('Trump');
    const outcomeId = markets[0].outcomes[0].id;

    const orderBook = await api.fetchOrderBook(outcomeId);
    const price = await api.getExecutionPrice(orderBook, 'buy', 100);
    console.log(`Average price for 100 shares: ${price}`);

    // Get detailed information
    const detailed = await api.getExecutionPriceDetailed(orderBook, 'buy', 100);
    console.log(`Filled: ${detailed.filledAmount}, Fully filled: ${detailed.fullyFilled}`);
};

main();
