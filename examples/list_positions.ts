import 'dotenv/config';
import pmxt from '../src/index';
import { fetchPositions } from '../src/exchanges/polymarket/fetchPositions';

(async () => {
    // 1. To list specific user's positions (e.g. a whale):
    const whalePositions = await fetchPositions('0xd4f584f55021df46a69f8bc8c6af2d18981fe5e7');
    console.log(whalePositions);

    // 2. To list YOUR positions:
    /*
    const client = new pmxt.Polymarket({ privateKey: YOUR_PRIVATE_KEY });
    const myPositions = await client.fetchPositions();
    console.log(myPositions);
    */
})();
