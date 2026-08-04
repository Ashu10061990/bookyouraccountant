import type { FastifyInstance } from "fastify";
import { type Env } from "../config/env.js";
import { API_V1_PREFIX } from "../constants/index.js";
import { paymentsWebhookHandler } from "../controllers/payments.controller.js";

/**
 * HTTP surface for Razorpay — spec `docs/specs/2026-07-25-payments-slice.md`
 * (Webhook section).
 *
 * One route, deliberately **public**: the caller is authenticated by the HMAC
 * signature over the raw body, not a bearer token — see the handler in
 * `controllers/payments.controller.ts`. `app.ts` registers `fastify-raw-body`
 * scoped to exactly this route (`config: { rawBody: true }` below) so
 * `request.rawBody` is the untouched byte string Razorpay actually signed.
 */
export function registerPaymentRoutes(app: FastifyInstance, env: Env): void {
  app.post(
    `${API_V1_PREFIX}/payments/webhook`,
    { config: { rawBody: true } },
    paymentsWebhookHandler(env),
  );
}
