import crypto from 'crypto';
import { GeminiAuth } from '../../src/exchanges/gemini-titan/auth';

// Milliseconds matter here: Gemini's WebSocket API requires the handshake
// nonce to be a Unix timestamp in milliseconds.
const FROZEN_NOW_MS = 1755878400000; // 2025-08-22T16:00:00.000Z

describe('GeminiAuth WebSocket headers', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('uses a millisecond nonce for the WebSocket handshake', () => {
        jest.spyOn(Date, 'now').mockReturnValue(FROZEN_NOW_MS);
        const auth = new GeminiAuth({ apiKey: 'test-key', apiSecret: 'test-secret' });

        const headers = auth.buildWsHeaders();

        expect(headers['X-GEMINI-NONCE']).toBe(String(FROZEN_NOW_MS));
    });

    it('signs the same millisecond nonce it sends', () => {
        jest.spyOn(Date, 'now').mockReturnValue(FROZEN_NOW_MS);
        const auth = new GeminiAuth({ apiKey: 'test-key', apiSecret: 'test-secret' });

        const headers = auth.buildWsHeaders();

        const payload = Buffer.from(headers['X-GEMINI-PAYLOAD'], 'base64').toString('utf8');
        expect(payload).toBe(String(FROZEN_NOW_MS));

        const expectedSignature = crypto
            .createHmac('sha384', 'test-secret')
            .update(headers['X-GEMINI-PAYLOAD'])
            .digest('hex');
        expect(headers['X-GEMINI-SIGNATURE']).toBe(expectedSignature);
    });
});
