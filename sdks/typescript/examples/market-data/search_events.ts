import pmxt from 'pmxtjs';

const main = async () => {
    const poly = new pmxt.Polymarket();
    // const kalshi = new pmxt.Kalshi();

    const events = await poly.searchEvents('Fed Chair');

    events.forEach(event => {
        console.log(`Event: ${event.title}`);
        console.log(`  Markets: ${event.markets.length}`);
    });
};

main();
