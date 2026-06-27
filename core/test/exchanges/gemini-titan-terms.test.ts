import { GeminiTitanExchange } from '../../src/exchanges/gemini-titan';
import { GeminiFetcher } from '../../src/exchanges/gemini-titan';

// Mock the GeminiAuth
jest.mock('../../src/exchanges/gemini-titan/auth', () => ({
    GeminiAuth: jest.fn().mockImplementation(() => ({
        nonce: () => Date.now(),
        buildHeaders: jest.fn().mockReturnValue({ 'X-GEMINI-PAYLOAD': 'mock' }),
    })),
}));

describe('Gemini-Titan Terms Acceptance', () => {
    let fetcher: GeminiFetcher;
    let exchange: GeminiTitanExchange;
    let mockHttp: any;

    beforeEach(() => {
        // Create mock HTTP client
        mockHttp = {
            get: jest.fn().mockResolvedValue({ data: {} }),
            post: jest.fn().mockResolvedValue({ data: {} }),
        };

        // Create a real fetcher instance with proper mocks
        const ctx = {
            http: mockHttp,
            callApi: jest.fn(),
            getHeaders: jest.fn(),
        };

        const auth = {
            apiKey: 'test_key',
            apiSecret: 'test_secret',
            nonce: () => Date.now(),
            buildHeaders: jest.fn().mockReturnValue({ 'X-GEMINI-PAYLOAD': 'mock' }),
        };

        fetcher = new GeminiFetcher(ctx as any, 'https://api.gemini.com', auth as any);
        
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
        
        // Mock the getAuthenticated method
        jest.spyOn(fetcher as any, 'getAuthenticated').mockResolvedValue(mockStatus);
        
        const result = await fetcher.getTermsStatus();
        expect(result.hasAcceptedLatest).toBe(false);
        expect(result.latestVersion).toBe('2.0');
    });

    test('acceptTerms returns success', async () => {
        const mockResponse = {
            accepted: true,
            version: '2.0'
        };
        
        // Mock postAuthenticated
        jest.spyOn(fetcher as any, 'postAuthenticated').mockResolvedValue(mockResponse);
        
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
        
        // Reset termsAccepted flag
        (fetcher as any).termsAccepted = false;
        
        await fetcher.ensureTermsAccepted();
        expect(acceptSpy).toHaveBeenCalled();
    });

    test('ensureTermsAccepted does nothing if already accepted', async () => {
        // Mock getTermsStatus to say terms already accepted
        jest.spyOn(fetcher, 'getTermsStatus').mockResolvedValue({
            hasAcceptedLatest: true
        });
        
        const acceptSpy = jest.spyOn(fetcher, 'acceptTerms');
        
        // Reset termsAccepted flag
        (fetcher as any).termsAccepted = false;
        
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
        // Spy on ensureTermsAccepted
        const ensureSpy = jest.spyOn(fetcher, 'ensureTermsAccepted').mockResolvedValue();
        
        // Mock postAuthenticated for order submission
        const postSpy = jest.spyOn(fetcher as any, 'postAuthenticated').mockResolvedValue({
            orderId: '123',
            status: 'accepted'
        });
        
        // Reset termsAccepted flag
        (fetcher as any).termsAccepted = false;
        
        await fetcher.submitRawOrder({ symbol: 'BTC-USD', amount: 100 });
        expect(ensureSpy).toHaveBeenCalled();
        expect(postSpy).toHaveBeenCalledWith(
            '/v1/prediction-markets/order',
            { symbol: 'BTC-USD', amount: 100 }
        );
    });

    test('getTerms uses GET method', async () => {
        const mockResponse = { version: '1.0', content: 'Terms content' };
        
        // Mock the getAuthenticated method
        jest.spyOn(fetcher as any, 'getAuthenticated').mockResolvedValue(mockResponse);
        
        const result = await fetcher.getTerms();
        expect(result.version).toBe('1.0');
        expect(result.content).toBe('Terms content');
    });

    test('getTermsStatus uses GET method', async () => {
        const mockResponse = { hasAcceptedLatest: true };
        
        // Mock the getAuthenticated method
        jest.spyOn(fetcher as any, 'getAuthenticated').mockResolvedValue(mockResponse);
        
        const result = await fetcher.getTermsStatus();
        expect(result.hasAcceptedLatest).toBe(true);
    });

    test('acceptTerms uses POST method and sets termsAccepted flag', async () => {
        const mockResponse = { accepted: true, version: '2.0' };
        
        // Mock postAuthenticated
        jest.spyOn(fetcher as any, 'postAuthenticated').mockResolvedValue(mockResponse);
        
        // Reset termsAccepted flag
        (fetcher as any).termsAccepted = false;
        
        const result = await fetcher.acceptTerms();
        expect(result.accepted).toBe(true);
        expect(result.version).toBe('2.0');
        expect((fetcher as any).termsAccepted).toBe(true);
    });
});