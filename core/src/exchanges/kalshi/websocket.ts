import WebSocket from "ws";
import { OrderBook, Trade, OrderLevel } from "../../types";
import { logger } from '../../utils/logger';
import { DEFAULT_WATCH_TIMEOUT_MS, withWatchTimeout } from "../../utils/watch-timeout";
import { KalshiAuth } from "./auth";

interface QueuedPromise<T> {
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

export interface KalshiWebSocketConfig {
  /** WebSocket URL - will be set based on demoMode if not provided */
  wsUrl?: string;
  /** Reconnection interval in milliseconds (default: 5000) */
  reconnectIntervalMs?: number;
  /** Timeout in ms for watch methods to receive data (default: 30000). 0 = no timeout. */
  watchTimeoutMs?: number;
}

/**
 * Kalshi WebSocket implementation for real-time order book and trade streaming.
 * Follows CCXT Pro-style async iterator pattern.
 */
export class KalshiWebSocket {
  private ws?: WebSocket;
  private auth: KalshiAuth;
  private config: KalshiWebSocketConfig;
  private wsUrl: string;
  private orderBookResolvers = new Map<string, QueuedPromise<OrderBook>[]>();
  private tradeResolvers = new Map<string, QueuedPromise<Trade[]>[]>();
  private orderBooks = new Map<string, OrderBook>();
  private subscribedOrderBookTickers = new Set<string>();
  private subscribedTradeTickers = new Set<string>();
  private messageIdCounter = 1;
  private isConnecting = false;
  private isConnected = false;
  private reconnectTimer?: NodeJS.Timeout;
  private connectionPromise?: Promise<void>;
  private isTerminated = false;
  private static readonly CONNECTION_TIMEOUT_MS = 30_000;

  constructor(auth: KalshiAuth, config: KalshiWebSocketConfig = {}) {
    this.auth = auth;
    this.config = config;
    if (!config.wsUrl) {
      throw new Error('KalshiWebSocket: wsUrl is required in config');
    }
    this.wsUrl = config.wsUrl;
  }

  private async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }
    if (this.isTerminated) {
      return;
    }
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.isConnecting = true;

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        // Extract path from URL for signature
        const url = new URL(this.wsUrl);
        const path = url.pathname;

        logger.info(`Kalshi WS: Connecting to ${this.wsUrl} (using path ${path} for signature)`);

        // Get authentication headers
        const headers = this.auth.getHeaders("GET", path);

        this.ws = new WebSocket(this.wsUrl, { headers });

        // Connection timeout: close the socket if not connected within 30s
        const connectionTimeout = setTimeout(() => {
          if (!this.isConnected && this.ws) {
            logger.error("Kalshi WebSocket connection timed out", {
              timeoutMs: KalshiWebSocket.CONNECTION_TIMEOUT_MS,
            });
            this.ws.close();
            this.isConnecting = false;
            this.connectionPromise = undefined;
            reject(new Error(`Kalshi WebSocket connection timed out after ${KalshiWebSocket.CONNECTION_TIMEOUT_MS}ms`));
          }
        }, KalshiWebSocket.CONNECTION_TIMEOUT_MS);

        this.ws.on("open", () => {
          clearTimeout(connectionTimeout);
          this.isConnected = true;
          this.isConnecting = false;
          this.connectionPromise = undefined;
          logger.info("Kalshi WebSocket connected");

          // Resubscribe to all tickers if reconnecting
          if (this.subscribedOrderBookTickers.size > 0) {
            this.subscribeToOrderbook(
              Array.from(this.subscribedOrderBookTickers),
            );
          }
          if (this.subscribedTradeTickers.size > 0) {
            this.subscribeToTrades(Array.from(this.subscribedTradeTickers));
          }

          resolve();
        });

        this.ws.on("message", (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error) {
            logger.error("Error parsing Kalshi WebSocket message", { error: String(error) });
          }
        });

        this.ws.on("error", (error: Error) => {
          clearTimeout(connectionTimeout);
          logger.error("Kalshi WebSocket error", { error: String(error) });
          this.isConnecting = false;
          this.connectionPromise = undefined;
          reject(error);
        });

        this.ws.on("close", () => {
          clearTimeout(connectionTimeout);
          if (!this.isTerminated) {
            logger.info("Kalshi WebSocket closed");
            this.scheduleReconnect();
          }
          this.isConnected = false;
          this.isConnecting = false;
          this.connectionPromise = undefined;
        });
      } catch (error) {
        this.isConnecting = false;
        this.connectionPromise = undefined;
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  private scheduleReconnect() {
    if (this.isTerminated) {
      return;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      logger.info("Attempting to reconnect Kalshi WebSocket...");
      this.connect().catch((err) => logger.error("Kalshi WebSocket reconnect failed", { error: String(err) }));
    }, this.config.reconnectIntervalMs || 5000);
  }

  private subscribeToOrderbook(marketTickers: string[]) {
    if (!this.ws || !this.isConnected) {
      return;
    }

    const subscription = {
      id: this.messageIdCounter++,
      cmd: "subscribe",
      params: {
        channels: ["orderbook_delta"],
        market_tickers: marketTickers,
      },
    };

    this.ws.send(JSON.stringify(subscription));
  }

  private subscribeToTrades(marketTickers: string[]) {
    if (!this.ws || !this.isConnected) {
      return;
    }

    const subscription = {
      id: this.messageIdCounter++,
      cmd: "subscribe",
      params: {
        channels: ["trade"],
        market_tickers: marketTickers,
      },
    };

    this.ws.send(JSON.stringify(subscription));
  }

  private handleMessage(message: any) {
    const msgType = message.type;
    // Kalshi V2 uses 'data' field for payloads
    const data = message.data || message.msg;

    if (!data && msgType !== "subscribed" && msgType !== "pong") {
      return;
    }

    // Add message-level timestamp as a fallback for handlers
    if (data && typeof data === "object" && !data.ts && !data.created_time) {
      data.message_ts = message.ts || message.time;
    }

    switch (msgType) {
      case "orderbook_snapshot":
        this.handleOrderbookSnapshot(data);
        break;

      case "orderbook_delta":
      case "orderbook_update": // Some versions use update
        this.handleOrderbookDelta(data);
        break;

      case "trade":
        this.handleTrade(data);
        break;

      case "error":
        logger.error("Kalshi WebSocket error", {
          detail: String(message.msg || message.error || message.data),
        });
        break;

      case "subscribed":
        logger.info("Kalshi subscription confirmed", { message });
        break;

      case "pong":
        // Ignore keep-alive
        break;

      default:
        // Ignore unknown message types
        break;
    }
  }

  private handleOrderbookSnapshot(data: any) {
    const ticker = data.market_ticker;

    // Kalshi returns market_id: "" for non-existing markets — reject instead
    // of resolving with an empty orderbook.
    if (!data.market_id) {
      const resolvers = this.orderBookResolvers.get(ticker);
      if (resolvers && resolvers.length > 0) {
        const err = new Error(
          `watchOrderBook('${ticker}'): market not found on this exchange.`,
        );
        resolvers.forEach((r) => r.reject(err));
        this.orderBookResolvers.set(ticker, []);
      }
      this.subscribedOrderBookTickers.delete(ticker);
      return;
    }

    // Kalshi V2 WebSocket uses dollar-denominated string pairs:
    //   yes_dollars_fp / no_dollars_fp: [["0.55", "100.00"], ...]
    // Older format used cent-denominated objects:
    //   yes / no: [{ price: 55, quantity: 100 }, ...]
    const usesDollarsFp =
      data.yes_dollars_fp !== undefined || data.no_dollars_fp !== undefined;

    let bids: OrderLevel[];
    let asks: OrderLevel[];

    if (usesDollarsFp) {
      bids = (data.yes_dollars_fp || []).map((level: [string, string]) => ({
        price: parseFloat(level[0]),
        size: parseFloat(level[1]),
      }));

      asks = (data.no_dollars_fp || []).map((level: [string, string]) => ({
        price: Math.round((1 - parseFloat(level[0])) * 10000) / 10000,
        size: parseFloat(level[1]),
      }));
    } else {
      bids = (data.yes || []).map((level: any) => {
        const price = (level.price || level[0]) / 100;
        const size =
          (level.quantity !== undefined
            ? level.quantity
            : level.size !== undefined
              ? level.size
              : level[1]) || 0;
        return { price, size };
      });

      asks = (data.no || []).map((level: any) => {
        const price = (100 - (level.price || level[0])) / 100;
        const size =
          (level.quantity !== undefined
            ? level.quantity
            : level.size !== undefined
              ? level.size
              : level[1]) || 0;
        return { price, size };
      });
    }

    bids.sort((a: OrderLevel, b: OrderLevel) => b.price - a.price);
    asks.sort((a: OrderLevel, b: OrderLevel) => a.price - b.price);

    const orderBook: OrderBook = {
      bids,
      asks,
      timestamp: Date.now(),
    };

    this.orderBooks.set(ticker, orderBook);
    this.resolveOrderBook(ticker, orderBook);
  }

  private handleOrderbookDelta(data: any) {
    const ticker = data.market_ticker;
    const existing = this.orderBooks.get(ticker);

    if (!existing) {
      // No snapshot yet, skip delta
      return;
    }

    // Kalshi V2 uses dollar-denominated string values:
    //   { price_dollars_fp: "0.55", delta_dollars_fp: "10.00", side: "yes"|"no" }
    // Older format used cent-denominated integers:
    //   { price: 55, delta: 10, side: "yes"|"no" }
    const usesDollarsFp = data.price_dollars_fp !== undefined;

    let price: number;
    let delta: number;

    if (usesDollarsFp) {
      const rawPrice = parseFloat(data.price_dollars_fp);
      delta = parseFloat(data.delta_dollars_fp || "0");
      const side = data.side;

      if (side === "yes") {
        price = rawPrice;
        this.applyDelta(existing.bids, price, delta, "desc");
      } else {
        price = Math.round((1 - rawPrice) * 10000) / 10000;
        this.applyDelta(existing.asks, price, delta, "asc");
      }
    } else {
      price = data.price / 100;
      delta =
        data.delta !== undefined
          ? data.delta
          : data.quantity !== undefined
            ? data.quantity
            : 0;
      const side = data.side;

      if (side === "yes") {
        this.applyDelta(existing.bids, price, delta, "desc");
      } else {
        const yesPrice = (100 - data.price) / 100;
        this.applyDelta(existing.asks, yesPrice, delta, "asc");
      }
    }

    existing.timestamp = Date.now();
    this.resolveOrderBook(ticker, existing);
  }

  private applyDelta(
    levels: OrderLevel[],
    price: number,
    delta: number,
    sortOrder: "asc" | "desc",
  ) {
    const existingIndex = levels.findIndex(
      (l) => Math.abs(l.price - price) < 0.001,
    );

    if (delta === 0) {
      // Remove level
      if (existingIndex !== -1) {
        levels.splice(existingIndex, 1);
      }
    } else {
      // Update or add level
      if (existingIndex !== -1) {
        levels[existingIndex].size += delta;
        if (levels[existingIndex].size <= 0) {
          levels.splice(existingIndex, 1);
        }
      } else {
        levels.push({ price, size: delta });
        // Re-sort
        if (sortOrder === "desc") {
          levels.sort((a, b) => b.price - a.price);
        } else {
          levels.sort((a, b) => a.price - b.price);
        }
      }
    }
  }

  private handleTrade(data: any) {
    const ticker = data.market_ticker;

    // Kalshi trade structure:
    // { trade_id, market_ticker, yes_price, no_price, count, created_time, taker_side }
    // The timestamp could be in created_time, created_at, or ts.
    let timestamp = Date.now();
    const rawTime =
      data.created_time ||
      data.created_at ||
      data.ts ||
      data.time ||
      data.message_ts;

    if (rawTime) {
      const parsed = new Date(rawTime).getTime();
      if (!isNaN(parsed)) {
        timestamp = parsed;
        // If the timestamp is too small, it might be in seconds
        if (timestamp < 10000000000) {
          timestamp *= 1000;
        }
      } else if (typeof rawTime === "number") {
        // If it's already a number but new Date() failed (maybe it's a large timestamp)
        timestamp = rawTime;
        if (timestamp < 10000000000) {
          timestamp *= 1000;
        }
      }
    }

    const trade: Trade = {
      id: data.trade_id || `${timestamp}-${Math.random()}`,
      timestamp,
      price: data.yes_price_dollars != null
        ? parseFloat(data.yes_price_dollars)
        : 0.5,
      amount: data.count_fp != null
        ? parseFloat(data.count_fp)
        : 0,
      side:
        data.taker_side === "yes" || data.side === "buy"
          ? "buy"
          : data.taker_side === "no" || data.side === "sell"
            ? "sell"
            : "unknown",
    };

    const resolvers = this.tradeResolvers.get(ticker);
    if (resolvers && resolvers.length > 0) {
      resolvers.forEach((r) => r.resolve([trade]));
      this.tradeResolvers.set(ticker, []);
    }
  }

  private resolveOrderBook(ticker: string, orderBook: OrderBook) {
    const resolvers = this.orderBookResolvers.get(ticker);
    if (resolvers && resolvers.length > 0) {
      resolvers.forEach((r) => r.resolve(orderBook));
      this.orderBookResolvers.set(ticker, []);
    }
  }

  async watchOrderBook(ticker: string): Promise<OrderBook> {
    if (this.isTerminated) {
      throw new Error(`WebSocket terminated, cannot watch ${ticker}`);
    }

    // Track the subscription regardless of connection state.
    // When (re)connected, the open handler resubscribes automatically.
    if (!this.subscribedOrderBookTickers.has(ticker)) {
      this.subscribedOrderBookTickers.add(ticker);
    }

    // Attempt connection — if it fails, scheduleReconnect handles recovery.
    // The resolver will be fulfilled once the connection is (re)established
    // and data arrives.
    if (!this.isConnected) {
      this.connect().catch((err) => {
        logger.warn("Kalshi WebSocket connect failed during subscribeToOrderbook", {
          error: String(err),
        });
        if (!this.isTerminated) {
          this.scheduleReconnect();
        }
      });
    } else {
      this.subscribeToOrderbook([ticker]);
    }

    // Return a promise that resolves on the next orderbook update
    const dataPromise = new Promise<OrderBook>((resolve, reject) => {
      const resolvers = this.orderBookResolvers.get(ticker) ?? [];
      resolvers.push({ resolve, reject });
      this.orderBookResolvers.set(ticker, resolvers);
    });

    return withWatchTimeout(
      dataPromise,
      this.config.watchTimeoutMs ?? DEFAULT_WATCH_TIMEOUT_MS,
      `watchOrderBook('${ticker}')`,
    );
  }

  async watchOrderBooks(tickers: string[]): Promise<Record<string, OrderBook>> {
    if (this.isTerminated) {
      throw new Error("WebSocket terminated, cannot watch orderbooks");
    }

    // Track subscriptions regardless of connection state.
    const newTickers = tickers.filter(
      (t) => !this.subscribedOrderBookTickers.has(t),
    );
    for (const t of newTickers) {
      this.subscribedOrderBookTickers.add(t);
    }

    // Attempt connection — if it fails, scheduleReconnect handles recovery.
    if (!this.isConnected) {
      this.connect().catch((err) => {
        logger.warn("Kalshi WebSocket connect failed during subscribeToOrderbooks", {
          error: String(err),
        });
        if (!this.isTerminated) {
          this.scheduleReconnect();
        }
      });
    } else if (newTickers.length > 0) {
      this.subscribeToOrderbook(newTickers);
    }

    // Wait for all tickers to receive at least one snapshot/update
    const dataPromise = Promise.all(
      tickers.map((ticker) =>
        new Promise<[string, OrderBook]>((resolve, reject) => {
          const resolvers = this.orderBookResolvers.get(ticker) ?? [];
          resolvers.push({
            resolve: (book: OrderBook | PromiseLike<OrderBook>) => {
              Promise.resolve(book).then((b) => resolve([ticker, b]));
            },
            reject,
          });
          this.orderBookResolvers.set(ticker, resolvers);
        }),
      ),
    );

    const entries = await withWatchTimeout(
      dataPromise,
      this.config.watchTimeoutMs ?? DEFAULT_WATCH_TIMEOUT_MS,
      `watchOrderBooks(${JSON.stringify(tickers)})`,
    );

    const result: Record<string, OrderBook> = {};
    for (const [ticker, book] of entries) {
      result[ticker] = book;
    }
    return result;
  }

  async watchTrades(ticker: string): Promise<Trade[]> {
    if (this.isTerminated) {
      throw new Error(`WebSocket terminated, cannot watch trades for ${ticker}`);
    }

    if (!this.subscribedTradeTickers.has(ticker)) {
      this.subscribedTradeTickers.add(ticker);
    }

    if (!this.isConnected) {
      this.connect().catch((err) => {
        logger.warn("Kalshi WebSocket connect failed during subscribeToTrades", {
          error: String(err),
        });
        if (!this.isTerminated) {
          this.scheduleReconnect();
        }
      });
    } else {
      this.subscribeToTrades([ticker]);
    }

    const dataPromise = new Promise<Trade[]>((resolve, reject) => {
      const resolvers = this.tradeResolvers.get(ticker) ?? [];
      resolvers.push({ resolve, reject });
      this.tradeResolvers.set(ticker, resolvers);
    });

    return withWatchTimeout(
      dataPromise,
      this.config.watchTimeoutMs ?? DEFAULT_WATCH_TIMEOUT_MS,
      `watchTrades('${ticker}')`,
    );
  }

  async close() {
    this.isTerminated = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    // Reject all pending resolvers
    this.orderBookResolvers.forEach((resolvers, ticker) => {
      resolvers.forEach((r) =>
        r.reject(new Error(`WebSocket closed for ${ticker}`)),
      );
    });
    this.orderBookResolvers.clear();

    this.tradeResolvers.forEach((resolvers, ticker) => {
      resolvers.forEach((r) =>
        r.reject(new Error(`WebSocket closed for ${ticker}`)),
      );
    });
    this.tradeResolvers.clear();

    if (this.ws) {
      const ws = this.ws;
      this.ws = undefined;

      if (
        ws.readyState !== WebSocket.CLOSED &&
        ws.readyState !== WebSocket.CLOSING
      ) {
        return new Promise<void>((resolve) => {
          ws.once("close", () => {
            this.isConnected = false;
            this.isConnecting = false;
            resolve();
          });
          ws.close();
        });
      }
    }

    this.isConnected = false;
    this.isConnecting = false;
  }
}
