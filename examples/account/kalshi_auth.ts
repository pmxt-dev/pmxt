import pmxt from '../../src/index';

const client = new pmxt.Kalshi({
    apiKey: process.env.KALSHI_API_KEY,
    privateKey: process.env.KALSHI_PRIVATE_KEY
});
