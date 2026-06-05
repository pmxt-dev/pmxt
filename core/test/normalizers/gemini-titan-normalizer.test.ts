import { GeminiNormalizer } from '../../src/exchanges/gemini-titan/normalizer';

describe('GeminiTitanNormalizer', () => {
    const normalizer = new GeminiNormalizer();

    const rawEvent: any = {
        id: 'evt-1',
        title: 'Gemini prediction market event',
        slug: 'gemini-prediction-market-event',
        description: 'Event-level description fallback',
        ticker: 'GEM-1',
        status: 'active',
        type: 'prediction-market',
        liquidity: undefined,
        volume24h: '1234.5',
        volume: '9999.9',
        contracts: [
            {
                id: 'contract-1',
                label: 'BTC above $100k',
                description: {
                    nodeType: 'document',
                    content: [
                        {
                            nodeType: 'paragraph',
                            content: [
                                { nodeType: 'text', value: 'Contract rich-text description' },
                            ],
                        },
                    ],
                },
                ticker: 'GEM-1-A',
                instrumentSymbol: 'GEM-1-A',
                status: 'active',
                marketState: 'open',
                prices: {
                    buy: { yes: '0.71', no: '0.29' },
                    sell: { yes: '0.69', no: '0.31' },
                    bestBid: '0.60',
                    bestAsk: '0.40',
                    lastTradePrice: '0.55',
                },
                expiryDate: '2026-06-30T23:59:00Z',
            },
        ],
    };

    test('extracts rich-text contract descriptions', () => {
        const market = normalizer.normalizeMarket(rawEvent);
        expect(market).not.toBeNull();
        expect(market!.description).toBe('Contract rich-text description');
    });

    test('prefers directional buy/sell prices when present', () => {
        const market = normalizer.normalizeMarket(rawEvent);
        expect(market).not.toBeNull();
        expect(market!.outcomes[0].price).toBeCloseTo(0.71);
        expect(market!.outcomes[1].price).toBeCloseTo(0.29);
    });

    test('falls back to volume fields when liquidity is absent', () => {
        const market = normalizer.normalizeMarket(rawEvent);
        expect(market).not.toBeNull();
        expect(market!.liquidity).toBeCloseTo(1234.5);
    });
});
