import fs from 'fs';
import path from 'path';

function readRepoFile(relativePath: string): string {
    return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

describe('sidecar default exchange registry', () => {
    test('includes every public exchange that the factory can create without per-request credentials', () => {
        const appSource = readRepoFile('src/server/app.ts');
        const factorySource = readRepoFile('src/server/exchange-factory.ts');

        for (const exchangeName of ['suibets', 'polymarket_us']) {
            expect(factorySource).toContain(`case "${exchangeName}"`);
            expect(appSource).toMatch(new RegExp(`${exchangeName}:\\s*null`));
        }
    });
});
