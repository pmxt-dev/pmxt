import { config } from 'dotenv'; config({ path: '../.env' });
import pmxt from '../src/index';

(async () => {
    const pk = process.env.POLYMARKET_PRIVATE_KEY;
    const client = new pmxt.Polymarket({ privateKey: pk });
    const balance = await client.fetchBalance();
    console.log(balance);
})();
