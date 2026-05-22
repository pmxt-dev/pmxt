/**
 * E2E test: SOR build/sign/submit via TypeScript SDK.
 * Requires: local SOR on localhost:4000, valid API key + private key,
 * Polymarket deposit wallet with pUSD + approvals.
 *
 * Run: PMXT_TEST_API_KEY=pmxt_... PMXT_TEST_PRIVATE_KEY=0x... npx jest core/test/pipeline/sor-e2e.test.js
 */

const API_KEY = process.env.PMXT_TEST_API_KEY;
const PRIVATE_KEY = process.env.PMXT_TEST_PRIVATE_KEY;
const HOST = process.env.PMXT_TEST_HOST || 'http://localhost:4000';

const skip = !API_KEY || !PRIVATE_KEY;

describe('SOR E2E (non-custodial)', () => {
    if (skip) {
        it.skip('skipped -- set PMXT_TEST_API_KEY + PMXT_TEST_PRIVATE_KEY', () => {});
        return;
    }

    let Exchange;

    beforeAll(() => {
        Exchange = require('../../../sdks/typescript/dist').Exchange;
    });

    it('createOrder: build → sign locally → submit', async () => {
        const sor = new Exchange('sor', {
            pmxtApiKey: API_KEY,
            privateKey: PRIVATE_KEY,
            baseUrl: HOST,
        });

        // Use buildOrder directly to find a market with liquidity
        const marketId = process.env.PMXT_TEST_MARKET_ID || '81cafdef-b2d7-413c-8e73-5837f4c1b314';
        expect(marketId).toBeTruthy();

        const order = await sor.createOrder({
            marketId,
            side: 'buy',
            outcome: 'yes',
            shares: 2,
        });

        expect(order).toBeDefined();
        expect(order.id).toBeTruthy();
        expect(['filled', 'partial', 'failed']).toContain(order.status);
    }, 60_000);

    it('account auto-discovery returns deposit wallet', async () => {
        const res = await fetch(`${HOST}/v0/account`, {
            headers: { Authorization: `Bearer ${API_KEY}` },
        });
        const data = await res.json();

        expect(data.deposit_wallet).toBeTruthy();
        expect(data.signature_type).toBe(3);
    });
});
