import { ERROR_CODES } from "@bya/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { type Env } from "../../platform/env.js";
import { AppError, badRequest } from "../../platform/errors.js";
import { verifyWebhookSignature } from "../../platform/payments.js";
import { parseBody } from "../../platform/validate.js";
import { recordEventOnce } from "./payments.repository.js";

/**
 * HTTP surface for Razorpay — spec `docs/specs/2026-07-25-payments-slice.md`
 * (Webhook section).
 *
 * One route, and it is deliberately **public**: the caller is authenticated by
 * the HMAC signature over the raw body, not a bearer token — there is no user
 * identity on a webhook delivery, only Razorpay's own shared secret. That
 * signature check IS the auth, which is why it must run before anything else
 * this handler does.
 *
 * `app.ts` registers `fastify-raw-body` scoped to exactly this route
 * (`config: { rawBody: true }`, see below) so `request.rawBody` is the
 * untouched byte string Razorpay actually signed. Verifying over
 * `JSON.stringify(request.body)` instead would silently break the moment
 * Fastify's JSON parser re-serializes with different whitespace or key
 * order than what was sent — this route never does that.
 */

/**
 * The subset of a Razorpay webhook body this route reads. Real payloads carry
 * ~20 fields per entity (tokens, transfers, capture settings, ...) — this
 * names only the four this codebase's durable record keeps. `payment` and
 * `order` are both optional and can each be present, absent, or (for events
 * like `order.paid`) both at once, so every field is read defensively rather
 * than assumed present; `parseBody` still enforces that `event` itself is a
 * string, since `recordEventOnce` requires a `type`.
 */
const razorpayEntitySchema = z.object({
  id: z.string().optional(),
  order_id: z.string().optional(),
  amount: z.number().optional(),
  status: z.string().optional(),
});

const webhookBodySchema = z.object({
  event: z.string(),
  payload: z
    .object({
      payment: z.object({ entity: razorpayEntitySchema.optional() }).optional(),
      order: z.object({ entity: razorpayEntitySchema.optional() }).optional(),
    })
    .optional(),
});

/** Fastify normalizes header names to lowercase but types them as possibly
 * repeated (`string[]`) — a webhook header is never sent twice, so anything
 * other than a single string is treated the same as absent. */
function headerString(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function registerPaymentRoutes(app: FastifyInstance, env: Env): void {
  app.post("/v1/payments/webhook", { config: { rawBody: true } }, async (request, reply) => {
    // Never process without a secret configured — the alternative (accepting
    // a payload with nothing to verify it against) is exactly the
    // silent-unsafe-default this codebase's other `unavailable*` gates
    // (`unavailableCipher`, `unavailableStorage`, `unavailablePaymentGateway`)
    // refuse to allow.
    if (env.RAZORPAY_WEBHOOK_SECRET === undefined) {
      throw new AppError(
        503,
        ERROR_CODES.INTERNAL,
        "Payments webhook is not configured on this server.",
      );
    }

    // The signature IS the authentication. `rawBody` is typed `string |
    // Buffer | undefined` (the plugin also supports a Buffer encoding this
    // codebase never selects) — requiring `typeof === "string"` here both
    // confirms the raw-body capture actually ran for this route and rejects
    // the Buffer case in the same guard, rather than trusting either.
    const signature = headerString(request.headers["x-razorpay-signature"]);
    const rawBody = request.rawBody;
    if (
      typeof rawBody !== "string" ||
      signature === undefined ||
      !verifyWebhookSignature(env.RAZORPAY_WEBHOOK_SECRET, rawBody, signature)
    ) {
      throw badRequest("Invalid webhook signature.");
    }

    // The idempotency key. Razorpay assigns a fresh id per delivery attempt
    // and retries on anything but a 2xx, so this is what `recordEventOnce`'s
    // unique index keys a redelivery off of.
    const eventId = headerString(request.headers["x-razorpay-event-id"]);
    if (eventId === undefined) {
      throw badRequest("Missing event id.");
    }

    const body = parseBody(webhookBodySchema, request.body);
    const paymentEntity = body.payload?.payment?.entity;
    const orderEntity = body.payload?.order?.entity;

    // `payment.entity.order_id` links a payment back to its order;
    // `order.entity.id` is the order's own id — either can be the only one
    // present depending on the event type, so an order id read falls back
    // from one to the other rather than assuming a specific event shape.
    const orderId = paymentEntity?.order_id ?? orderEntity?.id;
    const paymentId = paymentEntity?.id;
    const amountPaise = paymentEntity?.amount ?? orderEntity?.amount;
    const status = paymentEntity?.status ?? orderEntity?.status;

    const { firstTime } = await recordEventOnce({
      eventId,
      type: body.event,
      ...(orderId === undefined ? {} : { orderId }),
      ...(paymentId === undefined ? {} : { paymentId }),
      ...(amountPaise === undefined ? {} : { amountPaise }),
      ...(status === undefined ? {} : { status }),
    });

    // Acting on a first-time event (minting a paid assignment) is a
    // documented TODO for the assignment engine slice — for now the recorded
    // row IS the durable record, so both branches respond identically.
    // Whether firstTime or not, this MUST be 200: Razorpay retries any
    // non-2xx response, so erroring a redelivery would turn "already
    // recorded, no-op" into an infinite retry loop instead of ending it.
    request.log.info(
      { eventId, type: body.event, firstTime },
      firstTime ? "razorpay webhook recorded" : "razorpay webhook redelivery ignored",
    );

    return reply.status(200).send({ received: true });
  });
}
