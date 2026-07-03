import axios from 'axios';
import { ErrorMapper } from '../../utils/error-mapper';
import {
    AuthenticationError,
    BadRequest,
    InsufficientFunds,
    InvalidOrder,
    RateLimitExceeded,
} from '../../errors';

// Terms-related error patterns
const TERMS_ERROR_PATTERNS = [
    'terms_not_accepted',
    'terms required',
    'prediction markets terms',
    'accept terms',
    'terms must be accepted',
];

/**
 * Maps Gemini Titan API errors to PMXT unified error classes.
 *
 * Gemini returns errors as JSON:
 *   { result: "error", reason: "InvalidSignature", message: "..." }
 *
 * Common reasons:
 *   - InvalidSignature -> AuthenticationError
 *   - InsufficientFunds -> InsufficientFunds
 *   - InvalidQuantity, InvalidPrice, MarketNotOpen -> InvalidOrder
 *   - TermsNotAccepted -> AuthenticationError (with auto-accept flow)
 */
export class GeminiErrorMapper extends ErrorMapper {
    constructor() {
        super('GeminiTitan');
    }

    protected extractErrorMessage(error: unknown): string {
        if (axios.isAxiosError(error) && error.response?.data) {
            const data = error.response.data;
            if (typeof data === 'string') {
                return `[${error.response.status}] ${data}`;
            }
            if (data.message) {
                return `[${error.response.status}] ${data.message}`;
            }
            if (data.reason) {
                return `[${error.response.status}] ${data.reason}`;
            }
        }
        return super.extractErrorMessage(error);
    }

    /**
     * Check if an error is related to terms acceptance
     */
    private isTermsError(message: string): boolean {
        const lowerMessage = message.toLowerCase();
        return TERMS_ERROR_PATTERNS.some(pattern => lowerMessage.includes(pattern));
    }

    protected mapBadRequestError(message: string, data: unknown): BadRequest {
        const reason = typeof data === 'object' && data !== null && 'reason' in data
            ? String((data as Record<string, unknown>).reason)
            : '';
        const lowerReason = reason.toLowerCase();
        const lowerMessage = message.toLowerCase();

        // ✅ Check for terms-related errors first
        if (this.isTermsError(lowerMessage) || this.isTermsError(lowerReason)) {
            return new AuthenticationError(
                `Gemini Prediction Markets terms must be accepted before placing orders. ` +
                `The adapter will automatically accept terms on your behalf. ` +
                `Original error: ${message}`,
                this.exchangeName,
            );
        }

        if (lowerReason.includes('insufficientfunds') || lowerMessage.includes('insufficient')) {
            return new InsufficientFunds(message, this.exchangeName);
        }

        if (
            lowerReason.includes('invalidquantity') ||
            lowerReason.includes('invalidprice') ||
            lowerReason.includes('limitpriceofftick') ||
            lowerReason.includes('invalidstopprice') ||
            lowerReason.includes('marketnotopen') ||
            lowerReason.includes('unknowninstrument') ||
            lowerReason.includes('duplicateorder')
        ) {
            return new InvalidOrder(message, this.exchangeName);
        }

        if (
            lowerReason.includes('invalidsignature') ||
            lowerReason.includes('invalidapikey')
        ) {
            return new AuthenticationError(message, this.exchangeName);
        }

        return super.mapBadRequestError(message, data);
    }

    mapError(error: unknown): ReturnType<ErrorMapper['mapError']> {
        if (axios.isAxiosError(error) && error.response?.status === 429) {
            const retryAfter = error.response.headers?.['retry-after'];
            const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
            return new RateLimitExceeded(
                this.extractErrorMessage(error),
                retryAfterSeconds,
                this.exchangeName,
            );
        }

        // ✅ Check for terms errors in non-4xx responses
        if (axios.isAxiosError(error) && error.response?.data) {
            const data = error.response.data;
            const message = typeof data === 'object' && data !== null && 'message' in data
                ? String(data.message)
                : typeof data === 'string'
                    ? data
                    : '';
            
            if (this.isTermsError(message)) {
                return new AuthenticationError(
                    `Gemini Prediction Markets terms must be accepted before placing orders. ` +
                    `The adapter will automatically accept terms on your behalf. ` +
                    `Original error: ${message}`,
                    this.exchangeName,
                );
            }
        }

        return super.mapError(error);
    }
}

export const geminiErrorMapper = new GeminiErrorMapper();