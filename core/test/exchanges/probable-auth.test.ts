import { getAuthNonce, loginWithSignature, logout, verifyL1, verifyL2 } from '../../src/exchanges/probable/auth';

describe('Probable Auth Lifecycle', () => {
    const mockCallApi = jest.fn();
    const walletAddress = '0x1234567890123456789012345678901234567890';

    beforeEach(() => {
        mockCallApi.mockReset();
    });

    test('getAuthNonce should fetch and map nonce correctly', async () => {
        mockCallApi.mockResolvedValue({
            nonce: 'abc123',
            messageToSign: 'Sign this message',
            expiresAt: Date.now() + 300000,
        });

        const result = await getAuthNonce(walletAddress, mockCallApi);

        expect(mockCallApi).toHaveBeenCalledWith('getPublicApiV1AuthNonce', { address: walletAddress });
        expect(result.nonce).toBe('abc123');
        expect(result.messageToSign).toBe('Sign this message');
    });

    test('loginWithSignature should exchange signature for credentials', async () => {
        mockCallApi.mockResolvedValue({
            apiKey: 'key_123',
            apiSecret: 'secret_456',
            passphrase: 'phrase_789',
            expiresAt: Date.now() + 3600000,
            active: true,
        });

        const result = await loginWithSignature(
            walletAddress,
            '0xSignature',
            'abc123',
            mockCallApi
        );

        expect(mockCallApi).toHaveBeenCalledWith('postPublicApiV1AuthLogin', {
            address: walletAddress,
            signature: '0xSignature',
            nonce: 'abc123',
        });
        expect(result.apiKey).toBe('key_123');
        expect(result.apiSecret).toBe('secret_456');
    });

    test('logout should call the logout endpoint', async () => {
        mockCallApi.mockResolvedValue({ success: true });

        await logout(mockCallApi);

        expect(mockCallApi).toHaveBeenCalledWith('postPublicApiV1AuthLogout', {});
    });

    test('verifyL1 should return verification result', async () => {
        mockCallApi.mockResolvedValue({ verified: true });

        const result = await verifyL1(walletAddress, '0xSignature', mockCallApi);

        expect(mockCallApi).toHaveBeenCalledWith('postPublicApiV1AuthVerifyL1', {
            address: walletAddress,
            signature: '0xSignature',
        });
        expect(result).toBe(true);
    });

    test('verifyL2 should return verification result', async () => {
        mockCallApi.mockResolvedValue({ verified: true });

        const result = await verifyL2(walletAddress, '0xSignature', mockCallApi);

        expect(mockCallApi).toHaveBeenCalledWith('postPublicApiV1AuthVerifyL2', {
            address: walletAddress,
            signature: '0xSignature',
        });
        expect(result).toBe(true);
    });

    test('should handle errors gracefully', async () => {
        mockCallApi.mockRejectedValue(new Error('Network error'));

        await expect(getAuthNonce(walletAddress, mockCallApi)).rejects.toThrow(
            'Failed to get Probable auth nonce'
        );
    });
});