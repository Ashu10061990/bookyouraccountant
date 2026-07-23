import rateLimit from "@fastify/rate-limit";
import { ERROR_CODES } from "@bya/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { type AuthDeps, contextOf, requireAuth, requireRole } from "./auth.js";
import { registerErrorHandler } from "./error-handler.js";
import { bearer, fakeUserLookup, fakeVerifier, tokenFor, userWithRole } from "../test/auth-fake.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

const DEFAULT_DEPS: AuthDeps = {
  verifier: fakeVerifier({
    "token-business": tokenFor("uid-business"),
    "token-accountant": tokenFor("uid-accountant"),
    "token-admin": tokenFor("uid-admin"),
    "token-ghost": tokenFor("uid-with-no-record"),
    "token-blocked": tokenFor("uid-blocked"),
  }),
  userLookup: fakeUserLookup({
    "uid-business": userWithRole("business"),
    "uid-accountant": userWithRole("accountant"),
    "uid-admin": userWithRole("admin"),
    "uid-blocked": userWithRole("business", true),
  }),
};

async function buildAuthApp(deps: AuthDeps = DEFAULT_DEPS): Promise<FastifyInstance> {
  const instance = Fastify({ logger: false });
  await instance.register(rateLimit, { max: 1000, timeWindow: "1 minute" });
  registerErrorHandler(instance);

  instance.get("/__me", { preHandler: requireAuth(deps) }, (request) => contextOf(request));

  instance.get("/__admin-only", { preHandler: [requireAuth(deps), requireRole("admin")] }, () => ({
    ok: true,
  }));

  instance.get(
    "/__staff",
    { preHandler: [requireAuth(deps), requireRole("admin", "accountant")] },
    () => ({ ok: true }),
  );

  // Deliberately misconfigured: a role guard with no authentication in front.
  instance.get("/__misconfigured", { preHandler: [requireRole("admin")] }, () => ({ ok: true }));

  await instance.ready();
  return instance;
}

describe("requireAuth", () => {
  it("rejects a request with no Authorization header", async () => {
    app = await buildAuthApp();
    const res = await app.inject({ method: "GET", url: "/__me" });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: ERROR_CODES.UNAUTHENTICATED } });
  });

  it.each([
    ["not a bearer scheme", "Basic dXNlcjpwYXNz"],
    ["bearer with no token", "Bearer "],
    ["bare token, no scheme", "token-business"],
    ["empty header", ""],
  ])("rejects a malformed Authorization header: %s", async (_label, header) => {
    app = await buildAuthApp();
    const res = await app.inject({
      method: "GET",
      url: "/__me",
      headers: { authorization: header },
    });

    expect(res.statusCode).toBe(401);
  });

  it("rejects a token the verifier does not recognise", async () => {
    app = await buildAuthApp();
    const res = await app.inject({
      method: "GET",
      url: "/__me",
      headers: bearer("forged-token"),
    });

    expect(res.statusCode).toBe(401);
  });

  // The verifier's own message names why a token failed — "invalid signature",
  // "expired", "wrong audience". Forwarding that gives an attacker a free
  // oracle for probing token forgery.
  it("never echoes the verifier's reason to the client", async () => {
    app = await buildAuthApp();
    const res = await app.inject({
      method: "GET",
      url: "/__me",
      headers: bearer("forged-token"),
    });

    expect(res.payload).not.toContain("signature");
    expect(res.payload).not.toContain("Firebase");
  });

  it("rejects a valid token for a uid with no user record", async () => {
    app = await buildAuthApp();
    const res = await app.inject({ method: "GET", url: "/__me", headers: bearer("token-ghost") });

    expect(res.statusCode).toBe(401);
  });

  it("rejects a blocked user with PROFILE_BLOCKED, not a generic 403", async () => {
    app = await buildAuthApp();
    const res = await app.inject({ method: "GET", url: "/__me", headers: bearer("token-blocked") });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: ERROR_CODES.PROFILE_BLOCKED } });
  });

  it("populates the context from the token and the database", async () => {
    app = await buildAuthApp();
    const res = await app.inject({
      method: "GET",
      url: "/__me",
      headers: bearer("token-business"),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ uid: "uid-business", role: "business", blocked: false });
  });
});

describe("role is read from the database, never from the token", () => {
  // The attack this prevents: Firebase custom claims are baked into a token
  // valid for an hour. Demote an admin and their existing token still carries
  // role: admin, and still verifies perfectly. If the API trusted the claim,
  // a revoked admin would keep admin access for up to an hour — including
  // through the payout and dispute-override endpoints.
  it("denies a stale admin claim when the database says otherwise", async () => {
    app = await buildAuthApp({
      verifier: fakeVerifier({
        "token-demoted": tokenFor("uid-demoted", { role: "admin", admin: true }),
      }),
      // The record of truth: they are a business user now.
      userLookup: fakeUserLookup({ "uid-demoted": userWithRole("business") }),
    });

    const res = await app.inject({
      method: "GET",
      url: "/__admin-only",
      headers: bearer("token-demoted"),
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: ERROR_CODES.FORBIDDEN } });
  });

  it("grants access when the database says admin, regardless of claims", async () => {
    app = await buildAuthApp({
      verifier: fakeVerifier({
        "token-real-admin": tokenFor("uid-real-admin", { role: "business" }),
      }),
      userLookup: fakeUserLookup({ "uid-real-admin": userWithRole("admin") }),
    });

    const res = await app.inject({
      method: "GET",
      url: "/__admin-only",
      headers: bearer("token-real-admin"),
    });

    expect(res.statusCode).toBe(200);
  });
});

describe("requireRole", () => {
  it("allows the matching role", async () => {
    app = await buildAuthApp();
    const res = await app.inject({
      method: "GET",
      url: "/__admin-only",
      headers: bearer("token-admin"),
    });

    expect(res.statusCode).toBe(200);
  });

  it("denies a non-matching role with FORBIDDEN", async () => {
    app = await buildAuthApp();
    const res = await app.inject({
      method: "GET",
      url: "/__admin-only",
      headers: bearer("token-business"),
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: ERROR_CODES.FORBIDDEN } });
  });

  it("denies an unauthenticated caller before it reaches the role check", async () => {
    app = await buildAuthApp();
    const res = await app.inject({ method: "GET", url: "/__admin-only" });

    expect(res.statusCode).toBe(401);
  });

  it("accepts any one of several allowed roles", async () => {
    app = await buildAuthApp();

    for (const token of ["token-admin", "token-accountant"]) {
      const res = await app.inject({ method: "GET", url: "/__staff", headers: bearer(token) });
      expect(res.statusCode).toBe(200);
    }

    const denied = await app.inject({
      method: "GET",
      url: "/__staff",
      headers: bearer("token-business"),
    });
    expect(denied.statusCode).toBe(403);
  });

  // A route that wires requireRole without requireAuth is a mistake someone
  // will make. It must fail closed. Defaulting to allow would turn a wiring
  // slip into an open admin endpoint.
  it("fails closed when the route forgot requireAuth", async () => {
    app = await buildAuthApp();
    const res = await app.inject({
      method: "GET",
      url: "/__misconfigured",
      headers: bearer("token-admin"),
    });

    expect(res.statusCode).toBe(401);
  });
});
