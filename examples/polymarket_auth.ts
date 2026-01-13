import pmxt from '../src/index';

const client = new pmxt.Polymarket({
    privateKey: process.env.POLYMARKET_PRIVATE_KEY // Must start with '0x'
});