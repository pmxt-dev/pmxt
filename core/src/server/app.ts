import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { Server as HttpServer } from "http";
import { createWebSocketHandler, CreateWebSocketHandlerOptions } from "./ws-handler";
import { createExchange } from "./exchange-factory";
import { createFeedRouter } from "./feed-routes";
import { createSqlRouter } from "./sql-route";
import { ExchangeCredentials, PredictionMarketExchange } from "../BaseExchange";
import { Router } from "../router";
import { BaseError, ValidationError } from "../errors";
import { logger } from "../utils/logger";

// ---------------------------------------------------------------------------
// Method metadata for the GET dispatcher.
//
// `method-verbs.json` is produced by `scripts/generate-openapi.js` from
// the AST of BaseExchange.ts. For every public method it records the
// verb ("get" | "post") and the positional argument spec the runtime
// uses to translate `req.query` into the method's argument list.
//
// The JSON is copied into `dist/server/` by the build step, so at
// runtime it lives next to the compiled `app.js`. We tolerate it being
// missing (`require.resolve` would throw in that case): if we can't
// load it, GET dispatch is simply disabled and every call falls back
// to POST as before. This keeps the change additive.
// ---------------------------------------------------------------------------

type MethodArgKind = "string" | "number" | "boolean" | "object" | "unknown";

interface MethodArgSpec {
  name: string;
  kind: MethodArgKind;
  optional: boolean;
}

interface MethodVerb {
  verb: "get" | "post";
  args: MethodArgSpec[];
}

function loadMethodVerbs(): Record<string, MethodVerb> {
  const candidates = [
    path.join(__dirname, "method-verbs.json"),
    path.join(__dirname, "../../src/server/method-verbs.json"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, "utf8");
    return JSON.parse(raw);
  }
  logger.warn("method-verbs.json not found — GET /api/:exchange/:method disabled. POST continues to work. Rebuild pmxt-core to regenerate.");
  return {};
}

const METHOD_VERBS = loadMethodVerbs();

/**
 * Coerce a query-string value into its closest native type, optionally
 * honoring the arg kind declared in `method-verbs.json`.
 *
 * Express's built-in query parser hands us strings (or arrays of strings)
 * regardless of what the method actually wants. When we know the target
 * kind we respect it exactly:
 *   - `string` → never coerce, even if the value looks like a number.
 *     (Critical for venue IDs like Polymarket's all-numeric condition
 *     IDs, which must stay strings to keep `.trim()` etc. working.)
 *   - `number` → parse as float/int; non-numeric input stays a string.
 *   - `boolean` → accept the literal `"true"` / `"false"`, else leave as-is.
 *
 * When the kind is unknown (`undefined`, e.g. object-arg properties that
 * aren't statically typed), fall back to the permissive heuristic:
 * lift obvious numeric/boolean literals and leave everything else alone.
 */
function coerceQueryValue(raw: unknown, kind?: MethodArgKind): unknown {
  if (Array.isArray(raw)) return raw.map((v) => coerceQueryValue(v, kind));
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      result[k] = coerceQueryValue(v);
    }
    return result;
  }
  if (typeof raw !== "string") return raw;
  if (kind === "string") return raw;
  if (kind === "number") {
    if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
    if (/^-?\d*\.\d+$/.test(raw)) return parseFloat(raw);
    return raw;
  }
  if (kind === "boolean") {
    if (raw === "true") return true;
    if (raw === "false") return false;
    return raw;
  }
  // Unknown kind — permissive fallback.
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try { return JSON.parse(raw); } catch { /* fall through */ }
  }
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
  if (/^-?\d*\.\d+$/.test(raw)) return parseFloat(raw);
  return raw;
}

/**
 * Translate a parsed query-string object into the positional `args`
 * array that `exchange[method](...args)` expects, using the per-method
 * spec extracted from BaseExchange.ts at generation time.
 *
 * Rules:
 *   - Primitive args are pulled by name from the query and coerced.
 *   - A single object arg swallows every *remaining* query key (after
 *     primitive args have been consumed) as its properties.
 *   - Trailing `undefined`s are trimmed so optional tail params stay
 *     optional instead of arriving as explicit `undefined`.
 */
function queryToArgs(
  query: Record<string, unknown>,
  spec: MethodArgSpec[],
): unknown[] {
  // Reserve primitive arg names so they don't leak into an object arg.
  const primitiveNames = new Set(
    spec.filter((s) => s.kind !== "object").map((s) => s.name),
  );
  const args: unknown[] = [];
  for (const arg of spec) {
    if (arg.kind === "object") {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(query)) {
        if (primitiveNames.has(k)) continue;
        obj[k] = coerceQueryValue(v);
      }
      args.push(Object.keys(obj).length > 0 ? obj : undefined);
    } else {
      const raw = query[arg.name];
      args.push(raw !== undefined ? coerceQueryValue(raw, arg.kind) : undefined);
    }
  }
  while (args.length > 0 && args[args.length - 1] === undefined) {
    args.pop();
  }
  return args;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toDateParam(value: unknown, field: string, exchange?: string): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new ValidationError(`${field} must be a valid date-time value.`, field, exchange);
    }
    return value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  throw new ValidationError(`${field} must be a valid date-time string or timestamp.`, field, exchange);
}

function normalizeDateFields(
  params: Record<string, unknown>,
  fields: string[],
  exchange?: string,
): Record<string, unknown> {
  const normalized = { ...params };
  for (const field of fields) {
    const value = normalized[field];
    if (value === undefined || value === null || value === "") continue;
    normalized[field] = toDateParam(value, field, exchange);
  }
  return normalized;
}

function normalizeArrayFields(
  params: Record<string, unknown>,
  fields: string[],
): Record<string, unknown> {
  return fields.reduce((normalized, field) => {
    const value = normalized[field];
    if (typeof value === "string") {
      return { ...normalized, [field]: [value] };
    }
    return normalized;
  }, { ...params });
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function assertFiniteNumber(params: Record<string, unknown>, field: string, exchange?: string): void {
  const value = params[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError(`createOrder params.${field} must be a finite number.`, field, exchange);
  }
}

function validateCreateOrderParams(params: unknown, exchange?: string): Record<string, unknown> {
  if (!isRecord(params)) {
    throw new ValidationError("createOrder requires an order parameter object.", "params", exchange);
  }

  const required = ["marketId", "outcomeId", "side", "type", "amount"];
  const missing = required.filter((field) => isMissing(params[field]));
  if (missing.length > 0) {
    throw new ValidationError(
      `createOrder requires ${missing.map((field) => `params.${field}`).join(", ")}.`,
      missing[0],
      exchange,
    );
  }

  if (params.side !== "buy" && params.side !== "sell") {
    throw new ValidationError('createOrder params.side must be "buy" or "sell".', "side", exchange);
  }
  if (params.type !== "market" && params.type !== "limit") {
    throw new ValidationError('createOrder params.type must be "market" or "limit".', "type", exchange);
  }

  assertFiniteNumber(params, "amount", exchange);

  if (params.type === "limit" && isMissing(params.price)) {
    throw new ValidationError("createOrder params.price is required for limit orders.", "price", exchange);
  }
  if (!isMissing(params.price)) {
    assertFiniteNumber(params, "price", exchange);
  }
  if (!isMissing(params.fee)) {
    assertFiniteNumber(params, "fee", exchange);
  }

  return params;
}

function normalizeDispatchArgs(methodName: string, args: unknown[], exchange?: string): unknown[] {
  const normalized = [...args];

  if ((methodName === "fetchOHLCV" || methodName === "fetchTrades") && isRecord(normalized[1])) {
    normalized[1] = normalizeDateFields(normalized[1], ["start", "end"], exchange);
  }

  if ((methodName === "fetchMarkets" || methodName === "fetchEvents") && isRecord(normalized[0])) {
    normalized[0] = normalizeArrayFields(normalized[0], ["tags"]);
  }

  if (methodName === "createOrder") {
    normalized[0] = validateCreateOrderParams(normalized[0], exchange);
  }

  return normalized;
}

// Singleton instances for local usage (when no credentials provided)
const defaultExchanges: Record<string, any> = {
  polymarket: null,
  limitless: null,
  kalshi: null,
  "kalshi-demo": null,
  probable: null,
  baozi: null,
  myriad: null,
  opinion: null,
  metaculus: null,
  smarkets: null,
  hunch: null,
  mock: null,
};

function getDefaultExchange(exchangeName: string): any {
  if (!defaultExchanges[exchangeName]) {
    defaultExchanges[exchangeName] = createExchange(exchangeName);
  }
  return defaultExchanges[exchangeName];
}

/**
 * Options accepted by {@link createApp}.
 */
export interface CreateAppOptions {
  /**
   * Access token for the built-in `x-pmxt-access-token` auth middleware.
   *
   * When set, every non-`/health` request must carry a matching token.
   * This is how the local sidecar protects itself from other processes
   * on the same machine.
   *
   * When omitted (or empty string), the built-in token check is
   * disabled. This is the mode hosted-pmxt uses when it mounts the core
   * app under its own Bearer-auth middleware — no point double-checking.
   */
  accessToken?: string;

  /**
   * If true, skip registering `cors()` and `express.json()`.
   *
   * Useful when the host application has already installed its own body
   * parser / CORS middleware and you just want the route handlers.
   * Defaults to false.
   */
  skipBaseMiddleware?: boolean;

  /**
   * Exchange instances scoped to this app.
   *
   * By default, unauthenticated local usage reuses process-wide singleton
   * exchanges. Embedders and tests can provide explicit instances here when
   * they need isolated state or non-default mock exchange options.
   */
  localExchanges?: Partial<Record<string, PredictionMarketExchange>>;
}

/**
 * Build an Express app that serves the PMXT sidecar API surface without
 * binding to a port.
 *
 * This is the mounting point for consumers like hosted-pmxt that want to
 * wrap the sidecar in their own auth / quota / usage middleware and serve
 * it as part of a larger Express application.
 *
 * The returned app registers HTTP routes only:
 *   - `GET  /health`
 *   - (optional) the built-in `x-pmxt-access-token` auth check
 *   - `POST /api/:exchange/:method`
 *   - the error handler
 *
 * WebSocket upgrades do not pass through Express routing. Local servers
 * created from this app can expose `/ws` by attaching the WebSocket endpoint
 * to the underlying HTTP server:
 *
 * ```ts
 * import { createApp, attachWebSocketEndpoint } from 'pmxt-core';
 *
 * const accessToken = process.env.PMXT_ACCESS_TOKEN;
 * const app = createApp({ accessToken });
 * const server = app.listen(4000, "127.0.0.1");
 * attachWebSocketEndpoint(server, { accessToken });
 * ```
 *
 * Usage:
 * ```ts
 * import express from 'express';
 * import { createApp as createPmxtCoreApp } from 'pmxt-core';
 *
 * const app = express();
 * app.use(myAuthMiddleware);
 * app.use('/', createPmxtCoreApp());  // no token required — we auth upstream
 * app.listen(4000);
 * ```
 */
export function createApp(options: CreateAppOptions = {}): Express {
  const {
    accessToken,
    skipBaseMiddleware = false,
    localExchanges = {},
  } = options;
  const app: Express = express();

  const getAppExchange = (exchangeName: string): any => (
    localExchanges[exchangeName] ?? getDefaultExchange(exchangeName)
  );

  if (!skipBaseMiddleware) {
    app.use(cors());
    app.use(express.json({ limit: "2mb" }));
  }

  // Health check (public)
  app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  // Optional built-in auth. Only registered when an accessToken is
  // supplied — hosted-pmxt mounts this app without a token and relies on
  // its own upstream Bearer middleware.
  if (accessToken) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      const token = req.headers["x-pmxt-access-token"];
      if (!token || token !== accessToken) {
        res.status(401).json({
          success: false,
          error: "Unauthorized: Invalid or missing access token",
        });
        return;
      }
      next();
    });
  }

  app.use("/v0/sql", createSqlRouter());
  // Mount before /api/:exchange/:method so "feeds" is not interpreted as
  // an exchange name by the generic dispatcher.
  app.use("/api/feeds", createFeedRouter());

  // Shared dispatch used by both GET and POST handlers below. Given the
  // method name, the positional args, and optional credentials, it
  // resolves the exchange instance (singleton or per-request) and
  // invokes `exchange[method](...args)`.
  async function dispatchMethod(
    req: Request,
    res: Response,
    next: NextFunction,
    methodName: string,
    args: unknown[],
    credentials: ExchangeCredentials | undefined,
  ) {
    try {
      const exchangeName = (req.params.exchange as string).toLowerCase();

      let exchange: any;
      if (exchangeName === "router") {
        const localRouter = localExchanges[exchangeName];
        if (localRouter) {
          exchange = localRouter;
        } else {
          // Router uses the caller's Bearer token for its internal /v0/
          // calls — not a server-side env var.  Each request may carry a
          // different key, so Router is never cached as a singleton.
          const bearer =
            req.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
          exchange = new Router({
            apiKey: bearer,
            localExchanges: {
              mock: getAppExchange("mock") as PredictionMarketExchange,
            },
          });
        }
      } else if (
        credentials &&
        (credentials.privateKey ||
          credentials.apiKey ||
          credentials.apiToken)
      ) {
        exchange = createExchange(exchangeName, credentials);
      } else {
        exchange = getAppExchange(exchangeName);
      }

      if (req.headers["x-pmxt-verbose"] === "true") {
        exchange.verbose = true;
      } else {
        exchange.verbose = false;
      }

      if (typeof exchange[methodName] !== "function") {
        res.status(404).json({
          success: false,
          error: `Method '${methodName}' not found on ${exchangeName}`,
        });
        return;
      }

      const capability = exchange.has?.[methodName as keyof typeof exchange.has];
      if (capability === false && methodName !== "fetchSeries") {
        res.status(501).json({
          success: false,
          error:
            `Method '${methodName}' is not supported by '${exchangeName}'. ` +
            `Use exchange: "router" for cross-venue methods.`,
        });
        return;
      }

      const normalizedArgs = normalizeDispatchArgs(methodName, args, exchangeName);
      const result = await exchange[methodName](...normalizedArgs);
      res.json({ success: true, data: result });
    } catch (error: any) {
      next(error);
    }
  }

  // GET /api/:exchange/:method
  //
  // Enabled for methods classified as idempotent reads by the OpenAPI
  // generator (every method starting with `fetch` whose signature fits
  // in a query string). The method name is looked up in METHOD_VERBS;
  // if it isn't a GET method we return 405 so callers don't silently
  // hit a stale route. POST continues to work for every method,
  // including the ones exposed as GET here, so existing SDK clients
  // that unconditionally POST keep functioning unchanged.
  app.get(
    "/api/:exchange/:method",
    async (req: Request, res: Response, next: NextFunction) => {
      const methodName = req.params.method as string;
      const meta = METHOD_VERBS[methodName];
      if (!meta || meta.verb !== "get") {
        res.status(405).json({
          success: false,
          error:
            `Method '${methodName}' is not available via GET. ` +
            `Use POST /api/:exchange/${methodName} instead.`,
        });
        return;
      }
      const args = queryToArgs(
        req.query as Record<string, unknown>,
        meta.args,
      );
      // GET requests never carry credentials in the body (and query
      // strings would leak them); unauthenticated reads only.
      await dispatchMethod(req, res, next, methodName, args, undefined);
    },
  );

  // POST /api/:exchange/:method
  //
  // Supports two calling conventions:
  //   - Envelope:   { args: [...], credentials? }  — original RPC shape, used by SDKs
  //   - Flat body:  { slug: "wta", limit: 3, ... } — raw-curl / documentation examples
  //
  // When `args` is a valid array it is used directly (envelope path).
  // When the body is a plain object without an `args` array, the body minus
  // the reserved envelope keys (`args`, `credentials`) becomes args[0].
  // Accepts every method, including reads — so pre-existing clients
  // that POST reads keep working forever.
  app.post(
    "/api/:exchange/:method",
    async (req: Request, res: Response, next: NextFunction) => {
      const methodName = req.params.method as string;
      const body = req.body as Record<string, unknown>;
      const credentials = body.credentials as ExchangeCredentials | undefined;
      let args: unknown[];
      if (Array.isArray(body.args)) {
        args = body.args;
      } else if (body && typeof body === 'object' && !Array.isArray(body)) {
        const { args: _ignored, credentials: _creds, ...rest } = body;
        args = Object.keys(rest).length > 0 ? [rest] : [];
      } else {
        args = [];
      }
      await dispatchMethod(req, res, next, methodName, args, credentials);
    },
  );

  // Error handler
  app.use((error: any, req: Request, res: Response, next: NextFunction) => {
    logger.error('API Error', { message: error.message, stack: error.stack });

    // Handle BaseError instances with full context
    if (error instanceof BaseError) {
      const errorResponse: any = {
        success: false,
        error: {
          message: error.message,
          code: error.code,
          retryable: error.retryable,
        },
      };

      // Add exchange context if available
      if (error.exchange) {
        errorResponse.error.exchange = error.exchange;
      }

      // Add retryAfter for rate limit errors
      if ("retryAfter" in error && error.retryAfter !== undefined) {
        errorResponse.error.retryAfter = error.retryAfter;
      }

      // Add stack trace in development
      if (process.env.NODE_ENV === "development") {
        errorResponse.error.stack = error.stack;
      }

      res.status(error.status || 500).json(errorResponse);
      return;
    }

    // Handle generic errors
    res.status(error.status || 500).json({
      success: false,
      error: {
        message: error.message || "Internal server error",
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
    });
  });

  return app;
}

export type WebSocketEndpoint = ReturnType<typeof createWebSocketHandler>;

/**
 * Attach the PMXT streaming WebSocket endpoint to an HTTP server.
 *
 * Use this with servers built from `createApp()` when you need `/ws` support
 * for watchOrderBook, watchOrderBooks, or watchTrades. The access token should
 * match the one passed to `createApp()` so HTTP and WebSocket requests share
 * the same local auth policy.
 */
export function attachWebSocketEndpoint(
  server: HttpServer,
  options: CreateWebSocketHandlerOptions = {},
): WebSocketEndpoint {
  const wsHandler = createWebSocketHandler(options);
  wsHandler.attach(server);
  return wsHandler;
}

/**
 * Start the PMXT sidecar server on the given port with the built-in
 * access-token auth middleware enabled. Returns the underlying
 * {@link http.Server} once it is listening.
 *
 * Automatically attaches a WebSocket endpoint at `/ws` for streaming
 * methods (watchOrderBook, watchOrderBooks, watchTrades).
 */
export async function startServer(port: number, accessToken: string) {
  const app = createApp({ accessToken });
  const server = app.listen(port, "127.0.0.1");

  attachWebSocketEndpoint(server, { accessToken });

  return server;
}

export { createWebSocketHandler };
export type { CreateWebSocketHandlerOptions };
