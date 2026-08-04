import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import fastifyRawBody from "fastify-raw-body";
import { type Env, loadEnv } from "./config/env.js";
import { buildLoggerOptions } from "./config/logger.js";
import { RATE_LIMIT_TIME_WINDOW } from "./constants/index.js";
import { buildIntegrations, type IntegrationOverrides } from "./loaders/integrations.loader.js";
import { registerErrorHandler } from "./middlewares/error-handler.middleware.js";
import { registerRoutes } from "./routes/index.js";

export interface BuildAppOptions extends IntegrationOverrides {
  /** Disable in tests to keep output readable. */
  logger?: boolean;
  /**
   * Injected so tests never depend on the developer's shell environment.
   * Omitted in production, where the real environment is parsed and validated
   * once, here, at boot.
   */
  env?: Env;
  /** Randomness for the exam draw. Defaults to `Math.random`; seeded in tests. */
  examRng?: () => number;
}

/**
 * Builds a fully wired Fastify instance without binding a port, so tests can
 * drive it via `app.inject()`.
 *
 * This is the SLIM composition root: the integration wiring (which adapter is
 * live for storage/notifications/payments/KYC crypto/auth) lives in
 * `loaders/integrations.loader.ts`, and the route surface in
 * `routes/index.ts`. This file only assembles them.
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
  await app.register(rateLimit, { max: env.RATE_LIMIT_MAX, timeWindow: RATE_LIMIT_TIME_WINDOW });

  // See routes/payments.routes.ts for why raw bytes matter. Scoped to just
  // that route (`config: { rawBody: true }`); must precede any route
  // registration.
  await app.register(fastifyRawBody, { field: "rawBody", global: false, runFirst: true });

  registerErrorHandler(app);

  const { auth, cipher, storage, payments, notifier } = buildIntegrations(env, options);

  // Decorated onto the instance so every route reads it from exactly one
  // place: `registerUploadRoutes` consumes it as `request.server.storage`
  // for `POST /v1/uploads/presign`. This composition root is the only place
  // that decides which storage backend is live.
  app.decorate("storage", storage);

  // Payments has no route consumer yet (spec: "honest scope"); decorating it
  // now is the seam P3's webhook route and, later, the assignment engine
  // read from.
  app.decorate("payments", payments);

  // Decorated for the same reason `storage` is: a single place every future
  // caller reads it from. N3 wires `accountant_verified` into the
  // accountants service by injecting `app.notifier` where routes are
  // registered — no route yet reads it from here in N2.
  app.decorate("notifier", notifier);

  registerRoutes(app, {
    env,
    auth,
    cipher,
    examRng: options.examRng ?? Math.random,
    now: options.now ?? (() => new Date()),
  });

  return app;
}
