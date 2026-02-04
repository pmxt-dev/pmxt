import { config } from 'dotenv'; config({ path: '../../.env' });
import pmxt from 'pmxtjs';

(async () => {
    const client = new pmxt.Polymarket({
        privateKey: process.env.POLYMARKET_PRIVATE_KEY,
        proxyAddress: process.env.POLYMARKET_PROXY_ADDRESS,
        signatureType: 'gnosis-safe'
    });
    console.log(await client.fetchBalance());
})();
