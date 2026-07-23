import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { isApiErrorBody } from "@bya/shared";
import { buildApp } from "./app.js";
import { notFound } from "./platform/errors.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp({ logger: false });
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
  it("returns 200 and a status body", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
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
