import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { PolymarketExchange } from '../exchanges/polymarket';
import { KalshiExchange } from '../exchanges/kalshi';

// Singleton instances for local usage
const exchanges: Record<string, any> = {
    polymarket: null,
    kalshi: null
};

export async function startServer(port: number) {
    const app: Express = express();

    app.use(cors());
    app.use(express.json());

    // Health check
    app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: Date.now() });
    });

    // API endpoint: POST /api/:exchange/:method
    // Body: { args: any[] }
    app.post('/api/:exchange/:method', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const exchangeName = (req.params.exchange as string).toLowerCase();
            const methodName = req.params.method as string;
            const args = Array.isArray(req.body.args) ? req.body.args : [];

            // 1. Get or Initialize Exchange
            if (!exchanges[exchangeName]) {
                exchanges[exchangeName] = createExchange(exchangeName);
            }
            const exchange = exchanges[exchangeName];

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
        console.error('Error:', error);
        res.status(error.status || 500).json({
            success: false,
            error: {
                message: error.message || 'Internal server error',
                // stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            }
        });
    });

    return app.listen(port);
}

function createExchange(name: string) {
    switch (name) {
        case 'polymarket':
            return new PolymarketExchange({
                privateKey: process.env.POLYMARKET_PK || process.env.POLYMARKET_PRIVATE_KEY,
                apiKey: process.env.POLYMARKET_API_KEY,
                apiSecret: process.env.POLYMARKET_API_SECRET,
                passphrase: process.env.POLYMARKET_PASSPHRASE
            });
        case 'kalshi':
            return new KalshiExchange({
                apiKey: process.env.KALSHI_API_KEY,
                privateKey: process.env.KALSHI_PRIVATE_KEY
            });
        default:
            throw new Error(`Unknown exchange: ${name}`);
    }
}
