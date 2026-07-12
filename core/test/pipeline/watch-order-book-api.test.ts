import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../../..');

function read(relativePath: string): string {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

const orderBookStreamingVenues = [
    'polymarket',
    'kalshi',
    'limitless',
    'opinion',
    'polymarket_us',
    'probable',
    'baozi',
    'myriad',
    'gemini-titan',
    'rain',
    'hunch',
];

const tradeStreamingVenues = [
    'polymarket',
    'kalshi',
    'limitless',
    'opinion',
    'polymarket_us',
    'myriad',
    'gemini-titan',
    'rain',
    'hunch',
];

function inlineVenueList(venues: string[]): string {
    return venues.map((venue) => `\`${venue}\``).join(', ');
}

describe('watchOrderBook API consistency', () => {
    it('keeps the core signature CCXT-compatible with limit and params', () => {
        const baseExchange = read('core/src/BaseExchange.ts');
        const methodVerbs = read('core/src/server/method-verbs.json');
        const generatedApiConfig = read('core/api-doc-config.generated.json');
        const tsClient = read('sdks/typescript/pmxt/client.ts');
        const pyClient = read('sdks/python/pmxt/client.py');
        const methodVerbConfig = JSON.parse(methodVerbs);
        const apiConfig = JSON.parse(generatedApiConfig);

        expect(baseExchange).toContain(
            'async watchOrderBook(outcomeId: string, limit?: number, params: Record<string, any> = {})',
        );
        expect(methodVerbConfig.watchOrderBook.args).toEqual([
            { name: 'outcomeId', kind: 'string', optional: false },
            { name: 'limit', kind: 'number', optional: true },
            { name: 'params', kind: 'object', optional: true },
        ]);
        expect(apiConfig.methods.watchOrderBook.params.map((param: { name: string }) => param.name)).toEqual([
            'outcomeId',
            'limit',
            'params',
        ]);
        expect(tsClient).toContain(
            'async watchOrderBook(outcomeId: string | MarketOutcome, limit?: number, params: Record<string, any> = {})',
        );
        expect(pyClient).toContain('params: Optional[Dict[str, Any]] = None');
    });

    it('documents watchOrderBook limit and params in public docs and llms export', () => {
        const docs = read('docs/api-reference/watch-order-book.mdx');
        const llms = read('docs/llms-full.txt');

        for (const source of [docs, llms]) {
            expect(source).toContain(
                '| `limit` | number | No | Optional depth limit for the streamed order book |',
            );
            expect(source).toContain(
                '| `params` | object | No | Optional exchange-specific parameters |',
            );
        }
    });

    it('documents the implemented streaming venue scope', () => {
        const watchOrderBookDocs = read('docs/api-reference/watch-order-book.mdx');
        const watchOrderBooksDocs = read('docs/api-reference/watch-order-books.mdx');
        const watchTradesDocs = read('docs/api-reference/watch-trades.mdx');
        const watchAllOrderBooksDocs = read('docs/api-reference/watch-all-order-books.mdx');
        const llms = read('docs/llms-full.txt');

        const orderBookVenueList = inlineVenueList(orderBookStreamingVenues);
        const tradeVenueList = inlineVenueList(tradeStreamingVenues);

        expect(watchOrderBookDocs).toContain(`Supported venues: ${orderBookVenueList}.`);
        expect(watchOrderBooksDocs).toContain(`Supported venues: ${orderBookVenueList}.`);
        expect(watchTradesDocs).toContain(`Supported venues: ${tradeVenueList}.`);
        expect(watchAllOrderBooksDocs).toContain(
            'Available venues: `polymarket`, `kalshi`, `limitless`, `opinion`.',
        );
        expect(llms).toContain(`Supported venues: ${orderBookVenueList}.`);
        expect(llms).toContain(`Supported venues: ${tradeVenueList}.`);
        expect(llms).toContain(
            'Available venues: `polymarket`, `kalshi`, `limitless`, `opinion`.',
        );
    });
});
