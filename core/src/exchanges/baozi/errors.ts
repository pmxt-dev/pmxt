import { ErrorMapper } from '../../utils/error-mapper';
import {
    BaseError,
    BadRequest,
    InvalidOrder,
    InsufficientFunds,
    NetworkError,
    ExchangeNotAvailable,
} from '../../errors';

// Anchor/Baozi program error codes
const PROGRAM_ERRORS: Record<number, { type: string; message: string }> = {
    6000: { type: 'bad_request', message: 'Unauthorized' },
    6001: { type: 'bad_request', message: 'Market not found' },
    6013: { type: 'bad_request', message: 'Betting is closed' },      // Changed from 6018
    6014: { type: 'bad_request', message: 'Betting is frozen' },      // Changed from 6040
    6015: { type: 'bad_request', message: 'Market is not open for betting' },
    6023: { type: 'invalid_order', message: 'Bet amount too small' }, // Changed from 6020
    6024: { type: 'invalid_order', message: 'Bet amount too large' }, // Changed from 6041
};

/**
 * Maps Solana/Anchor errors to pmxt unified error types.
 */
export class BaoziErrorMapper extends ErrorMapper {
    constructor() {
        super('Baozi');
    }

    mapError(error: unknown): BaseError {
        // Handle Solana transaction errors
        if (error instanceof Error) {
            const msg = error.message;

            // Solana insufficient funds
            if (msg.includes('Attempt to debit an account but found no record of a prior credit') ||
                msg.includes('insufficient lamports') ||
                msg.includes('insufficient funds')) {
                return new InsufficientFunds('Insufficient SOL balance', 'Baozi');
            }

            // Solana network errors
            if (msg.includes('failed to send transaction') ||
                msg.includes('Node is behind') ||
                msg.includes('Transaction simulation failed')) {
                // Try to extract Anchor error code
                const anchorError = this.extractAnchorError(msg);
                if (anchorError) {
                    return anchorError;
                }
                return new NetworkError(`Solana RPC error: ${msg}`, 'Baozi');
            }

            // Connection errors
            if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('fetch failed')) {
                return new ExchangeNotAvailable('Solana RPC unreachable', 'Baozi');
            }
        }

        return super.mapError(error);
    }

    private extractAnchorError(message: string): BaseError | null {
        // Anchor errors appear as "custom program error: 0x{hex}"
        const match = message.match(/custom program error: 0x([0-9a-fA-F]+)/);
        if (!match) return null;

        const code = parseInt(match[1], 16);
        const knownError = PROGRAM_ERRORS[code];

        if (!knownError) {
            return new BadRequest(`Baozi program error ${code}: ${message}`, 'Baozi');
        }

        switch (knownError.type) {
            case 'invalid_order':
                return new InvalidOrder(knownError.message, 'Baozi');
            default:
                return new BadRequest(knownError.message, 'Baozi');
        }
    }
}

export const baoziErrorMapper = new BaoziErrorMapper();
