import axios, { AxiosError } from 'axios';
import { ErrorMapper } from '../../utils/error-mapper';
import {
    InsufficientFunds,
    BadRequest,
} from '../../errors';

/**
 * Kalshi-specific error mapper
 *
 * Handles Kalshi API error patterns and message formats.
 */
export class KalshiErrorMapper extends ErrorMapper {
    constructor() {
        super('Kalshi');
    }

    /**
     * Override to handle Kalshi-specific error patterns
     */
    protected extractErrorMessage(error: any): string {
        // Handle Kalshi API errors
        if (axios.isAxiosError(error) && error.response?.data) {
            const data = error.response.data;

            // Kalshi uses nested error.message structure
            if (data.error?.message) {
                const status = error.response.status;
                return `[${status}] ${data.error.message}`;
            }

            if (data.message) {
                return data.message;
            }

            if (data.error && typeof data.error === 'string') {
                return data.error;
            }
        }

        return super.extractErrorMessage(error);
    }

    /**
     * Override to detect Kalshi-specific error patterns
     */
    protected mapBadRequestError(message: string, data: any): BadRequest {
        const lowerMessage = message.toLowerCase();

        // Kalshi-specific insufficient funds detection
        if (lowerMessage.includes('balance')) {
            return new InsufficientFunds(message, this.exchangeName);
        }

        // Fall back to base error mapping
        return super.mapBadRequestError(message, data);
    }
}

// Export singleton instance for convenience
export const kalshiErrorMapper = new KalshiErrorMapper();
