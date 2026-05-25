import express, { NextFunction, Request, Response } from "express";
import http from "http";
import request from "supertest";
import { createApp } from "../../src/server/app";

const SQL_ENV_KEYS = [
  "CLICKHOUSE_HTTP_URL",
  "CLICKHOUSE_SQL_USER",
  "CLICKHOUSE_SQL_PASSWORD",
  "SQL_ALLOWED_PLANS",
];

describe("Enterprise SQL route", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {};
    for (const key of SQL_ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of SQL_ENV_KEYS) {
      const value = savedEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  test("POST /v0/sql accepts the hosted query body shape and returns 503 when ClickHouse is not configured", async () => {
    const app = createApp({ accessToken: undefined });

    const res = await request(app)
      .post("/v0/sql")
      .send({ query: "select 1" });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("service_unavailable");
    expect(res.body.message).toMatch(/SQL query service is not available/i);
  });

  test("GET /v0/sql accepts query-string SQL and returns 503 when ClickHouse is not configured", async () => {
    const app = createApp({ accessToken: undefined });

    const res = await request(app)
      .get("/v0/sql")
      .query({ query: "select 1" });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("service_unavailable");
  });

  test("POST /v0/sql rejects a missing query before configuration checks", async () => {
    const app = createApp({ accessToken: undefined });

    const res = await request(app)
      .post("/v0/sql")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("query is required");
  });

  test("POST /v0/sql rejects disallowed write queries before configuration checks", async () => {
    const app = createApp({ accessToken: undefined });

    const res = await request(app)
      .post("/v0/sql")
      .send({ query: "insert into markets values (1)" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/INSERT.*not allowed/i);
  });

  test("POST /v0/sql returns 403 when upstream auth marks the account as non-enterprise", async () => {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { account?: { plan_name: string } }).account = {
        plan_name: "Free",
      };
      next();
    });
    app.use(createApp({ accessToken: undefined, skipBaseMiddleware: true }));

    const res = await request(app)
      .post("/v0/sql")
      .send({ query: "select 1" });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("sql_access_denied");
  });

  test("POST /v0/sql proxies read-only SQL to configured ClickHouse", async () => {
    let receivedBody = "";
    let receivedUrl = "";

    const clickhouse = http.createServer((req, res) => {
      receivedUrl = req.url || "";
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      req.on("end", () => {
        receivedBody = Buffer.concat(chunks).toString("utf8");
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          meta: [{ name: "one", type: "UInt8" }],
          data: [{ one: 1 }],
          rows: 1,
          statistics: { elapsed: 0.001 },
        }));
      });
    });

    await new Promise<void>((resolve) => {
      clickhouse.listen(0, "127.0.0.1", () => resolve());
    });

    try {
      const address = clickhouse.address();
      if (!address || typeof address === "string") {
        throw new Error("Fake ClickHouse server did not bind to a TCP port");
      }
      process.env.CLICKHOUSE_HTTP_URL = `http://127.0.0.1:${address.port}`;

      const app = createApp({ accessToken: undefined });
      const res = await request(app)
        .post("/v0/sql")
        .send({ query: "select 1" });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([{ one: 1 }]);
      expect(res.body.meta.columns).toEqual([{ name: "one", type: "UInt8" }]);
      expect(res.body.meta.rows).toBe(1);
      expect(receivedBody).toBe("select 1");
      expect(receivedUrl).toContain("readonly=1");
      expect(receivedUrl).toContain("max_execution_time=5");
      expect(receivedUrl).toContain("max_result_rows=10000");
    } finally {
      await new Promise<void>((resolve) => {
        clickhouse.close(() => resolve());
      });
    }
  });
});
