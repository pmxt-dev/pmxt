import pmxt from 'pmxtjs';

const main = async () => {
    const api = new pmxt.Polymarket();
    const events = await api.searchEvents('Who will Trump nominate as Fed Chair?');
    const event = events[0];

    // 2. Search for the specific Market within that event
    const market = event.searchMarkets('Kevin Warsh')[0];

    // Note: Use market.yes.id for the outcome ID (CLOB Token ID on Poly)
    const history = await api.fetchOHLCV(market.yes!.id, {
        resolution: '1h',
        limit: 5
    });

    console.log(history);
};

main();
