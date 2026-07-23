import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { registerErrorHandler } from "./platform/error-handler.js";

export interface BuildAppOptions {
  /** Disable in tests to keep output readable. */
  logger?: boolean;
}

/**
 * Builds a fully wired Fastify instance without binding a port, so tests can
 * drive it via `app.inject()`.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
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
    origin: (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173").split(","),
    credentials: true,
  });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  registerErrorHandler(app);

  app.get("/health", () => ({ status: "ok" }));

  return app;
}
