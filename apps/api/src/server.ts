import { buildApp } from "./app.js";
import { loadEnv } from "./platform/env.js";

/**
 * How long to wait for in-flight requests to finish before exiting anyway.
 *
 * Cloud Run sends SIGTERM and then hard-kills after its own grace period, so
 * this must stay shorter than that. Without a ceiling, one wedged connection
 * would hold the process open until the platform killed it — turning a clean
 * drain into exactly the dropped requests this handler exists to prevent.
 */
const SHUTDOWN_TIMEOUT_MS = 10_000;

const env = loadEnv();
const app = await buildApp({ env });

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  // A second signal during a drain must not start a second drain.
  if (shuttingDown) return;
  shuttingDown = true;

  app.log.info({ signal }, "shutting down");

  const forceExit = setTimeout(() => {
    app.log.error({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, "shutdown timed out, exiting anyway");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  // Do not let the timer itself hold the event loop open once the drain is done.
  forceExit.unref();

  try {
    // Stops accepting new connections, then waits for in-flight handlers.
    // Matters as soon as payment webhooks exist: dropping one mid-flight means
    // Razorpay records a delivery we never processed.
    await app.close();
    app.log.info("shutdown complete");
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, "error during shutdown");
    process.exit(1);
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (error) {
  app.log.error(error, "failed to start server");
  process.exit(1);
}
