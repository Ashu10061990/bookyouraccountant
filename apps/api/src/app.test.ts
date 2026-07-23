import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { isApiErrorBody } from "@bya/shared";
import { buildApp } from "./app.js";
import { registerErrorHandler } from "./platform/error-handler.js";
import { notFound } from "./platform/errors.js";
import { testEnv } from "./test/env.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ logger: false, env: testEnv() });
  // Test-only routes exercising both error paths.
  app.get("/__boom", () => {
    throw notFound("Assignment not found");
  });
  app.get("/__unexpected", () => {
    throw new Error("database exploded with secret connection string");
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("GET /health", () => {
  // This file starts no database, so the honest answer is "degraded".
  //
  // The route used to return `{ status: "ok" }` unconditionally, which meant a
  // server that had never opened a database connection looked healthy to a load
  // balancer — and the load balancer would route real traffic to it. That is
  // exactly what happened: `server.ts` was missing its `connectDb()` call, the
  // whole suite stayed green, and only booting the built artifact revealed it.
  it("reports 503 when the database is not connected", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "degraded", database: "disconnected" });
  });
});

describe("GET /", () => {
  it("describes the API instead of returning a bare 404", async () => {
    const res = await app.inject({ method: "GET", url: "/" });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ name: string }>().name).toBe("BookYourAccountant API");
  });

  // Built from Fastify's route table, not a hand-written list, so a new route
  // appears here automatically and a renamed one cannot leave a stale entry
  // behind. The alternative — a literal array — is wrong the first time someone
  // adds an endpoint and forgets.
  it("lists every registered route, derived from the router itself", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    const { endpoints } = res.json<{ endpoints: { method: string; url: string }[] }>();

    const urls = endpoints.map((e) => e.url);
    for (const expected of [
      "/health",
      "/v1/services",
      "/v1/users",
      "/v1/users/me",
      "/v1/leads",
      "/v1/leads/me",
      "/v1/config/:name",
    ]) {
      expect(urls, `missing ${expected}`).toContain(expected);
    }

    // The test-only routes this file registers after buildApp() prove the
    // collection is live rather than a snapshot taken at build time.
    expect(urls).toContain("/__boom");
  });

  it("omits the HEAD entries Fastify generates alongside every GET", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    const { endpoints } = res.json<{ endpoints: { method: string }[] }>();

    expect(endpoints.some((e) => e.method === "HEAD")).toBe(false);
  });
});

describe("error handler", () => {
  it("maps an AppError to its status and code", async () => {
    const res = await app.inject({ method: "GET", url: "/__boom" });
    expect(res.statusCode).toBe(404);
    const body: unknown = res.json();
    expect(isApiErrorBody(body)).toBe(true);
    expect((body as { error: { code: string } }).error.code).toBe("NOT_FOUND");
    expect((body as { error: { message: string } }).error.message).toBe("Assignment not found");
  });

  it("includes a requestId on every error", async () => {
    const res = await app.inject({ method: "GET", url: "/__boom" });
    const raw: unknown = res.json();
    const body = raw as { error: { requestId: string } };
    expect(body.error.requestId).toBeTruthy();
  });

  it("never leaks internals from an unexpected error", async () => {
    const res = await app.inject({ method: "GET", url: "/__unexpected" });
    expect(res.statusCode).toBe(500);
    const raw: unknown = res.json();
    const body = raw as { error: { code: string; message: string } };
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.message).toBe("Something went wrong.");
    expect(res.payload).not.toContain("secret connection string");
  });

  it("returns the error shape for an unmatched route", async () => {
    const res = await app.inject({ method: "GET", url: "/does-not-exist" });
    expect(res.statusCode).toBe(404);
    expect(isApiErrorBody(res.json())).toBe(true);
  });
});

describe("rate limiting", () => {
  it("rate limits the instance returned by buildApp() itself", async () => {
    // Regression guard: the previous Critical shipped because `void
    // app.register(rateLimit, ...)` doesn't attach before routes are
    // registered. Both other tests here build their own Fastify instance and
    // would stay green even if that regressed, so this asserts directly
    // against the shared `app` built via `buildApp()` in this file's
    // `beforeAll`.
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-ratelimit-limit"]).toBeTruthy();
  });

  // Uses a separate, deliberately tiny-limit instance so the test is fast and
  // does not disturb the shared `app` (whose real limit is 100/minute).
  async function buildTinyLimitApp(): Promise<FastifyInstance> {
    const tinyApp = Fastify({ logger: false });
    await tinyApp.register(rateLimit, { max: 2, timeWindow: "1 minute" });
    registerErrorHandler(tinyApp);
    tinyApp.get("/__limited", () => ({ ok: true }));
    await tinyApp.ready();
    return tinyApp;
  }

  it("returns 429 once the limit is exceeded", async () => {
    const tinyApp = await buildTinyLimitApp();
    try {
      await tinyApp.inject({ method: "GET", url: "/__limited" });
      await tinyApp.inject({ method: "GET", url: "/__limited" });
      const third = await tinyApp.inject({ method: "GET", url: "/__limited" });
      expect(third.statusCode).toBe(429);
    } finally {
      await tinyApp.close();
    }
  });

  it("reports the 429 in the project's error wire shape", async () => {
    const tinyApp = await buildTinyLimitApp();
    try {
      await tinyApp.inject({ method: "GET", url: "/__limited" });
      await tinyApp.inject({ method: "GET", url: "/__limited" });
      const third = await tinyApp.inject({ method: "GET", url: "/__limited" });
      const body: unknown = third.json();
      expect(isApiErrorBody(body)).toBe(true);
      expect((body as { error: { code: string } }).error.code).toBe("RATE_LIMITED");
    } finally {
      await tinyApp.close();
    }
  });
});
