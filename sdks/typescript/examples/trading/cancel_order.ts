import 'dotenv/config';
import { config } from 'dotenv'; config({ path: '../../.env' });
import pmxt from 'pmxtjs';

(async () => {
    const client = new pmxt.Polymarket({
        privateKey: process.env.POLYMARKET_PRIVATE_KEY,
        proxyAddress: process.env.POLYMARKET_PROXY_ADDRESS,
        signatureType: 'gnosis-safe'
    });
    const orderId = 'input_order_id_here';
    const result = await client.cancelOrder(orderId);
    console.log(result);
})();
