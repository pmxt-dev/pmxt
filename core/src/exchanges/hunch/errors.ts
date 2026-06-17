import axios from 'axios';
import { ErrorMapper } from '../../utils/error-mapper';
import { BadRequest, InsufficientFunds, InvalidOrder, NotFound } from '../../errors';

/**
 * Maps Hunch agent-API error bodies to pmxt unified errors.
 *
 * Hunch follows an "errors-as-documentation" convention: every 4xx/5xx carries
 * `{ error, message, hint?, docsUrl?, retriable? }` where `error` is a STABLE
 * machine code (the AGENT_ERROR_CODES catalogue). We branch on that code first
 * (precise), then fall back to the base mapper's status-code routing.
 *
 * Catalogue (src/agent/errors.ts): invalid_wallet, invalid_request,
 * market_not_found, market_closed, market_resolved, invalid_side,
 * size_below_min, size_above_simple_tier, quote_required, quote_expired,
 * quote_mismatch, slippage_exceeded, insufficient_balance, payment_required,
 * payment_invalid, pool_impact_exceeded, trading_paused, rate_limited,
 * internal_error.
 */
export class HunchErrorMapper extends ErrorMapper {
    constructor() {
        super('Hunch');
    }

    override mapError(error: unknown): ReturnType<ErrorMapper['mapError']> {
        const code = this.extractCode(error);
        const message = this.extractErrorMessage(error);
        if (code) {
            switch (code) {
                case 'insufficient_balance':
                    return new InsufficientFunds(message, this.exchangeName);
                case 'invalid_side':
                case 'size_below_min':
                case 'size_above_simple_tier':
                case 'quote_required':
                case 'quote_expired':
                case 'quote_mismatch':
                case 'slippage_exceeded':
                case 'pool_impact_exceeded':
                    return new InvalidOrder(message, this.exchangeName);
                case 'market_not_found':
                    return new NotFound(`Market not found: ${message}`, this.exchangeName);
                // market_closed / market_resolved / trading_paused / payment_* /
                // invalid_wallet / invalid_request / rate_limited / internal_error
                // fall through to the status-code base mapping below.
                default:
                    break;
            }
        }
        return super.mapError(error);
    }

    protected override extractErrorMessage(error: unknown): string {
        if (axios.isAxiosError(error) && error.response?.data) {
            const data = error.response.data as Record<string, unknown>;
            if (typeof data.message === 'string') return data.message;
            if (typeof data.error === 'string') return data.error;
        }
        return super.extractErrorMessage(error);
    }

    protected override mapBadRequestError(message: string, data: unknown): BadRequest {
        const lower = message.toLowerCase();
        if (lower.includes('insufficient') || lower.includes('balance')) {
            return new InsufficientFunds(message, this.exchangeName);
        }
        if (lower.includes('side') || lower.includes('slippage') || lower.includes('quote')) {
            return new InvalidOrder(message, this.exchangeName);
        }
        return super.mapBadRequestError(message, data);
    }

    /** Pull Hunch's stable machine code out of the response body. */
    private extractCode(error: unknown): string | undefined {
        if (axios.isAxiosError(error) && error.response?.data) {
            const data = error.response.data as Record<string, unknown>;
            if (typeof data.error === 'string') return data.error;
        }
        if (error && typeof error === 'object') {
            const maybe = error as { body?: { error?: string }; code?: string };
            if (maybe.body && typeof maybe.body.error === 'string') return maybe.body.error;
            if (typeof maybe.code === 'string') return maybe.code;
        }
        return undefined;
    }
}

export const hunchErrorMapper = new HunchErrorMapper();
