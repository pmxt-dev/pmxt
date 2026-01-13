
import { ExchangeCredentials } from '../../BaseExchange';
import * as crypto from 'crypto';

/**
 * Manages Kalshi authentication using RSA-PSS signatures.
 * Reference: https://docs.kalshi.com/getting_started/quick_start_authenticated_requests
 */
export class KalshiAuth {
    private credentials: ExchangeCredentials;

    constructor(credentials: ExchangeCredentials) {
        this.credentials = credentials;
        this.validateCredentials();
    }

    private validateCredentials() {
        if (!this.credentials.apiKey) {
            throw new Error('Kalshi requires an apiKey (Key ID) for authentication');
        }
        if (!this.credentials.privateKey) {
            throw new Error('Kalshi requires a privateKey (RSA Private Key) for authentication');
        }
    }

    /**
     * Generates the required headers for an authenticated request.
     * 
     * @param method The HTTP method (e.g., "GET", "POST").
     * @param path The request path (e.g., "/trade-api/v2/portfolio/orders").
     * @returns An object containing the authentication headers.
     */
    getHeaders(method: string, path: string): Record<string, string> {
        const timestamp = Date.now().toString();
        const signature = this.signRequest(timestamp, method, path);

        return {
            'KALSHI-ACCESS-KEY': this.credentials.apiKey!,
            'KALSHI-ACCESS-TIMESTAMP': timestamp,
            'KALSHI-ACCESS-SIGNATURE': signature,
            'Content-Type': 'application/json'
        };
    }

    /**
     * Signs the request using RSA-PSS.
     * The message to sign is: timestamp + method + path
     */
    private signRequest(timestamp: string, method: string, path: string): string {
        const payload = `${timestamp}${method}${path}`;
        
        try {
            const signer = crypto.createSign('SHA256');
            signer.update(payload);
            
            // Allow input of private key in both raw string or PEM format
            // If it's a raw key without headers, accessing it might be tricky with implicit types,
            // but standard PEM is best. We assume the user provides a valid PEM.
            const privateKey = this.credentials.privateKey!;

            // Kalshi uses RSA-PSS for signing
            const signature = signer.sign({
                key: privateKey,
                padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
                saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
            }, 'base64');

            return signature;
        } catch (error: any) {
            console.error('Error signing Kalshi request:', error);
            throw new Error(`Failed to sign Kalshi request: ${error.message}`);
        }
    }
}
