import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { type AuthDeps, firebaseVerifier } from "./platform/auth.js";
import { isConnected } from "./platform/db.js";
import { type Env, loadEnv } from "./platform/env.js";
import { registerErrorHandler } from "./platform/error-handler.js";
import { buildLoggerOptions } from "./platform/logger.js";
import { registerConfigRoutes } from "./modules/config/config.routes.js";
import { registerLeadRoutes } from "./modules/leads/leads.routes.js";
import { registerServiceRoutes } from "./modules/services/services.routes.js";
import { registerUserRoutes } from "./modules/users/users.routes.js";
import { findAuthUser } from "./modules/users/users.repository.js";

export interface BuildAppOptions {
  /** Disable in tests to keep output readable. */
  logger?: boolean;
  /**
   * Injected so tests never depend on the developer's shell environment.
   * Omitted in production, where the real environment is parsed and validated
   * once, here, at boot.
   */
  env?: Env;
  /**
   * Injected so tests run with no Firebase credentials. In production the
   * defaults are the real Firebase verifier and the real users repository.
   */
  auth?: AuthDeps;
}

/**
 * Builds a fully wired Fastify instance without binding a port, so tests can
 * drive it via `app.inject()`.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = options.env ?? loadEnv();

  const app = Fastify({
    // Redaction is configured centrally in buildLoggerOptions and verified by
    // logger.test.ts. Never construct a logger for this app any other way —
    // a bare `logger: true` here would log PII in plaintext.
    logger: options.logger === false ? false : buildLoggerOptions(env),
    // Trust exactly ONE proxy hop (Cloud Run's load balancer). `true` would
    // trust the whole X-Forwarded-For chain, letting a client spoof its own IP
    // and walk straight past IP-keyed rate limiting.
    trustProxy: 1,
    // Fastify's default request id is a per-process counter, so two instances
    // both emit "req-1". A UUID keeps ids correlatable across instances.
    genReqId: () => randomUUID(),
  });

  // These MUST be awaited. `void app.register(...)` returns before the plugin
  // attaches its hooks, so any route registered afterwards is never covered by
  // it — rate limiting silently does nothing. `no-floating-promises` does not
  // catch this, because `void` is exactly how you satisfy that rule.
  await app.register(helmet);
  await app.register(cors, {
    origin: env.ALLOWED_ORIGINS,
    credentials: true,
  });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  registerErrorHandler(app);

  // Collected from Fastify's own route table rather than hand-listed, so the
  // index at `/` cannot drift out of date as routes are added or renamed.
  // Registered before any route, since onRoute only fires for later ones.
  const routes: { method: string; url: string }[] = [];
  app.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      // HEAD is auto-generated alongside every GET; listing both is noise.
      if (method !== "HEAD") routes.push({ method, url: route.url });
    }
  });

  // Firebase stays the identity provider (spec §2): only data moves to Atlas.
  // The role, however, always comes from Mongo — see platform/auth.ts.
  const auth: AuthDeps = options.auth ?? {
    verifier: firebaseVerifier(env.FIREBASE_PROJECT_ID),
    userLookup: findAuthUser,
  };

  /**
   * Liveness and readiness in one.
   *
   * This deliberately reports the database, and returns 503 when it is not
   * connected. The previous version returned `{ status: "ok" }` unconditionally
   * — so a server that had never opened a database connection looked perfectly
   * healthy to a load balancer, which would then route real traffic to it. It
   * was a check that could not fail, which is the same as no check.
   */
  app.get("/health", (_request, reply) => {
    const connected = isConnected();

    return reply.status(connected ? 200 : 503).send({
      status: connected ? "ok" : "degraded",
      database: connected ? "connected" : "disconnected",
    });
  });

  registerServiceRoutes(app, auth);
  registerUserRoutes(app, auth);
  registerLeadRoutes(app, auth);
  registerConfigRoutes(app, auth);

  /**
   * A self-describing index, so hitting the root of the API tells you what it
   * serves instead of a bare 404.
   *
   * Public, like `/health`. It lists paths, not data — and every one of those
   * paths carries its own guard, so naming them grants nothing. Registered
   * last, so `routes` is fully populated by the time this closure runs.
   */
  app.get("/", () => ({
    name: "BookYourAccountant API",
    endpoints: [...routes].sort(
      (a, b) => a.url.localeCompare(b.url) || a.method.localeCompare(b.method),
    ),
  }));

  return app;
}
