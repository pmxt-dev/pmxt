import { getAuthNonce, loginWithSignature, logoutSession } from '../../src/exchanges/probable/auth';

describe('Probable Auth Lifecycle', () => {
    const mockWalletAddress = '0x1234567890abcdef1234567890abcdef12345678';
    const mockSignature = '0xabc123...';
    const mockNonce = 'random-nonce-string';

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should fetch and map nonce correctly', async () => {
        const mockCallApi = jest.fn().mockResolvedValue({
            nonce: mockNonce,
            message: 'Sign this message to authenticate with Probable'
        });

        const result = await getAuthNonce(mockWalletAddress, mockCallApi);
        
        expect(mockCallApi).toHaveBeenCalledWith('getAuthNonce', { address: mockWalletAddress });
        expect(result.nonce).toBe(mockNonce);
        expect(result.messageToSign).toBe('Sign this message to authenticate with Probable');
    });

    it('should submit signature and map session credentials correctly', async () => {
        const mockCallApi = jest.fn().mockResolvedValue({
            apiKey: 'key-123',
            apiSecret: 'secret-456',
            passphrase: 'passphrase-789',
            expiresAt: 1700000000000
        });

        const result = await loginWithSignature(mockWalletAddress, mockSignature, mockNonce, mockCallApi);
        
        expect(mockCallApi).toHaveBeenCalledWith('postAuthLogin', {
            address: mockWalletAddress,
            signature: mockSignature,
            nonce: mockNonce
        });
        expect(result.apiKey).toBe('key-123');
        expect(result.apiSecret).toBe('secret-456');
    });

    it('should trigger logout successfully', async () => {
        const mockCallApi = jest.fn().mockResolvedValue({});

        await logoutSession(mockCallApi);
        
        expect(mockCallApi).toHaveBeenCalledWith('postAuthLogout', {});
    });
});