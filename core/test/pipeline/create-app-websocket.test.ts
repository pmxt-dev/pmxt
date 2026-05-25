import http from 'http';
import WebSocket from 'ws';
import type { AddressInfo } from 'net';
import {
    attachWebSocketEndpoint,
    createApp,
} from '../../src/server/app';
import type { WebSocketEndpoint } from '../../src/server/app';

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

describe('createApp WebSocket endpoint attachment', () => {
    let server: http.Server | undefined;
    let endpoint: WebSocketEndpoint | undefined;
    let client: WebSocket | undefined;

    afterEach(async () => {
        if (client && client.readyState !== WebSocket.CLOSED) {
            client.terminate();
        }
        if (endpoint) {
            await closeWebSocketEndpoint(endpoint);
        }
        if (server) {
            await closeServer(server);
        }
        client = undefined;
        endpoint = undefined;
        server = undefined;
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
});
