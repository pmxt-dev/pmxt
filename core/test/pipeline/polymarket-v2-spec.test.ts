import fs from 'fs';
import path from 'path';

import { polymarketClobSpec } from '../../src/exchanges/polymarket/api-clob';
import { parseOpenApiSpec } from '../../src/utils/openapi';

describe('Polymarket CLOB V2 spec drift coverage', () => {
    test('exposes the pUSD balance/allowance cache sync endpoint as an L2-authenticated implicit API method', () => {
        const descriptor = parseOpenApiSpec(polymarketClobSpec);

        expect(descriptor.endpoints.updateBalanceAllowance).toMatchObject({
            method: 'GET',
            path: '/balance-allowance/update',
            isPrivate: true,
            operationId: 'updateBalanceAllowance',
        });
    });

    test('keeps the Polymarket on-chain balance lookup on pUSD instead of legacy USDC.e', () => {
        const source = fs.readFileSync(
            path.join(__dirname, '../../src/exchanges/polymarket/index.ts'),
            'utf8',
        );

        expect(source).toContain('0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB');
        expect(source).not.toContain('0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174');
    });
});
