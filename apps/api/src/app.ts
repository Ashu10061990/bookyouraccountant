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
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? true,
    // Trust the proxy so rate limiting sees the real client IP on Cloud Run.
    trustProxy: true,
    disableRequestLogging: false,
  });

  void app.register(helmet);
  void app.register(cors, {
    origin: (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173").split(","),
    credentials: true,
  });
  void app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  registerErrorHandler(app);

  app.get("/health", () => ({ status: "ok" }));

  return app;
}
