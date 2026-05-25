import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import type { AddressInfo } from 'net';
import {
    attachWebSocketEndpoint,
    createApp,
} from '../../src/server/app';
import type { WebSocketEndpoint } from '../../src/server/app';
import { getFeed } from '../../src/server/feed-factory';

function waitForListening(server: http.Server): Promise<void> {
    if (server.listening) return Promise.resolve();
    return new Promise((resolve) => server.once('listening', () => resolve()));
}

function waitForOpen(ws: WebSocket): Promise<void> {
    return new Promise((resolve, reject) => {
        ws.once('open', () => resolve());
        ws.once('error', reject);
        ws.once('unexpected-response', (_req, res) => {
            reject(new Error(`Unexpected server response: ${res.statusCode}`));
        });
    });
}

function waitForJsonMessage(ws: WebSocket): Promise<any> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Timed out waiting for WebSocket message'));
        }, 1000);

        ws.once('message', (data) => {
            clearTimeout(timeout);
            try {
                resolve(JSON.parse(data.toString()));
            } catch (error) {
                reject(error);
            }
        });
        ws.once('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });
    });
}

function closeServer(server: http.Server): Promise<void> {
    if (!server.listening) return Promise.resolve();
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

function closeWebSocketEndpoint(endpoint: WebSocketEndpoint): Promise<void> {
    for (const client of endpoint.wss.clients) {
        client.terminate();
    }
    return new Promise((resolve, reject) => {
        endpoint.wss.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

function closeWebSocketServer(server: WebSocketServer): Promise<void> {
    for (const client of server.clients) {
        client.terminate();
    }
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

function waitForWebSocketServerListening(server: WebSocketServer): Promise<void> {
    return new Promise((resolve) => server.once('listening', () => resolve()));
}

describe('createApp WebSocket endpoint attachment', () => {
    let server: http.Server | undefined;
    let endpoint: WebSocketEndpoint | undefined;
    let client: WebSocket | undefined;
    let relayServer: WebSocketServer | undefined;
    let previousBinanceRelayWsUrl: string | undefined;
    let binanceFeedTouched = false;

    afterEach(async () => {
        if (client && client.readyState !== WebSocket.CLOSED) {
            client.terminate();
        }
        if (binanceFeedTouched) {
            await getFeed('binance').close?.();
        }
        if (relayServer) {
            await closeWebSocketServer(relayServer);
        }
        if (endpoint) {
            await closeWebSocketEndpoint(endpoint);
        }
        if (server) {
            await closeServer(server);
        }
        if (previousBinanceRelayWsUrl === undefined) {
            delete process.env.BINANCE_RELAY_WS_URL;
        } else {
            process.env.BINANCE_RELAY_WS_URL = previousBinanceRelayWsUrl;
        }
        client = undefined;
        endpoint = undefined;
        server = undefined;
        relayServer = undefined;
        previousBinanceRelayWsUrl = undefined;
        binanceFeedTouched = false;
    });

    it('exposes /ws for a local server returned by createApp().listen()', async () => {
        const app = createApp({ accessToken: undefined });
        server = app.listen(0, '127.0.0.1');
        endpoint = attachWebSocketEndpoint(server);
        await waitForListening(server);

        const { port } = server.address() as AddressInfo;
        client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        await waitForOpen(client);

        client.send('not-json');
        await expect(waitForJsonMessage(client)).resolves.toMatchObject({
            event: 'error',
            error: { message: 'Invalid JSON' },
        });
    });

    it('uses the configured access token for /ws upgrades', async () => {
        const accessToken = 'local-test-token';
        const app = createApp({ accessToken });
        server = app.listen(0, '127.0.0.1');
        endpoint = attachWebSocketEndpoint(server, { accessToken });
        await waitForListening(server);

        const { port } = server.address() as AddressInfo;
        const unauthenticated = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        await expect(waitForOpen(unauthenticated)).rejects.toThrow(
            'Unexpected server response: 401',
        );
        unauthenticated.terminate();

        client = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${accessToken}`);
        await waitForOpen(client);
    });

    it('accepts documented feed watchTicker subscriptions over /ws', async () => {
        previousBinanceRelayWsUrl = process.env.BINANCE_RELAY_WS_URL;
        relayServer = new WebSocketServer({ host: '127.0.0.1', port: 0 });
        await waitForWebSocketServerListening(relayServer);

        let relayClient: WebSocket | undefined;
        relayServer.on('connection', (ws) => {
            relayClient = ws;
        });

        const relayAddress = relayServer.address() as AddressInfo;
        process.env.BINANCE_RELAY_WS_URL = `ws://127.0.0.1:${relayAddress.port}`;

        const app = createApp({ accessToken: undefined });
        server = app.listen(0, '127.0.0.1');
        endpoint = attachWebSocketEndpoint(server);
        await waitForListening(server);

        const { port } = server.address() as AddressInfo;
        client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        await waitForOpen(client);

        binanceFeedTouched = true;
        client.send(JSON.stringify({
            id: 'btc-stream',
            action: 'subscribe',
            method: 'watchTicker',
            args: ['BTC/USDT'],
            feed: 'binance',
        }));

        await expect(waitForJsonMessage(client)).resolves.toMatchObject({
            event: 'subscribed',
            id: 'btc-stream',
        });

        expect(relayClient?.readyState).toBe(WebSocket.OPEN);
        relayClient?.send(JSON.stringify({
            op: 'event',
            source: 'binance',
            symbol: 'BTCUSDT',
            trade_id: 1,
            price: '101.25',
            quantity: '0.5',
            event_time_ms: 1716148800000,
            trade_time_ms: 1716148800000,
            is_buyer_maker: false,
            timestamp_received_ms: 1716148800001,
        }));

        await expect(waitForJsonMessage(client)).resolves.toMatchObject({
            event: 'data',
            id: 'btc-stream',
            method: 'watchTicker',
            symbol: 'BTC/USDT',
            source: 'binance',
            data: {
                symbol: 'BTC/USDT',
                last: 101.25,
            },
        });
    });
});
