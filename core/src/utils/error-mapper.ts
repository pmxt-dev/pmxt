import axios, { AxiosError } from 'axios';
import {
    BaseError,
    BadRequest,
    AuthenticationError,
    PermissionDenied,
    NotFound,
    OrderNotFound,
    MarketNotFound,
    RateLimitExceeded,
    InvalidOrder,
    InsufficientFunds,
    ValidationError,
    NetworkError,
    ExchangeNotAvailable,
} from '../errors';

/**
 * Maps raw errors to PMXT unified error classes
 *
 * Handles axios errors, network errors, and exchange-specific error formats.
 * Can be extended by exchange-specific error mappers for custom error patterns.
 */
export class ErrorMapper {
    protected exchangeName?: string;

    constructor(exchangeName?: string) {
        this.exchangeName = exchangeName;
    }

    /**
     * Main entry point for error mapping
     */
    mapError(error: any): BaseError {
        // Already a BaseError, just add exchange context if missing
        if (error instanceof BaseError) {
            if (!error.exchange && this.exchangeName) {
                return new (error.constructor as any)(
                    error.message,
                    this.exchangeName
                );
            }
            return error;
        }

        // Handle axios errors
        if (axios.isAxiosError(error)) {
            return this.mapAxiosError(error);
        }

        // Handle network errors
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
            return new NetworkError(
                `Network error: ${error.message}`,
                this.exchangeName
            );
        }

        // Generic error fallback
        const message = this.extractErrorMessage(error);
        return new BadRequest(message, this.exchangeName);
    }

    /**
     * Maps axios HTTP errors to appropriate error classes
     */
    protected mapAxiosError(error: AxiosError): BaseError {
        const status = error.response?.status;
        const message = this.extractErrorMessage(error);
        const data = error.response?.data;

        // Network/connection errors
        if (!status) {
            if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                return new NetworkError(
                    `Request timeout: ${message}`,
                    this.exchangeName
                );
            }
            return new ExchangeNotAvailable(
                `Exchange unreachable: ${message}`,
                this.exchangeName
            );
        }

        // Map by HTTP status code
        switch (status) {
            case 400:
                return this.mapBadRequestError(message, data);
            case 401:
                return new AuthenticationError(message, this.exchangeName);
            case 403:
                return new PermissionDenied(message, this.exchangeName);
            case 404:
                return this.mapNotFoundError(message, data);
            case 429:
                return this.mapRateLimitError(message, error.response);
            case 500:
            case 502:
            case 503:
            case 504:
                return new ExchangeNotAvailable(
                    `Exchange error (${status}): ${message}`,
                    this.exchangeName
                );
            default:
                return new BadRequest(
                    `HTTP ${status}: ${message}`,
                    this.exchangeName
                );
        }
    }

    /**
     * Maps 400 errors to specific bad request subtypes
     */
    protected mapBadRequestError(message: string, data: any): BadRequest {
        const lowerMessage = message.toLowerCase();

        // Detect insufficient funds
        if (
            lowerMessage.includes('insufficient') ||
            lowerMessage.includes('balance') ||
            lowerMessage.includes('not enough')
        ) {
            return new InsufficientFunds(message, this.exchangeName);
        }

        // Detect invalid order
        if (
            lowerMessage.includes('invalid order') ||
            lowerMessage.includes('tick size') ||
            lowerMessage.includes('price must be') ||
            lowerMessage.includes('size must be') ||
            lowerMessage.includes('amount must be')
        ) {
            return new InvalidOrder(message, this.exchangeName);
        }

        // Detect validation errors
        if (lowerMessage.includes('validation') || lowerMessage.includes('invalid parameter')) {
            return new ValidationError(message, undefined, this.exchangeName);
        }

        return new BadRequest(message, this.exchangeName);
    }

    /**
     * Maps 404 errors to specific not found subtypes
     */
    protected mapNotFoundError(message: string, data: any): NotFound {
        const lowerMessage = message.toLowerCase();

        // Detect order not found
        if (lowerMessage.includes('order')) {
            // Try to extract order ID from message
            const orderIdMatch = message.match(/order[:\s]+([a-zA-Z0-9-]+)/i);
            const orderId = orderIdMatch ? orderIdMatch[1] : 'unknown';
            return new OrderNotFound(orderId, this.exchangeName);
        }

        // Detect market not found
        if (lowerMessage.includes('market')) {
            // Try to extract market ID from message
            const marketIdMatch = message.match(/market[:\s]+([a-zA-Z0-9-]+)/i);
            const marketId = marketIdMatch ? marketIdMatch[1] : 'unknown';
            return new MarketNotFound(marketId, this.exchangeName);
        }

        return new NotFound(message, this.exchangeName);
    }

    /**
     * Maps rate limit errors
     */
    protected mapRateLimitError(message: string, response: any): RateLimitExceeded {
        // Try to extract retry-after from headers
        const retryAfter = response?.headers?.['retry-after'];
        const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;

        return new RateLimitExceeded(message, retryAfterSeconds, this.exchangeName);
    }

    /**
     * Extracts error message from various error formats
     */
    protected extractErrorMessage(error: any): string {
        // Axios error with response data
        if (axios.isAxiosError(error) && error.response?.data) {
            const data = error.response.data;

            // Try various common error message paths
            if (typeof data === 'string') {
                return data;
            }

            if (data.error) {
                if (typeof data.error === 'string') {
                    return data.error;
                }
                if (data.error.message) {
                    return data.error.message;
                }
            }

            if (data.message) {
                return data.message;
            }

            if (data.errorMsg) {
                return data.errorMsg;
            }

            // Fallback to stringified data
            return JSON.stringify(data);
        }

        // Standard Error object
        if (error instanceof Error) {
            return error.message;
        }

        // String error
        if (typeof error === 'string') {
            return error;
        }

        // Unknown error format
        return String(error);
    }
}
