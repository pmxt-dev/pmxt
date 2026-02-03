import axios, { AxiosError } from 'axios';
import { ErrorMapper } from '../../utils/error-mapper';
import {
    AuthenticationError,
    InvalidOrder,
    BadRequest,
} from '../../errors';

/**
 * Polymarket-specific error mapper
 *
 * Handles CLOB-specific error patterns and message formats.
 */
export class PolymarketErrorMapper extends ErrorMapper {
    constructor() {
        super('Polymarket');
    }

    /**
     * Override to handle Polymarket-specific error patterns
     */
    protected extractErrorMessage(error: any): string {
        // Handle Polymarket CLOB errors
        if (axios.isAxiosError(error) && error.response?.data) {
            const data = error.response.data;

            // Polymarket uses errorMsg field
            if (data.errorMsg) {
                return data.errorMsg;
            }

            // Also check standard error paths
            if (data.error?.message) {
                return data.error.message;
            }

            if (data.message) {
                return data.message;
            }
        }

        return super.extractErrorMessage(error);
    }

    /**
     * Override to detect Polymarket-specific error patterns
     */
    protected mapBadRequestError(message: string, data: any): BadRequest {
        const lowerMessage = message.toLowerCase();

        // Polymarket-specific authentication errors (400 status)
        if (
            lowerMessage.includes('api key') ||
            lowerMessage.includes('proxy') ||
            lowerMessage.includes('signature type')
        ) {
            return new AuthenticationError(message, this.exchangeName);
        }

        // Polymarket-specific order validation
        if (lowerMessage.includes('tick size')) {
            return new InvalidOrder(message, this.exchangeName);
        }

        // Fall back to base error mapping
        return super.mapBadRequestError(message, data);
    }
}

// Export singleton instance for convenience
export const polymarketErrorMapper = new PolymarketErrorMapper();
