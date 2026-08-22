import crypto from 'crypto';
import { ExchangeCredentials } from '../../BaseExchange';
import { AuthenticationError } from '../../errors';

/**
 * Gemini HMAC-SHA384 authentication.
 *
 * Gemini's prediction market API uses header-based auth where the POST body
 * is always empty — the actual payload is base64-encoded and placed in the
 * X-GEMINI-PAYLOAD header, with an HMAC-SHA384 signature.
 */
export class GeminiAuth {
    private readonly apiKey: string;
    private readonly apiSecret: string;
    private lastNonce: number = 0;

    constructor(credentials: ExchangeCredentials) {
        if (!credentials.apiKey || !credentials.apiSecret) {
            throw new AuthenticationError(
                'Gemini Titan trading requires both apiKey and apiSecret.',
                'GeminiTitan',
            );
        }
        this.apiKey = credentials.apiKey;
        this.apiSecret = credentials.apiSecret;
    }

    /**
     * Generate a strictly monotonic nonce.
     * Uses Date.now() but ensures it never repeats even if called
     * within the same millisecond.
     */
    nonce(): number {
        const now = Date.now();
        this.lastNonce = Math.max(now, this.lastNonce + 1);
        return this.lastNonce;
    }

    /**
     * Build the three authentication headers for a given payload object.
     *
     * The payload must include `request` (endpoint path) and `nonce`.
     * Additional fields (symbol, side, etc.) are included for order requests.
     */
    buildHeaders(payload: Record<string, unknown>): Record<string, string> {
        const jsonPayload = JSON.stringify(payload);
        const b64Payload = Buffer.from(jsonPayload).toString('base64');
        const signature = crypto
            .createHmac('sha384', this.apiSecret)
            .update(b64Payload)
            .digest('hex');

        return {
            'Content-Type': 'text/plain',
            'Content-Length': '0',
            'X-GEMINI-APIKEY': this.apiKey,
            'X-GEMINI-PAYLOAD': b64Payload,
            'X-GEMINI-SIGNATURE': signature,
            'Cache-Control': 'no-cache',
        };
    }

    /**
     * Build WebSocket handshake authentication headers.
     *
     * WebSocket auth uses a time-based nonce (milliseconds since epoch)
     * as the payload, not a JSON object.
     */
    buildWsHeaders(): Record<string, string> {
        const nonce = Date.now().toString();
        const b64Payload = Buffer.from(nonce).toString('base64');
        const signature = crypto
            .createHmac('sha384', this.apiSecret)
            .update(b64Payload)
            .digest('hex');

        return {
            'X-GEMINI-APIKEY': this.apiKey,
            'X-GEMINI-NONCE': nonce,
            'X-GEMINI-PAYLOAD': b64Payload,
            'X-GEMINI-SIGNATURE': signature,
        };
    }
}
