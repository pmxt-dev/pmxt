import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { createFeedRouter } from '../../src/server/feed-routes';

const originalEnv = {
    BINANCE_RELAY_WS_URL: process.env.BINANCE_RELAY_WS_URL,
    CHAINLINK_API_URL: process.env.CHAINLINK_API_URL,
    CHAINLINK_WS_URL: process.env.CHAINLINK_WS_URL,
};

function buildApp() {
    const app = express();
    app.use('/api/feeds', createFeedRouter());
    app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
        res.status(error.status || 500).json({
            success: false,
            error: {
                message: error.message,
                code: error.code,
                retryable: error.retryable,
                exchange: error.exchange,
            },
        });
    });
    return app;
}

function restoreEnv(name: keyof typeof originalEnv): void {
    const value = originalEnv[name];
    if (value === undefined) {
        delete process.env[name];
    } else {
        process.env[name] = value;
    }
}

describe('feed routes backend errors', () => {
    beforeEach(() => {
        delete process.env.BINANCE_RELAY_WS_URL;
        delete process.env.CHAINLINK_API_URL;
        delete process.env.CHAINLINK_WS_URL;
    });

    afterAll(() => {
        restoreEnv('BINANCE_RELAY_WS_URL');
        restoreEnv('CHAINLINK_API_URL');
        restoreEnv('CHAINLINK_WS_URL');
    });

    test('binance fetchTicker names missing BINANCE_RELAY_WS_URL', async () => {
        const res = await request(buildApp())
            .get('/api/feeds/binance/fetchTicker')
            .query({ symbol: 'BTC/USDT' });

        expect(res.status).toBe(503);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('EXCHANGE_NOT_AVAILABLE');
        expect(res.body.error.message).toContain('BINANCE_RELAY_WS_URL');
    });

    test('chainlink oracle route names missing CHAINLINK_API_URL', async () => {
        const res = await request(buildApp())
            .get('/api/feeds/chainlink/fetchOracleRound')
            .query({ feed: 'BTC/USD' });

        expect(res.status).toBe(503);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('EXCHANGE_NOT_AVAILABLE');
        expect(res.body.error.message).toContain('CHAINLINK_API_URL');
    });

    test('binance OHLCV returns a route-level capability error', async () => {
        const res = await request(buildApp())
            .get('/api/feeds/binance/fetchOHLCV')
            .query({ symbol: 'BTC/USDT', timeframe: '1m', limit: '2' });

        expect(res.status).toBe(501);
        expect(res.body).toEqual({
            success: false,
            error: "Feed 'binance' does not support fetchOHLCV",
        });
    });

    test('binance order book returns a route-level capability error', async () => {
        const res = await request(buildApp())
            .get('/api/feeds/binance/fetchOrderBook')
            .query({ symbol: 'BTC/USDT', limit: '5' });

        expect(res.status).toBe(501);
        expect(res.body).toEqual({
            success: false,
            error: "Feed 'binance' does not support fetchOrderBook",
        });
    });
});
