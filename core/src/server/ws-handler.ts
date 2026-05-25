import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Server as HttpServer } from "http";
import { ExchangeCredentials } from "../BaseExchange";
import { IDataFeed } from "../feeds/interfaces";
import { BaseError } from "../errors";
import { createExchange } from "./exchange-factory";
import { getFeed } from "./feed-factory";
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubscribeMessage {
  id: string;
  action: "subscribe";
  targetKind: "exchange";
  exchange: string;
  method: string;
  args: unknown[];
  credentials?: ExchangeCredentials;
}

interface UnsubscribeMessage {
  id: string;
  action: "unsubscribe";
  targetKind: "exchange";
  exchange: string;
  method: string;
  args: unknown[];
}

interface FeedSubscribeMessage {
  id: string;
  action: "subscribe";
  targetKind: "feed";
  feed: string;
  method: string;
  args: unknown[];
}

interface FeedUnsubscribeMessage {
  id: string;
  action: "unsubscribe";
  targetKind: "feed";
  feed: string;
  method: string;
  args: unknown[];
}

type ClientMessage =
  | SubscribeMessage
  | UnsubscribeMessage
  | FeedSubscribeMessage
  | FeedUnsubscribeMessage;

interface DataEvent {
  id: string;
  event: "data";
  method: string;
  symbol: string;
  source?: string;
  data: unknown;
}

interface ErrorEvent {
  event: "error";
  id?: string;
  error: { message: string; code?: string };
}

interface SubscribedEvent {
  event: "subscribed";
  id: string;
}

type ServerEvent = DataEvent | ErrorEvent | SubscribedEvent;

/** Tracks an active streaming subscription so it can be cancelled. */
interface ActiveSubscription {
  id: string;
  abortController: AbortController;
}

/** Per-client state. */
interface ClientState {
  subscriptions: Map<string, ActiveSubscription>;
  exchanges: Map<string, unknown>;
  authenticated: boolean;
}

export interface CreateWebSocketHandlerOptions {
  /** Access token for authentication (same as x-pmxt-access-token). */
  accessToken?: string;
}

// ---------------------------------------------------------------------------
// Streaming methods
// ---------------------------------------------------------------------------

/** Set of method names that produce streaming data. */
const WATCH_METHODS = new Set([
  "watchOrderBook",
  "watchOrderBooks",
  "watchTrades",
]);

/** Data-feed methods that produce streaming data. */
const FEED_WATCH_METHODS = new Set([
  "watchTicker",
]);

/** Methods for unsubscribing. */
const UNWATCH_METHODS: Record<string, string> = {
  unwatchOrderBook: "watchOrderBook",
};

function send(ws: WebSocket, msg: ServerEvent): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function sendError(ws: WebSocket, id: string | undefined, message: string, code?: string): void {
  send(ws, { event: "error", id, error: { message, code } });
}

/**
 * Build a unique key for a subscription so we can cancel it.
 */
function subscriptionKey(msg: ClientMessage): string {
  const target =
    msg.targetKind === "feed"
      ? `feed:${msg.feed}`
      : `exchange:${msg.exchange}`;
  return `${target}:${msg.method}:${JSON.stringify(msg.args)}`;
}

/**
 * Start a streaming loop for a single-ticker watch method
 * (watchOrderBook, watchTrades).
 *
 * The exchange layer owns connection lifecycle — watchOrderBook() blocks until
 * data arrives, transparently handling reconnection. This loop is a simple
 * consumer that only terminates on abort or fatal errors.
 */
async function streamSingle(
  exchange: any,
  method: string,
  args: unknown[],
  id: string,
  ws: WebSocket,
  signal: AbortSignal,
): Promise<void> {
  const symbol = typeof args[0] === "string" ? args[0] : String(args[0]);

  // Send subscribed acknowledgement
  send(ws, { event: "subscribed", id });

  while (!signal.aborted && ws.readyState === WebSocket.OPEN) {
    try {
      const result = await exchange[method](...args);
      if (signal.aborted) break;
      send(ws, { id, event: "data", method, symbol, data: result });
    } catch (err: unknown) {
      if (signal.aborted) break;
      const message =
        err instanceof BaseError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unknown streaming error";
      const code =
        err instanceof BaseError ? err.code : undefined;
      sendError(ws, id, message, code);
      // Fatal error from exchange (terminated, auth failure, etc.) — stop streaming.
      // The exchange layer handles transient reconnection internally and should
      // never throw for recoverable connection drops.
      break;
    }
  }
}

/**
 * Start a streaming loop for the batch watchOrderBooks method.
 * Each update is sent as an individual data message per symbol.
 *
 * Same lifecycle contract as streamSingle — the exchange owns reconnection.
 */
async function streamBatch(
  exchange: any,
  method: string,
  args: unknown[],
  id: string,
  ws: WebSocket,
  signal: AbortSignal,
): Promise<void> {
  const ids = Array.isArray(args[0]) ? (args[0] as string[]) : [];

  send(ws, { event: "subscribed", id });

  while (!signal.aborted && ws.readyState === WebSocket.OPEN) {
    try {
      const result: Record<string, unknown> = await exchange[method](...args);
      if (signal.aborted) break;
      for (const [symbol, data] of Object.entries(result)) {
        send(ws, { id, event: "data", method, symbol, data });
      }
    } catch (err: unknown) {
      if (signal.aborted) break;
      const message =
        err instanceof BaseError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unknown streaming error";
      const code =
        err instanceof BaseError ? err.code : undefined;
      sendError(ws, id, message, code);
      // Fatal error — stop streaming. Exchange handles transient reconnection.
      break;
    }
  }
}

/**
 * Start a streaming loop for feed watch methods.
 *
 * Data feeds expose callback-driven watch methods rather than the exchange
 * layer's await-next-update methods, so lifecycle is tied to the returned
 * unsubscribe callback and the client's AbortSignal.
 */
async function streamFeedSingle(
  feed: IDataFeed,
  feedName: string,
  method: string,
  args: unknown[],
  id: string,
  ws: WebSocket,
  signal: AbortSignal,
): Promise<void> {
  const symbol = typeof args[0] === "string" ? args[0] : String(args[0] ?? "");
  let unsubscribe: (() => void) | undefined;
  let settled = false;
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const cleanup = (): void => {
    if (settled) return;
    settled = true;
    signal.removeEventListener("abort", cleanup);
    ws.removeListener("close", cleanup);
    if (unsubscribe) {
      try {
        unsubscribe();
      } catch (err: unknown) {
        logger.warn('ws-handler: feed unsubscribe failed', {
          feed: feedName,
          method,
          id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    resolveDone();
  };

  signal.addEventListener("abort", cleanup, { once: true });
  ws.once("close", cleanup);

  try {
    if (typeof feed.connect === "function") {
      await feed.connect();
    }
    if (signal.aborted || ws.readyState !== WebSocket.OPEN) {
      cleanup();
      return;
    }

    if (method !== "watchTicker" || typeof feed.watchTicker !== "function") {
      sendError(ws, id, `Method '${method}' not found on ${feedName}`);
      cleanup();
      return;
    }

    unsubscribe = feed.watchTicker(symbol, (data) => {
      if (!signal.aborted && ws.readyState === WebSocket.OPEN) {
        send(ws, { id, event: "data", method, symbol, source: feedName, data });
      }
    });
    send(ws, { event: "subscribed", id });
    await done;
  } catch (err: unknown) {
    if (!signal.aborted) {
      const message =
        err instanceof BaseError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unknown streaming error";
      const code = err instanceof BaseError ? err.code : undefined;
      sendError(ws, id, message, code);
    }
    cleanup();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a WebSocket handler that can be attached to an HTTP server.
 *
 * Usage:
 * ```ts
 * const server = app.listen(port);
 * const wss = createWebSocketHandler({ accessToken });
 * wss.attach(server);
 * ```
 */
export function createWebSocketHandler(
  options: CreateWebSocketHandlerOptions = {},
): { wss: WebSocketServer; attach: (server: HttpServer) => void } {
  const { accessToken } = options;

  const wss = new WebSocketServer({ noServer: true });

  function attach(server: HttpServer): void {
    server.on("upgrade", (request: IncomingMessage, socket, head) => {
      const url = new URL(request.url || "/", `http://${request.headers.host}`);

      // Only handle upgrades to /ws
      if (url.pathname !== "/ws") {
        socket.destroy();
        return;
      }

      // Validate access token from query parameter if configured
      if (accessToken) {
        const token =
          url.searchParams.get("token") ||
          request.headers["x-pmxt-access-token"];
        if (!token || token !== accessToken) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    });
  }

  wss.on("connection", (ws: WebSocket) => {
    const state: ClientState = {
      subscriptions: new Map(),
      exchanges: new Map(),
      authenticated: !accessToken, // pre-authed if no token required
    };

    ws.on("message", (raw: Buffer | string) => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8"));
      } catch {
        sendError(ws, undefined, "Invalid JSON");
        return;
      }

      const id = parsed.id as string | undefined;
      const action = parsed.action as string | undefined;
      const exchange = parsed.exchange as string | undefined;
      const feed = parsed.feed as string | undefined;

      const method = parsed.method as string | undefined;

      if (!id || !action) {
        sendError(ws, id, "Missing required fields: id, action");
        return;
      }

      if (action === "unsubscribe" && !method && !exchange && !feed) {
        handleUnsubscribeById(ws, state, id);
        return;
      }

      if (!method) {
        sendError(ws, id, "Missing required field: method");
        return;
      }

      if ((exchange && feed) || (!exchange && !feed)) {
        sendError(ws, id, "Missing required target: provide exactly one of exchange or feed");
        return;
      }

      if (action === "subscribe") {
        if (feed) {
          const feedName = feed.toLowerCase();
          const msg: FeedSubscribeMessage = {
            id,
            action: "subscribe",
            targetKind: "feed",
            feed: feedName,
            method,
            args: (parsed.args as unknown[]) || [],
          };
          handleFeedSubscribe(ws, state, msg, feedName);
        } else {
          const exchangeName = exchange!.toLowerCase();
          const msg: SubscribeMessage = {
            id,
            action: "subscribe",
            targetKind: "exchange",
            exchange: exchangeName,
            method,
            args: (parsed.args as unknown[]) || [],
            credentials: parsed.credentials as ExchangeCredentials | undefined,
          };
          handleSubscribe(ws, state, msg, exchangeName);
        }
      } else if (action === "unsubscribe") {
        if (feed) {
          const msg: FeedUnsubscribeMessage = {
            id,
            action: "unsubscribe",
            targetKind: "feed",
            feed: feed.toLowerCase(),
            method,
            args: (parsed.args as unknown[]) || [],
          };
          handleUnsubscribe(ws, state, msg);
        } else {
          const exchangeName = exchange!.toLowerCase();
          const msg: UnsubscribeMessage = {
            id,
            action: "unsubscribe",
            targetKind: "exchange",
            exchange: exchangeName,
            method,
            args: (parsed.args as unknown[]) || [],
          };
          handleUnsubscribe(ws, state, msg);
        }
      } else {
        sendError(ws, id, `Unknown action: ${action}`);
      }
    });

    ws.on("close", () => {
      // Abort all active subscriptions
      for (const [, sub] of state.subscriptions) {
        sub.abortController.abort();
      }
      state.subscriptions.clear();

      // Close all exchange instances
      for (const [, exchange] of state.exchanges) {
        if (typeof (exchange as any).close === "function") {
          (exchange as any).close().catch((err: unknown) => {
            logger.warn('ws-handler: exchange close() failed', {
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
      }
      state.exchanges.clear();
    });

    ws.on("error", () => {
      // Abort subscriptions on error too
      for (const [, sub] of state.subscriptions) {
        sub.abortController.abort();
      }
    });
  });

  return { wss, attach };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function getOrCreateExchange(
  state: ClientState,
  exchangeName: string,
  credentials?: ExchangeCredentials,
): unknown {
  // Use credentials as part of the cache key to support multiple auths
  const cacheKey =
    credentials && (credentials.apiKey || credentials.privateKey)
      ? `${exchangeName}:${credentials.apiKey || ""}:${credentials.privateKey || ""}`
      : exchangeName;

  const existing = state.exchanges.get(cacheKey);
  if (existing) return existing;

  const exchange = createExchange(exchangeName, credentials);
  state.exchanges.set(cacheKey, exchange);
  return exchange;
}

function handleSubscribe(
  ws: WebSocket,
  state: ClientState,
  msg: SubscribeMessage,
  exchangeName: string,
): void {
  const { id, method, args, credentials } = msg;

  if (!WATCH_METHODS.has(method)) {
    sendError(ws, id, `Method '${method}' is not a streaming method. Use the HTTP API for non-streaming calls.`);
    return;
  }

  const key = subscriptionKey(msg);

  // Already subscribed
  if (state.subscriptions.has(key)) {
    sendError(ws, id, `Already subscribed to ${key}`);
    return;
  }

  let exchange: unknown;
  try {
    exchange = getOrCreateExchange(state, exchangeName, credentials);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create exchange";
    sendError(ws, id, message);
    return;
  }

  if (typeof (exchange as any)[method] !== "function") {
    sendError(ws, id, `Method '${method}' not found on ${exchangeName}`);
    return;
  }

  const abortController = new AbortController();
  state.subscriptions.set(key, { id, abortController });

  const streamFn = method === "watchOrderBooks" ? streamBatch : streamSingle;

  // Fire and forget -- the loop runs until aborted or WS closes
  streamFn(
    exchange,
    method,
    args || [],
    id,
    ws,
    abortController.signal,
  ).catch((err: unknown) => {
    // Unexpected stream rejection (programming error — exchange errors are
    // caught and reported to the client inside streamSingle/streamBatch).
    logger.warn('ws-handler: stream ended with unexpected error', {
      exchange: exchangeName,
      method,
      id,
      error: err instanceof Error ? err.message : String(err),
    });
    sendError(ws, id, err instanceof Error ? err.message : 'Streaming error');
  }).finally(() => {
    state.subscriptions.delete(key);
  });
}

function handleFeedSubscribe(
  ws: WebSocket,
  state: ClientState,
  msg: FeedSubscribeMessage,
  feedName: string,
): void {
  const { id, method, args } = msg;

  if (!FEED_WATCH_METHODS.has(method)) {
    sendError(ws, id, `Method '${method}' is not a feed streaming method. Use the HTTP API for non-streaming calls.`);
    return;
  }

  const key = subscriptionKey(msg);

  if (state.subscriptions.has(key)) {
    sendError(ws, id, `Already subscribed to ${key}`);
    return;
  }

  let feed: IDataFeed;
  try {
    feed = getFeed(feedName);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create feed";
    sendError(ws, id, message);
    return;
  }

  const abortController = new AbortController();
  state.subscriptions.set(key, { id, abortController });

  streamFeedSingle(
    feed,
    feedName,
    method,
    args || [],
    id,
    ws,
    abortController.signal,
  ).catch((err: unknown) => {
    logger.warn('ws-handler: feed stream ended with unexpected error', {
      feed: feedName,
      method,
      id,
      error: err instanceof Error ? err.message : String(err),
    });
    sendError(ws, id, err instanceof Error ? err.message : 'Streaming error');
  }).finally(() => {
    state.subscriptions.delete(key);
  });
}

function handleUnsubscribe(
  ws: WebSocket,
  state: ClientState,
  msg: ClientMessage,
): void {
  const { id } = msg;

  // Build the key of the subscription to cancel.
  // For unsubscribe actions, the corresponding subscribe key uses the watch method.
  const watchMethod = UNWATCH_METHODS[msg.method] || msg.method;
  const lookupMsg = { ...msg, method: watchMethod };
  const key = subscriptionKey(lookupMsg);

  const sub = state.subscriptions.get(key);
  if (!sub) {
    sendError(ws, id, `No active subscription for ${key}`);
    return;
  }

  sub.abortController.abort();
  state.subscriptions.delete(key);

  send(ws, { event: "subscribed", id }); // Acknowledge unsubscribe
}

function handleUnsubscribeById(
  ws: WebSocket,
  state: ClientState,
  id: string,
): void {
  let cancelled = false;

  for (const [key, sub] of state.subscriptions) {
    if (sub.id === id) {
      sub.abortController.abort();
      state.subscriptions.delete(key);
      cancelled = true;
    }
  }

  if (!cancelled) {
    sendError(ws, id, `No active subscription for id ${id}`);
    return;
  }

  send(ws, { event: "subscribed", id });
}
