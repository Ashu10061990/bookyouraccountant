import rateLimit from "@fastify/rate-limit";
import { ERROR_CODES } from "@bya/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { registerErrorHandler, statusToCode } from "./error-handler.middleware.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/**
 * Builds an app whose route throws a plain (non-`AppError`) error carrying a
 * statusCode — exactly what @fastify/* plugins and schema validation throw.
 */
async function appThrowing(statusCode: number, message: string): Promise<FastifyInstance> {
  const instance = Fastify({ logger: false });
  // registerErrorHandler rate-limits its own 404 handler, so the plugin has to
  // be attached first. Awaited, never `void`-ed — see the Phase 1 defect.
  await instance.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  registerErrorHandler(instance);
  instance.get("/__throws", () => {
    const error = Object.assign(new Error(message), { statusCode });
    throw error;
  });
  await instance.ready();
  return instance;
}

describe("statusToCode", () => {
  it.each([
    [401, ERROR_CODES.UNAUTHENTICATED],
    [403, ERROR_CODES.FORBIDDEN],
    [404, ERROR_CODES.NOT_FOUND],
    [409, ERROR_CODES.CONFLICT],
    [429, ERROR_CODES.RATE_LIMITED],
  ])("maps %i to %s", (status, expected) => {
    expect(statusToCode(status)).toBe(expected);
  });

  it("falls back to BAD_REQUEST for an unmapped 4xx", () => {
    expect(statusToCode(422)).toBe(ERROR_CODES.BAD_REQUEST);
    expect(statusToCode(400)).toBe(ERROR_CODES.BAD_REQUEST);
  });

  it("maps any 5xx to INTERNAL", () => {
    expect(statusToCode(500)).toBe(ERROR_CODES.INTERNAL);
    expect(statusToCode(503)).toBe(ERROR_CODES.INTERNAL);
  });
});

describe("plugin-thrown errors carry the right stable code", () => {
  // The API contract tells clients to branch on `code`, never on status. While
  // every plugin-thrown 4xx reported BAD_REQUEST, a client could not tell
  // "you are not signed in" from "your request was malformed" — and the first
  // needs a login redirect while the second must never trigger one.
  it("reports a plugin 401 as UNAUTHENTICATED, not BAD_REQUEST", async () => {
    app = await appThrowing(401, "missing authorization header");
    const res = await app.inject({ method: "GET", url: "/__throws" });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: ERROR_CODES.UNAUTHENTICATED } });
  });

  it("reports a plugin 403 as FORBIDDEN", async () => {
    app = await appThrowing(403, "insufficient scope");
    const res = await app.inject({ method: "GET", url: "/__throws" });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: ERROR_CODES.FORBIDDEN } });
  });

  it("reports a plugin 409 as CONFLICT", async () => {
    app = await appThrowing(409, "duplicate key");
    const res = await app.inject({ method: "GET", url: "/__throws" });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: ERROR_CODES.CONFLICT } });
  });

  it("never forwards the plugin's own message, which can echo request content", async () => {
    app = await appThrowing(401, "token eyJhbGciOi.secret.sig was rejected");
    const res = await app.inject({ method: "GET", url: "/__throws" });

    expect(res.payload).not.toContain("secret");
  });
});
