import WebSocket from "ws";
import { OrderBook, Trade, OrderLevel, QueuedPromise } from "../../types";
import { logger } from '../../utils/logger';
import { DEFAULT_WATCH_TIMEOUT_MS, withWatchTimeout } from "../../utils/watch-timeout";

export interface OpinionWebSocketConfig {
  /** Reconnection interval in milliseconds (default: 5000) */
  reconnectIntervalMs?: number;
  /** Timeout in ms for watch methods to receive data (default: 30000). 0 = no timeout. */
  watchTimeoutMs?: number;
}

/**
 * Opinion Trade WebSocket implementation for real-time order book and trade streaming.
 * Follows CCXT Pro-style async iterator pattern.
 *
 * Connection: wss://ws.opinion.trade?apikey={API_KEY}
 * Channels: market.depth.diff, market.last.trade
 */
export class OpinionWebSocket {
  private ws?: WebSocket;
  private readonly wsUrl: string;
  private readonly config: OpinionWebSocketConfig;

  private readonly orderBookResolvers = new Map<
    number,
    QueuedPromise<OrderBook>[]
  >();
  private readonly tradeResolvers = new Map<
    number,
    QueuedPromise<Trade[]>[]
  >();
  private readonly orderBooks = new Map<number, OrderBook>();

  private readonly subscribedDepthMarketIds = new Set<number>();
  private readonly subscribedTradeMarketIds = new Set<number>();

  private isConnecting = false;
  private isConnected = false;
  private isTerminated = false;
  private reconnectTimer?: NodeJS.Timeout;
  private connectionPromise?: Promise<void>;

  constructor(wsUrl: string, config: OpinionWebSocketConfig = {}) {
    this.wsUrl = wsUrl;
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // Connection management
  // ---------------------------------------------------------------------------

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

    this.connectionPromise = new Promise<void>((resolve, reject) => {
      try {
        const CONNECTION_TIMEOUT_MS = 30_000;
        let settled = false;

        const connectionTimer = setTimeout(() => {
          if (!settled) {
            settled = true;
            this.isConnecting = false;
            this.connectionPromise = undefined;
            logger.error("Opinion WebSocket connection timed out", { timeoutMs: CONNECTION_TIMEOUT_MS });
            if (this.ws) {
              this.ws.terminate();
              this.ws = undefined;
            }
            reject(new Error(`Opinion WebSocket connection timed out after ${CONNECTION_TIMEOUT_MS}ms`));
          }
        }, CONNECTION_TIMEOUT_MS);

        this.ws = new WebSocket(this.wsUrl);

        this.ws.on("open", () => {
          if (settled) return;
          settled = true;
          clearTimeout(connectionTimer);
          this.isConnected = true;
          this.isConnecting = false;
          this.connectionPromise = undefined;
          logger.info("Opinion WebSocket connected");

          this.resubscribeAll();
          resolve();
        });

        this.ws.on("message", (data: WebSocket.Data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error) {
            logger.error("Error parsing Opinion WebSocket message", { error: String(error) });
          }
        });

        this.ws.on("error", (error: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(connectionTimer);
          logger.error("Opinion WebSocket error", { error: String(error) });
          this.isConnecting = false;
          this.connectionPromise = undefined;
          reject(error);
        });

        this.ws.on("close", () => {
          if (!this.isTerminated) {
            logger.info("Opinion WebSocket closed, scheduling reconnect");
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

  private scheduleReconnect(): void {
    if (this.isTerminated) {
      return;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      logger.info("Attempting to reconnect Opinion WebSocket...");
      this.connect().catch((err) => logger.error("Opinion WebSocket reconnect failed", { error: String(err) }));
    }, this.config.reconnectIntervalMs ?? 5000);
  }

  private resubscribeAll(): void {
    for (const marketId of this.subscribedDepthMarketIds) {
      this.sendSubscribe("market.depth.diff", marketId);
    }
    for (const marketId of this.subscribedTradeMarketIds) {
      this.sendSubscribe("market.last.trade", marketId);
    }
  }

  // ---------------------------------------------------------------------------
  // Subscribe / Unsubscribe
  // ---------------------------------------------------------------------------

  private sendSubscribe(channel: string, marketId: number): void {
    if (!this.ws || !this.isConnected) {
      return;
    }
    this.ws.send(
      JSON.stringify({ action: "SUBSCRIBE", channel, marketId }),
    );
  }

  private sendUnsubscribe(channel: string, marketId: number): void {
    if (!this.ws || !this.isConnected) {
      return;
    }
    this.ws.send(
      JSON.stringify({ action: "UNSUBSCRIBE", channel, marketId }),
    );
  }

  // ---------------------------------------------------------------------------
  // Message handling
  // ---------------------------------------------------------------------------

  private handleMessage(message: any): void {
    const msgType: string | undefined = message.msgType;

    if (!msgType) {
      // Could be a subscription confirmation or unknown payload
      return;
    }

    switch (msgType) {
      case "market.depth.diff":
        this.handleDepthDiff(message);
        break;

      case "market.last.trade":
        this.handleLastTrade(message);
        break;

      default:
        // Ignore unknown message types
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Orderbook depth diff
  // ---------------------------------------------------------------------------

  /**
   * Handle an incremental orderbook update from Opinion.
   *
   * Example message:
   * {
   *   "marketId": 2764,
   *   "tokenId": "191204...",
   *   "outcomeSide": 1,
   *   "side": "bids",
   *   "price": "0.2",
   *   "size": "50",
   *   "msgType": "market.depth.diff"
   * }
   *
   * `side` is "bids" or "asks".
   * `size` is the new absolute size at that price level (0 means remove).
   */
  private handleDepthDiff(data: any): void {
    const marketId: number = data.marketId;
    if (marketId === undefined) {
      return;
    }

    const price = parseFloat(data.price);
    const size = parseFloat(data.size);
    const side: string = data.side; // "bids" | "asks"

    if (isNaN(price)) {
      return;
    }

    const book: OrderBook = this.orderBooks.get(marketId) ?? { bids: [], asks: [], timestamp: Date.now() };

    if (side === "bids") {
      book.bids = applyLevelUpdate(book.bids, price, size, "desc");
    } else if (side === "asks") {
      book.asks = applyLevelUpdate(book.asks, price, size, "asc");
    }

    book.timestamp = Date.now();
    this.orderBooks.set(marketId, book);
    this.resolveOrderBook(marketId, book);
  }

  private resolveOrderBook(marketId: number, orderBook: OrderBook): void {
    const resolvers = this.orderBookResolvers.get(marketId);
    if (resolvers && resolvers.length > 0) {
      const snapshot: OrderBook = {
        bids: [...orderBook.bids],
        asks: [...orderBook.asks],
        timestamp: orderBook.timestamp,
      };
      resolvers.forEach((r) => r.resolve(snapshot));
      this.orderBookResolvers.set(marketId, []);
    }
  }

  // ---------------------------------------------------------------------------
  // Trade stream
  // ---------------------------------------------------------------------------

  /**
   * Handle a last-trade message from Opinion.
   *
   * Example message:
   * {
   *   "tokenId": "191204...",
   *   "side": "Buy",
   *   "outcomeSide": 1,
   *   "price": "0.85",
   *   "shares": "10",
   *   "amount": "8.5",
   *   "marketId": 2764,
   *   "msgType": "market.last.trade"
   * }
   */
  private handleLastTrade(data: any): void {
    const marketId: number = data.marketId;
    if (marketId === undefined) {
      return;
    }

    const timestamp = Date.now();
    const price = parseFloat(data.price);
    const shares = parseFloat(data.shares);

    const trade: Trade = {
      id: `${timestamp}-${Math.random().toString(36).slice(2, 10)}`,
      timestamp,
      price: isNaN(price) ? 0 : price,
      amount: isNaN(shares) ? 0 : shares,
      side: mapTradeSide(data.side),
    };

    const resolvers = this.tradeResolvers.get(marketId);
    if (resolvers && resolvers.length > 0) {
      resolvers.forEach((r) => r.resolve([trade]));
      this.tradeResolvers.set(marketId, []);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Watch orderbook updates for a given binary market.
   * Returns a promise that resolves on the next orderbook update.
   */
  async watchOrderBook(marketId: number): Promise<OrderBook> {
    if (this.isTerminated) {
      throw new Error(`WebSocket terminated, cannot watch market ${marketId}`);
    }

    if (!this.subscribedDepthMarketIds.has(marketId)) {
      this.subscribedDepthMarketIds.add(marketId);
    }

    if (!this.isConnected) {
      this.connect().catch((err) => {
        logger.warn("Opinion WebSocket connect failed during watchOrderBook", { error: String(err) });
        if (!this.isTerminated) {
          this.scheduleReconnect();
        }
      });
    } else {
      this.sendSubscribe("market.depth.diff", marketId);
    }

    const dataPromise = new Promise<OrderBook>((resolve, reject) => {
      const existing = this.orderBookResolvers.get(marketId);
      if (existing) {
        existing.push({ resolve, reject });
      } else {
        this.orderBookResolvers.set(marketId, [{ resolve, reject }]);
      }
    });

    return withWatchTimeout(
      dataPromise,
      this.config.watchTimeoutMs ?? DEFAULT_WATCH_TIMEOUT_MS,
      `watchOrderBook('${marketId}')`,
    );
  }

  /**
   * Watch trade updates for a given binary market.
   * Returns a promise that resolves on the next trade.
   */
  async watchTrades(marketId: number): Promise<Trade[]> {
    if (this.isTerminated) {
      throw new Error(`WebSocket terminated, cannot watch trades for market ${marketId}`);
    }

    if (!this.subscribedTradeMarketIds.has(marketId)) {
      this.subscribedTradeMarketIds.add(marketId);
    }

    if (!this.isConnected) {
      this.connect().catch((err) => {
        logger.warn("Opinion WebSocket connect failed during watchTrades", { error: String(err) });
        if (!this.isTerminated) {
          this.scheduleReconnect();
        }
      });
    } else {
      this.sendSubscribe("market.last.trade", marketId);
    }

    const dataPromise = new Promise<Trade[]>((resolve, reject) => {
      const existing = this.tradeResolvers.get(marketId);
      if (existing) {
        existing.push({ resolve, reject });
      } else {
        this.tradeResolvers.set(marketId, [{ resolve, reject }]);
      }
    });

    return withWatchTimeout(
      dataPromise,
      this.config.watchTimeoutMs ?? DEFAULT_WATCH_TIMEOUT_MS,
      `watchTrades('${marketId}')`,
    );
  }

  /**
   * Close the WebSocket connection and reject all pending promises.
   */
  async close(): Promise<void> {
    this.isTerminated = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    // Unsubscribe from all channels before closing
    for (const marketId of this.subscribedDepthMarketIds) {
      this.sendUnsubscribe("market.depth.diff", marketId);
    }
    for (const marketId of this.subscribedTradeMarketIds) {
      this.sendUnsubscribe("market.last.trade", marketId);
    }

    // Reject all pending resolvers
    this.orderBookResolvers.forEach((resolvers, marketId) => {
      resolvers.forEach((r) =>
        r.reject(new Error(`WebSocket closed for market ${marketId}`)),
      );
    });
    this.orderBookResolvers.clear();

    this.tradeResolvers.forEach((resolvers, marketId) => {
      resolvers.forEach((r) =>
        r.reject(new Error(`WebSocket closed for market ${marketId}`)),
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

// ---------------------------------------------------------------------------
// Pure helpers (module-private)
// ---------------------------------------------------------------------------

/**
 * Apply an absolute-size level update to one side of the book.
 * A size of 0 (or NaN) removes the level. Mutates the provided array in place
 * and keeps it sorted.
 */
function applyLevelUpdate(
  levels: OrderLevel[],
  price: number,
  size: number,
  sortOrder: "asc" | "desc",
): OrderLevel[] {
  const idx = levels.findIndex((l) => l.price === price);

  if (idx !== -1) {
    levels.splice(idx, 1);
  }

  if (!isNaN(size) && size > 0) {
    levels.push({ price, size });
  }

  if (sortOrder === "desc") {
    levels.sort((a, b) => b.price - a.price);
  } else {
    levels.sort((a, b) => a.price - b.price);
  }

  return levels;
}

/**
 * Map Opinion's trade side string to our unified type.
 * Opinion uses "Buy" | "Sell" | "Split" | "Merge".
 */
function mapTradeSide(side: string | undefined): "buy" | "sell" | "unknown" {
  if (!side) {
    return "unknown";
  }
  const lower = side.toLowerCase();
  if (lower === "buy") {
    return "buy";
  }
  if (lower === "sell") {
    return "sell";
  }
  return "unknown";
}
