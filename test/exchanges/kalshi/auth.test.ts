
import { KalshiAuth } from '../../../src/exchanges/kalshi/auth';
import { ExchangeCredentials } from '../../../src/BaseExchange';
import * as crypto from 'crypto';

describe('KalshiAuth', () => {
    // Generate a temporary RSA key pair for testing
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
        }
    });

    const mockCredentials: ExchangeCredentials = {
        apiKey: 'test-api-key-id',
        privateKey: privateKey
    };

    let auth: KalshiAuth;

    beforeEach(() => {
        auth = new KalshiAuth(mockCredentials);
    });

    it('should validate credentials on initialization', () => {
        expect(() => new KalshiAuth({})).toThrow('Kalshi requires an apiKey');
        expect(() => new KalshiAuth({ apiKey: 'foo' })).toThrow('Kalshi requires a privateKey');
    });

    it('should generate correct headers', () => {
        const method = 'GET';
        const path = '/trade-api/v2/portfolio/orders';

        const headers = auth.getHeaders(method, path);

        expect(headers['KALSHI-ACCESS-KEY']).toBe('test-api-key-id');
        expect(headers['KALSHI-ACCESS-TIMESTAMP']).toBeDefined();
        expect(headers['KALSHI-ACCESS-SIGNATURE']).toBeDefined();
        expect(headers['Content-Type']).toBe('application/json');

        // Verify the signature implies the correct structure
        const timestamp = headers['KALSHI-ACCESS-TIMESTAMP'];
        const signature = headers['KALSHI-ACCESS-SIGNATURE'];

        // We can verify the signature using the public key
        const verifier = crypto.createVerify('SHA256');
        verifier.update(`${timestamp}${method}${path}`);

        const isValid = verifier.verify({
            key: publicKey,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
        }, signature, 'base64');

        expect(isValid).toBe(true);
    });
});
