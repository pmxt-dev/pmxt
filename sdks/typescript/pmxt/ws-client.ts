/**
 * WebSocket client for streaming methods.
 *
 * Provides a multiplexed WebSocket connection to the sidecar server,
 * used by watchOrderBook and watchOrderBooks as an alternative to
 * HTTP long-polling. Falls back to HTTP transparently when the sidecar
 * does not support the /ws endpoint.
 */

import { PmxtError } from "./errors.js";
import { logger } from "./logger.js";

const MAX_QUEUED_MESSAGES_PER_SUBSCRIPTION = 100_000;

interface WsSubscription {
    readonly requestId: string;
    readonly method: string;
    readonly symbols: string[];
    resolve: ((data: any) => void) | null;
    reject: ((error: Error) => void) | null;
}

interface WsMessage {
    id?: string;
    event?: string;
    method?: string;
    symbol?: string;
    data?: any;
    error?: { message?: string; code?: string };
}

/**
 * Multiplexed WebSocket client for the pmxt sidecar.
 *
 * Lazily connects to ws://{host}/ws?token={accessToken}. A single
 * WebSocket connection is shared across all streaming subscriptions.
 */
export class SidecarWsClient {
    private ws: WebSocket | null = null;
    private host: string;
    private accessToken: string | undefined;
    private authParamName: string;
    private closed = false;

    /** requestId -> queued data payloads for single-event watch methods */
    private dataQueues: Map<string, any[]> = new Map();
    /** requestId[:symbol] -> latest data payload for batch snapshots */
    private dataStore: Map<string, any> = new Map();
    /** requestId -> subscription metadata */
    private subscriptions: Map<string, WsSubscription> = new Map();
    /** (method:symbolKey) -> requestId -- avoids duplicate subscribes */
    private activeSubs: Map<string, string> = new Map();

    private connectPromise: Promise<void> | null = null;

    constructor(host: string, accessToken?: string, authParamName: string = "token") {
        this.host = host;
        this.accessToken = accessToken;
        this.authParamName = authParamName;
    }

    // ------------------------------------------------------------------
    // Connection lifecycle
    // ------------------------------------------------------------------

    private async ensureConnected(): Promise<void> {
        if (this.ws && !this.closed) return;
        if (this.connectPromise) return this.connectPromise;

        this.connectPromise = this.connect();
        try {
            await this.connectPromise;
        } finally {
            this.connectPromise = null;
        }
    }

    private connect(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let hostPart = this.host;
            let scheme = "ws";
            if (hostPart.startsWith("https://")) {
                hostPart = hostPart.slice("https://".length);
                scheme = "wss";
            } else if (hostPart.startsWith("http://")) {
                hostPart = hostPart.slice("http://".length);
            }

            let url = `${scheme}://${hostPart}/ws`;
            if (this.accessToken) {
                url = `${url}?${this.authParamName}=${this.accessToken}`;
            }

            // Use the ws package in Node.js, native WebSocket in browsers
            const WsConstructor = this.getWebSocketConstructor();
            if (!WsConstructor) {
                reject(new PmxtError("No WebSocket implementation available"));
                return;
            }

            const ws = new WsConstructor(url);
            this.closed = false;

            ws.onopen = () => {
                this.ws = ws;
                resolve();
            };

            ws.onerror = (err: any) => {
                if (!this.ws) {
                    // Connection failed during handshake
                    reject(new PmxtError(`WebSocket connection failed: ${err.message || err}`));
                } else {
                    // Post-handshake error — propagate to all pending subscribers
                    const error = new PmxtError(`WebSocket error: ${err.message || err}`);
                    for (const sub of this.subscriptions.values()) {
                        if (sub.reject) {
                            sub.reject(error);
                            sub.reject = null;
                            sub.resolve = null;
                        }
                    }
                    this.closed = true;
                    this.ws = null;
                }
            };

            ws.onclose = () => {
                this.closed = true;
                this.ws = null;
            };

            ws.onmessage = (event: any) => {
                const raw = typeof event.data === "string"
                    ? event.data
                    : event.data.toString();
                let msg: WsMessage;
                try {
                    msg = JSON.parse(raw);
                } catch {
                    // Non-JSON control frame -- ignore.
                    return;
                }
                try {
                    this.dispatch(msg);
                } catch (err) {
                    // Dispatch bug -- log and continue; don't kill the connection.
                    logger.error('[SidecarWsClient] dispatch error:', { err });
                }
            };
        });
    }

    private getWebSocketConstructor(): (new (url: string) => WebSocket) | null {
        // Browser / Deno / Bun
        if (typeof globalThis !== "undefined" && (globalThis as any).WebSocket) {
            return (globalThis as any).WebSocket;
        }
        // Node.js -- require ws
        try {
            // Dynamic require to avoid bundler issues
            const wsModule = require("ws");
            return wsModule.default || wsModule;
        } catch {
            throw new PmxtError(
                "WebSocket support in Node.js requires the 'ws' package. " +
                "Install it with: npm install ws"
            );
        }
    }

    private dispatch(msg: WsMessage): void {
        const eventType = msg.event;
        const requestId = msg.id;

        if (eventType === "error" && requestId) {
            const sub = this.subscriptions.get(requestId);
            if (sub?.reject) {
                sub.reject(new PmxtError(
                    msg.error?.message || "WebSocket subscription error"
                ));
                sub.reject = null;
                sub.resolve = null;
            }
            return;
        }

        if (eventType === "subscribed") {
            // Acknowledgement -- nothing to do
            return;
        }

        if (eventType === "data" && requestId) {
            const symbol = msg.symbol || "";
            const data = msg.data || {};

            // Store by (requestId:symbol) for batch methods.
            this.dataStore.set(`${requestId}:${symbol}`, data);
            this.deliverOrQueue(requestId, data);
        }
    }

    private deliverOrQueue(requestId: string, data: any): void {
        const sub = this.subscriptions.get(requestId);
        if (sub?.resolve) {
            sub.resolve(data);
            sub.resolve = null;
            sub.reject = null;
            return;
        }

        let queue = this.dataQueues.get(requestId);
        if (!queue) {
            queue = [];
            this.dataQueues.set(requestId, queue);
        }
        queue.push(data);

        if (queue.length > MAX_QUEUED_MESSAGES_PER_SUBSCRIPTION) {
            queue.splice(0, queue.length - MAX_QUEUED_MESSAGES_PER_SUBSCRIPTION);
        }
    }

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    async subscribe(
        exchange: string,
        method: string,
        args: any[],
        credentials?: Record<string, any>,
        timeoutMs = 30000,
    ): Promise<any> {
        const firstArg = args[0] ?? "";
        const subKey = Array.isArray(firstArg)
            ? `${method}:${[...firstArg].sort().join(",")}`
            : `${method}:${firstArg}`;

        // Reuse existing subscription
        const existingId = this.activeSubs.get(subKey);
        if (existingId && this.subscriptions.has(existingId)) {
            return this.waitForData(existingId, timeoutMs);
        }

        await this.ensureConnected();

        const requestId = `req-${Math.random().toString(36).slice(2, 14)}`;
        const symbols = Array.isArray(firstArg) ? firstArg : firstArg ? [firstArg] : [];

        const sub: WsSubscription = {
            requestId,
            method,
            symbols,
            resolve: null,
            reject: null,
        };
        this.subscriptions.set(requestId, sub);
        this.activeSubs.set(subKey, requestId);

        const message: Record<string, any> = {
            id: requestId,
            action: "subscribe",
            exchange,
            method,
            args,
        };
        if (credentials) {
            message.credentials = credentials;
        }

        if (!this.ws) {
            throw new PmxtError('[ws-client] Cannot send: WebSocket not connected');
        }
        this.ws.send(JSON.stringify(message));

        return this.waitForData(requestId, timeoutMs);
    }

    async subscribeBatch(
        exchange: string,
        method: string,
        args: any[],
        credentials?: Record<string, any>,
        timeoutMs = 30000,
    ): Promise<Record<string, any>> {
        const symbols: string[] = Array.isArray(args[0]) ? args[0] : [];

        await this.ensureConnected();

        const requestId = `req-${Math.random().toString(36).slice(2, 14)}`;

        const sub: WsSubscription = {
            requestId,
            method,
            symbols,
            resolve: null,
            reject: null,
        };
        this.subscriptions.set(requestId, sub);

        const message: Record<string, any> = {
            id: requestId,
            action: "subscribe",
            exchange,
            method,
            args,
        };
        if (credentials) {
            message.credentials = credentials;
        }

        if (!this.ws) {
            throw new PmxtError('[ws-client] Cannot send: WebSocket not connected');
        }
        this.ws.send(JSON.stringify(message));

        // Wait for first data event.
        const firstData = await this.waitForData(requestId, timeoutMs);

        // Collect per-symbol data
        const result: Record<string, any> = {};
        for (const symbol of symbols) {
            const storeKey = `${requestId}:${symbol}`;
            const data = this.dataStore.get(storeKey);
            if (data !== undefined) {
                result[symbol] = data;
            }
        }

        // If no per-symbol data, return the single data event as-is
        if (Object.keys(result).length === 0) {
            if (firstData && typeof firstData === "object") {
                return firstData;
            }
        }

        return result;
    }

    close(): void {
        this.closed = true;
        if (this.ws) {
            try {
                this.ws.close();
            } catch {
                // ignore
            }
            this.ws = null;
        }
        this.dataQueues.clear();
        this.dataStore.clear();
    }

    get connected(): boolean {
        return this.ws !== null && !this.closed;
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------

    private waitForData(requestId: string, timeoutMs: number): Promise<any> {
        // Check if queued data is already available.
        const queue = this.dataQueues.get(requestId);
        if (queue && queue.length > 0) {
            const next = queue.shift();
            if (queue.length === 0) {
                this.dataQueues.delete(requestId);
            }
            return Promise.resolve(next);
        }

        return new Promise<any>((resolve, reject) => {
            const sub = this.subscriptions.get(requestId);
            if (!sub) {
                reject(new PmxtError("Subscription not found"));
                return;
            }

            const timer = setTimeout(() => {
                sub.resolve = null;
                sub.reject = null;
                reject(new PmxtError(
                    `Timeout waiting for WebSocket data (method=${sub.method})`
                ));
            }, timeoutMs);

            sub.resolve = (data: any) => {
                clearTimeout(timer);
                resolve(data);
            };
            sub.reject = (err: Error) => {
                clearTimeout(timer);
                reject(err);
            };
        });
    }
}
