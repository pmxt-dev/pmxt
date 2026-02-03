import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { PolymarketExchange } from '../exchanges/polymarket';
import { LimitlessExchange } from '../exchanges/limitless';
import { KalshiExchange } from '../exchanges/kalshi';
import { ExchangeCredentials } from '../BaseExchange';
import { BaseError } from '../errors';

// Singleton instances for local usage (when no credentials provided)
const defaultExchanges: Record<string, any> = {
    polymarket: null,
    limitless: null,
    kalshi: null
};

export async function startServer(port: number, accessToken: string) {
    const app: Express = express();

    app.use(cors());
    app.use(express.json());

    // Health check (public)
    app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: Date.now() });
    });

    // Auth Middleware
    app.use((req: Request, res: Response, next: NextFunction) => {
        const token = req.headers['x-pmxt-access-token'];
        if (!token || token !== accessToken) {
            res.status(401).json({ success: false, error: 'Unauthorized: Invalid or missing access token' });
            return;
        }
        next();
    });

    // API endpoint: POST /api/:exchange/:method
    // Body: { args: any[], credentials?: ExchangeCredentials }
    app.post('/api/:exchange/:method', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const exchangeName = (req.params.exchange as string).toLowerCase();
            const methodName = req.params.method as string;
            const args = Array.isArray(req.body.args) ? req.body.args : [];
            const credentials = req.body.credentials as ExchangeCredentials | undefined;

            // 1. Get or Initialize Exchange
            // If credentials are provided, create a new instance for this request
            // Otherwise, use the singleton instance
            let exchange: any;
            if (credentials && (credentials.privateKey || credentials.apiKey)) {
                exchange = createExchange(exchangeName, credentials);
            } else {
                if (!defaultExchanges[exchangeName]) {
                    defaultExchanges[exchangeName] = createExchange(exchangeName);
                }
                exchange = defaultExchanges[exchangeName];
            }

            // 2. Validate Method
            if (typeof exchange[methodName] !== 'function') {
                res.status(404).json({ success: false, error: `Method '${methodName}' not found on ${exchangeName}` });
                return;
            }

            // 3. Execute with direct argument spreading
            const result = await exchange[methodName](...args);

            res.json({ success: true, data: result });
        } catch (error: any) {
            next(error);
        }
    });

    // Error handler
    app.use((error: any, req: Request, res: Response, next: NextFunction) => {
        console.error('API Error:', error);
        if (error.stack) {
            console.error(error.stack);
        }

        // Handle BaseError instances with full context
        if (error instanceof BaseError) {
            const errorResponse: any = {
                success: false,
                error: {
                    message: error.message,
                    code: error.code,
                    retryable: error.retryable
                }
            };

            // Add exchange context if available
            if (error.exchange) {
                errorResponse.error.exchange = error.exchange;
            }

            // Add retryAfter for rate limit errors
            if ('retryAfter' in error && error.retryAfter !== undefined) {
                errorResponse.error.retryAfter = error.retryAfter;
            }

            // Add stack trace in development
            if (process.env.NODE_ENV === 'development') {
                errorResponse.error.stack = error.stack;
            }

            res.status(error.status).json(errorResponse);
            return;
        }

        // Handle generic errors
        res.status(error.status || 500).json({
            success: false,
            error: {
                message: error.message || 'Internal server error',
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            }
        });
    });

    return app.listen(port, '127.0.0.1');
}

function createExchange(name: string, credentials?: ExchangeCredentials) {
    switch (name) {
        case 'polymarket':
            return new PolymarketExchange({
                privateKey: credentials?.privateKey || process.env.POLYMARKET_PK || process.env.POLYMARKET_PRIVATE_KEY,
                apiKey: credentials?.apiKey || process.env.POLYMARKET_API_KEY,
                apiSecret: credentials?.apiSecret || process.env.POLYMARKET_API_SECRET,
                passphrase: credentials?.passphrase || process.env.POLYMARKET_PASSPHRASE,
                funderAddress: credentials?.funderAddress,
                signatureType: credentials?.signatureType
            });
        case 'limitless':
            return new LimitlessExchange({
                privateKey: credentials?.privateKey || process.env.LIMITLESS_PK || process.env.LIMITLESS_PRIVATE_KEY,
                apiKey: credentials?.apiKey || process.env.LIMITLESS_API_KEY,
                apiSecret: credentials?.apiSecret || process.env.LIMITLESS_API_SECRET,
                passphrase: credentials?.passphrase || process.env.LIMITLESS_PASSPHRASE
            });
        case 'kalshi':
            return new KalshiExchange({
                apiKey: credentials?.apiKey || process.env.KALSHI_API_KEY,
                privateKey: credentials?.privateKey || process.env.KALSHI_PRIVATE_KEY
            });
        default:
            throw new Error(`Unknown exchange: ${name}`);
    }
}
