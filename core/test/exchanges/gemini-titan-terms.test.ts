import { GeminiTitanExchange } from '../../src/exchanges/gemini-titan';
import { GeminiFetcher } from '../../src/exchanges/gemini-titan';

describe('Gemini-Titan Terms Acceptance', () => {
    let fetcher: GeminiFetcher;
    let exchange: GeminiTitanExchange;

    beforeEach(() => {
        // Create a real fetcher instance
        fetcher = new GeminiFetcher(
            {
                http: {
                    get: jest.fn(),
                    post: jest.fn(),
                },
                callApi: jest.fn(),
                getHeaders: jest.fn(),
            },
            'https://api.gemini.com',
            {
                apiKey: 'test_key',
                apiSecret: 'test_secret',
                nonce: () => Date.now(),
                buildHeaders: jest.fn().mockReturnValue({}),
            } as any
        );
        
        exchange = new GeminiTitanExchange({
            apiKey: 'test_key',
            apiSecret: 'test_secret'
        });
    });

    test('getTermsStatus returns status', async () => {
        const mockStatus = {
            hasAcceptedLatest: false,
            acceptedVersion: '1.0',
            latestVersion: '2.0'
        };
        
        // Spy on the method
        jest.spyOn(fetcher, 'getTermsStatus').mockResolvedValue(mockStatus);
        
        const result = await fetcher.getTermsStatus();
        expect(result.hasAcceptedLatest).toBe(false);
        expect(result.latestVersion).toBe('2.0');
    });

    test('acceptTerms returns success', async () => {
        const mockResponse = {
            accepted: true,
            version: '2.0'
        };
        
        jest.spyOn(fetcher, 'acceptTerms').mockResolvedValue(mockResponse);
        
        const result = await fetcher.acceptTerms();
        expect(result.accepted).toBe(true);
        expect(result.version).toBe('2.0');
    });

    test('ensureTermsAccepted auto-accepts if needed', async () => {
        // Mock getTermsStatus to say terms not accepted
        jest.spyOn(fetcher, 'getTermsStatus').mockResolvedValue({
            hasAcceptedLatest: false,
            latestVersion: '2.0'
        });
        
        // Spy on acceptTerms to track if it's called
        const acceptSpy = jest.spyOn(fetcher, 'acceptTerms').mockResolvedValue({
            accepted: true,
            version: '2.0'
        });
        
        await fetcher.ensureTermsAccepted();
        expect(acceptSpy).toHaveBeenCalled();
    });

    test('ensureTermsAccepted does nothing if already accepted', async () => {
        // Mock getTermsStatus to say terms already accepted
        jest.spyOn(fetcher, 'getTermsStatus').mockResolvedValue({
            hasAcceptedLatest: true
        });
        
        const acceptSpy = jest.spyOn(fetcher, 'acceptTerms');
        
        await fetcher.ensureTermsAccepted();
        expect(acceptSpy).not.toHaveBeenCalled();
    });

    test('ensureTermsAccepted skips if already accepted in session', async () => {
        // Set termsAccepted to true
        (fetcher as any).termsAccepted = true;
        
        const statusSpy = jest.spyOn(fetcher, 'getTermsStatus');
        const acceptSpy = jest.spyOn(fetcher, 'acceptTerms');
        
        await fetcher.ensureTermsAccepted();
        
        // Should skip the check entirely
        expect(statusSpy).not.toHaveBeenCalled();
        expect(acceptSpy).not.toHaveBeenCalled();
    });

    test('submitRawOrder calls ensureTermsAccepted first', async () => {
        // Mock ensureTermsAccepted to track calls
        const ensureSpy = jest.spyOn(fetcher, 'ensureTermsAccepted').mockResolvedValue();
        
        // Mock postAuthenticated for order submission
        const postSpy = jest.spyOn(fetcher as any, 'postAuthenticated').mockResolvedValue({
            orderId: '123',
            status: 'accepted'
        });
        
        await fetcher.submitRawOrder({ symbol: 'BTC-USD', amount: 100 });
        expect(ensureSpy).toHaveBeenCalled();
        expect(postSpy).toHaveBeenCalledWith(
            '/v1/prediction-markets/order',
            { symbol: 'BTC-USD', amount: 100 }
        );
    });
});