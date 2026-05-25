import { NextFunction, Request, Response, Router } from "express";

interface SqlColumn {
  name: string;
  type: string;
}

interface ClickHouseJsonResult {
  meta?: SqlColumn[];
  data?: Record<string, unknown>[];
  rows?: number;
  statistics?: Record<string, unknown>;
  exception?: string;
}

interface ClickHouseError extends Error {
  chStatusCode?: number;
}

type AccountLike = {
  plan_name?: unknown;
  plan?: unknown;
};

type SqlRequest = Request & {
  account?: AccountLike;
};

const MAX_QUERY_LENGTH = 10_000;

const ALLOWED_FIRST_KEYWORDS = new Set([
  "SELECT",
  "WITH",
  "SHOW",
  "DESCRIBE",
  "DESC",
  "EXISTS",
  "EXPLAIN",
]);

const WRITE_KEYWORDS = [
  "INSERT",
  "CREATE",
  "DROP",
  "ALTER",
  "DELETE",
  "TRUNCATE",
  "ATTACH",
  "DETACH",
  "GRANT",
  "REVOKE",
  "KILL",
  "RENAME",
];

const BLOCKED_FUNCTIONS = new Set([
  "hostname",
  "fqdn",
  "displayname",
  "version",
  "buildid",
  "serveruuid",
  "uptime",
  "tcpport",
  "currentuser",
  "user",
  "currentdatabase",
  "currentprofiles",
  "enabledprofiles",
  "defaultprofiles",
  "currentroles",
  "enabledroles",
  "defaultroles",
  "filesystemavailable",
  "filesystemcapacity",
  "filesystemunreserved",
  "getsetting",
  "getmacro",
]);

const BLOCKED_DB_PREFIXES = ["system.", "information_schema."];

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .trim();
}

function stripStrings(sql: string): string {
  return sql.replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

function validateSqlQuery(sql: unknown): { valid: true; query: string } | { valid: false; error: string } {
  if (typeof sql !== "string") {
    return { valid: false, error: "query is required" };
  }

  const trimmed = sql.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: "query is required" };
  }

  if (trimmed.length > MAX_QUERY_LENGTH) {
    return {
      valid: false,
      error: `query exceeds maximum length (${MAX_QUERY_LENGTH} chars)`,
    };
  }

  const withoutStrings = stripStrings(trimmed);
  if (withoutStrings.includes(";")) {
    return { valid: false, error: "multi-statement queries are not allowed" };
  }

  const stripped = stripComments(trimmed);
  const firstWord = (stripped.split(/\s+/)[0] || "").toUpperCase();
  if (!ALLOWED_FIRST_KEYWORDS.has(firstWord)) {
    return {
      valid: false,
      error:
        `query type "${firstWord}" is not allowed - only SELECT, WITH, ` +
        "SHOW, DESCRIBE, and EXPLAIN are permitted",
    };
  }

  if (firstWord === "SHOW") {
    const upper = stripped.toUpperCase();
    if (/^SHOW\s+(GRANTS|CREATE|ACCESS|PROCESSLIST|SETTINGS)/.test(upper)) {
      return { valid: false, error: "that SHOW command is not allowed" };
    }
  }

  const safeText = stripStrings(stripped);
  for (const keyword of WRITE_KEYWORDS) {
    if (new RegExp(`\\b${keyword}\\b`, "i").test(safeText)) {
      return { valid: false, error: `"${keyword}" is not allowed in queries` };
    }
  }

  const lower = safeText.toLowerCase();
  for (const prefix of BLOCKED_DB_PREFIXES) {
    if (lower.includes(prefix)) {
      return {
        valid: false,
        error: "queries against system tables are not allowed",
      };
    }
  }

  const funcCalls = lower.matchAll(/\b([a-z_][a-z0-9_]*)\s*\(/g);
  for (const match of funcCalls) {
    if (BLOCKED_FUNCTIONS.has(match[1])) {
      return { valid: false, error: `function "${match[1]}" is not allowed` };
    }
  }

  return { valid: true, query: trimmed };
}

function allowedPlans(): Set<string> {
  return new Set(
    (process.env.SQL_ALLOWED_PLANS || "Enterprise")
      .split(",")
      .map((plan) => plan.trim().toLowerCase())
      .filter(Boolean),
  );
}

function hasSqlAccess(req: SqlRequest): boolean {
  if (!req.account) return true;
  const plan = req.account.plan_name ?? req.account.plan ?? "";
  return typeof plan === "string" && allowedPlans().has(plan.toLowerCase());
}

function isConfigured(): boolean {
  return Boolean(process.env.CLICKHOUSE_HTTP_URL);
}

function scrubErrorMessage(message: string): string {
  const user = process.env.CLICKHOUSE_SQL_USER || "readonly";
  const escapedUser = user.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return message
    .replace(/\s*\(version\s+[\d.]+ \(official build\)\)/gi, "")
    .replace(new RegExp(`${escapedUser}:\\s*`, "g"), "");
}

function extractErrorMessage(body: unknown): string {
  if (typeof body !== "string") return String(body);
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { exception?: string; error?: string };
      return scrubErrorMessage(parsed.exception || parsed.error || trimmed);
    } catch {
      // Fall through to plain-text handling.
    }
  }
  return scrubErrorMessage(trimmed.split("\n")[0] || "ClickHouse query failed");
}

async function queryClickHouse(sql: string): Promise<ClickHouseJsonResult> {
  const baseUrl = process.env.CLICKHOUSE_HTTP_URL;
  if (!baseUrl) {
    throw Object.assign(new Error("SQL query service is not available"), {
      chStatusCode: 503,
    });
  }

  let url: URL;
  try {
    url = new URL("/", baseUrl);
  } catch {
    throw Object.assign(new Error("CLICKHOUSE_HTTP_URL is not a valid URL"), {
      chStatusCode: 503,
    });
  }

  url.searchParams.set("default_format", "JSON");
  url.searchParams.set("readonly", "1");
  url.searchParams.set("allow_ddl", "0");
  url.searchParams.set("allow_introspection_functions", "0");
  url.searchParams.set("max_execution_time", "5");
  url.searchParams.set("max_result_rows", "10000");

  const user = process.env.CLICKHOUSE_SQL_USER || "readonly";
  const password = process.env.CLICKHOUSE_SQL_PASSWORD || "";
  const auth = Buffer.from(`${user}:${password}`).toString("base64");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "text/plain",
    },
    body: sql,
    signal: AbortSignal.timeout(6_000),
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(extractErrorMessage(body)) as ClickHouseError;
    error.chStatusCode = response.status;
    throw error;
  }

  const result = (await response.json()) as ClickHouseJsonResult;
  if (result.exception) {
    const error = new Error(extractErrorMessage(result.exception)) as ClickHouseError;
    error.chStatusCode = 400;
    throw error;
  }

  return result;
}

function extractQuery(req: Request): unknown {
  return req.body?.query ?? req.query?.query;
}

async function handleQuery(req: SqlRequest, res: Response, next: NextFunction) {
  try {
    const validation = validateSqlQuery(extractQuery(req));
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    if (!hasSqlAccess(req)) {
      res.status(403).json({
        error: "sql_access_denied",
        message: "SQL query access requires an Enterprise plan",
      });
      return;
    }

    if (!isConfigured()) {
      res.status(503).json({
        error: "service_unavailable",
        message:
          "SQL query service is not available. Configure CLICKHOUSE_HTTP_URL " +
          "or use the hosted PMXT Enterprise SQL endpoint.",
      });
      return;
    }

    const result = await queryClickHouse(validation.query);
    res.json({
      data: result.data || [],
      meta: {
        columns: result.meta || [],
        rows: result.rows ?? result.data?.length ?? 0,
        statistics: result.statistics || {},
      },
    });
  } catch (error: unknown) {
    const err = error as ClickHouseError;
    if (err.chStatusCode === 503) {
      res.status(503).json({
        error: "service_unavailable",
        message: err.message,
      });
      return;
    }

    if (err.chStatusCode === 401 || err.chStatusCode === 403) {
      res.status(502).json({
        error: "database_error",
        message: "Database connection failed",
      });
      return;
    }

    if (err.chStatusCode) {
      res.status(400).json({
        error: "query_error",
        message: err.message,
      });
      return;
    }

    if (err.name === "TimeoutError" || err.name === "AbortError") {
      res.status(408).json({
        error: "query_timeout",
        message: "Query exceeded the maximum execution time (5s)",
      });
      return;
    }

    next(error);
  }
}

export function createSqlRouter(): Router {
  const router = Router();

  router.post("/", handleQuery);
  router.get("/", handleQuery);

  return router;
}
