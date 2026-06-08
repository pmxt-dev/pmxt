import axios from 'axios';
import { ErrorMapper } from '../../utils/error-mapper';
import {
    AuthenticationError,
    ExchangeNotAvailable,
    NetworkError,
    RateLimitExceeded,
} from '../../errors';

/**
 * Maps SuiBets API errors to PMXT unified error classes.
 *
 * SuiBets is a read-only public API, so error mapping focuses on
 * network errors and rate limits. Error responses are expected in the form:
 *   { error: string }
 * or:
 *   { message: string }
 */
export class SuibetsErrorMapper extends ErrorMapper {
    constructor() {
        super('SuiBets');
    }

    protected extractErrorMessage(error: unknown): string {
        if (axios.isAxiosError(error) && error.response?.data) {
            const data = error.response.data;
            if (typeof data === 'string') {
                return `[${error.response.status}] ${data}`;
            }
            if (typeof data === 'object' && data !== null) {
                const obj = data as Record<string, unknown>;
                if (typeof obj.error === 'string') {
                    return `[${error.response.status}] ${obj.error}`;
                }
                if (typeof obj.message === 'string') {
                    return `[${error.response.status}] ${obj.message}`;
                }
            }
        }
        return super.extractErrorMessage(error);
    }

    mapError(error: unknown): ReturnType<ErrorMapper['mapError']> {
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;

            // HTML body = hosting/gateway outage — not a missing resource.
            // Return ExchangeNotAvailable so callers can distinguish
            // "offer not found" from "upstream server is down".
            const responseData = error.response?.data;
            const isHtml =
                typeof responseData === 'string' &&
                responseData.trimStart().startsWith('<');
            if (isHtml) {
                return new ExchangeNotAvailable(
                    'SuiBets API is unavailable. Check https://www.suibets.com for service status.',
                    this.exchangeName,
                );
            }

            if (status === 429) {
                const retryAfter = error.response?.headers?.['retry-after'];
                const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
                return new RateLimitExceeded(
                    this.extractErrorMessage(error),
                    retryAfterSeconds,
                    this.exchangeName,
                );
            }

            if (status === 401 || status === 403) {
                return new AuthenticationError(this.extractErrorMessage(error), this.exchangeName);
            }

            if (status !== undefined && status >= 500) {
                return new ExchangeNotAvailable(
                    `Exchange error (${status}): ${this.extractErrorMessage(error)}`,
                    this.exchangeName,
                );
            }

            if (!status) {
                return new NetworkError(
                    `Network error: ${this.extractErrorMessage(error)}`,
                    this.exchangeName,
                );
            }
        }

        if (error instanceof Error && !axios.isAxiosError(error)) {
            const nodeErr = error as Error & { code?: string };
            if (
                nodeErr.code === 'ECONNREFUSED' ||
                nodeErr.code === 'ENOTFOUND' ||
                nodeErr.code === 'ETIMEDOUT'
            ) {
                return new NetworkError(`Network error: ${error.message}`, this.exchangeName);
            }
        }

        return super.mapError(error);
    }
}

export const suibetsErrorMapper = new SuibetsErrorMapper();
