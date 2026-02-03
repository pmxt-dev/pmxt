import axios from 'axios';
import { ErrorMapper } from '../../utils/error-mapper';
import {
    AuthenticationError,
    InvalidOrder,
    BadRequest,
} from '../../errors';

/**
 * Limitless-specific error mapper
 *
 * Handles CLOB-specific error patterns (similar to Polymarket).
 */
export class LimitlessErrorMapper extends ErrorMapper {
    constructor() {
        super('Limitless');
    }

    /**
     * Override to handle Limitless-specific error patterns
     */
    protected extractErrorMessage(error: any): string {
        // Handle Limitless CLOB errors (similar to Polymarket)
        if (axios.isAxiosError(error) && error.response?.data) {
            const data = error.response.data;

            // Limitless uses errorMsg field (CLOB client)
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
     * Override to detect Limitless-specific error patterns
     */
    protected mapBadRequestError(message: string, data: any): BadRequest {
        const lowerMessage = message.toLowerCase();

        // Limitless-specific authentication errors (400 status)
        if (
            lowerMessage.includes('api key') ||
            lowerMessage.includes('proxy') ||
            lowerMessage.includes('signature type')
        ) {
            return new AuthenticationError(message, this.exchangeName);
        }

        // Limitless-specific order validation
        if (lowerMessage.includes('tick size')) {
            return new InvalidOrder(message, this.exchangeName);
        }

        // Fall back to base error mapping
        return super.mapBadRequestError(message, data);
    }
}

// Export singleton instance for convenience
export const limitlessErrorMapper = new LimitlessErrorMapper();
