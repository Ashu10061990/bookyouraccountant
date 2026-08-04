import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";
import { ERROR_CODES } from "@bya/shared";
import { AppError } from "../errors/app-error.js";

/**
 * Payments (Razorpay) — spec `docs/specs/2026-07-25-payments-slice.md`.
 *
 * ## Why a port
 *
 * Same shape as `helpers/crypto.helper.ts`'s `Cipher` and `integrations/storage.ts`'s
 * `StoragePort`: a narrow interface, a real adapter behind it (`razorpayGateway`,
 * added in P2), and a fail-loud fallback for when there is no configuration to
 * run the real adapter on. This slice has no feature consumer yet — the port
 * is infrastructure the assignment engine will call into later.
 *
 * Money is **integer paise** throughout (repo rule) — never a float rupee
 * amount, which cannot represent every paise value exactly.
 */

export interface CreateOrderInput {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}

export interface Order {
  id: string;
  amountPaise: number;
  status: string;
  notes: Record<string, string>;
}

export interface PaymentGateway {
  createOrder(input: CreateOrderInput): Promise<Order>;
  fetchOrder(orderId: string): Promise<Order>;
}

declare module "fastify" {
  interface FastifyInstance {
    /**
     * The payment gateway `app.ts` selected at boot — `unavailablePaymentGateway()`
     * until `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are both configured. Always
     * present once `buildApp` has run, the same composition-time decoration as
     * `storage`/`notifier`. No route reads it yet — the webhook handler (P3) and,
     * later, the assignment engine's order-create call are the seam this exists
     * for.
     */
    payments: PaymentGateway;
  }
}

/**
 * Reports whether two hex digests are equal, in constant time — and safely
 * when they are not even the same length.
 *
 * Compares the hex **strings** (their ASCII bytes), not the decoded bytes,
 * deliberately: `Buffer.from(hex, "hex")` silently drops a trailing odd
 * nibble, so decoding first would let a candidate like `<valid-digest>a`
 * (one extra char) decode to the same 32 bytes and wrongly verify. A SHA-256
 * hex digest is always 64 chars, so the length check rejects anything longer
 * or shorter (including that appended-char case) before the compare.
 *
 * `crypto.timingSafeEqual` throws `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` on
 * unequal-length buffers, so the length check MUST come first: a malformed or
 * truncated signature must fail verification, never crash the handler that
 * calls it (a webhook signature is attacker-controlled input).
 */
function hexDigestsMatch(expectedHex: string, candidateHex: string): boolean {
  if (candidateHex.length !== expectedHex.length) return false;

  const expected = Buffer.from(expectedHex, "utf8");
  const candidate = Buffer.from(candidateHex, "utf8");
  // Equal string length ⇒ equal buffer length ⇒ timingSafeEqual is safe.
  return timingSafeEqual(expected, candidate);
}

/**
 * The legacy checkout-callback signature check: HMAC-SHA256 of
 * `${orderId}|${paymentId}` under the key secret. Pure; constant-time.
 */
export function verifyPaymentSignature(
  secret: string,
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return hexDigestsMatch(expected, signature);
}

/**
 * The webhook signature check: HMAC-SHA256 of the **raw** request body under
 * the webhook secret. Pure; constant-time. Must run against the raw bytes,
 * not a re-serialized JSON object — re-serializing can change whitespace or
 * key order and silently invalidate every signature.
 */
export function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signature: string,
): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return hexDigestsMatch(expected, signature);
}

/**
 * The payment gateway used when Razorpay is not configured (`RAZORPAY_KEY_ID`
 * / `RAZORPAY_KEY_SECRET` unset). Every method fails loud with a 503.
 *
 * The alternative — an order-create that silently no-ops or returns a fake
 * order — would let a caller believe money is being collected when it is not.
 * Mirrors `unavailableStorage` in `integrations/storage.ts`.
 */
export function unavailablePaymentGateway(): PaymentGateway {
  const unavailable = (): never => {
    throw new AppError(503, ERROR_CODES.INTERNAL, "Payments are not configured on this server.");
  };

  return {
    createOrder: () => Promise.resolve(unavailable()),
    fetchOrder: () => Promise.resolve(unavailable()),
  };
}

/** `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — see `env.ts` for where these come from. */
export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
}

/**
 * The subset of Razorpay's order-response shape this adapter actually reads.
 *
 * The real SDK response (`Orders.RazorpayOrder`) carries ~20 fields — line
 * items, transfers, capture settings, tokens — this port exposes none of.
 * It also types `notes` as `{ [key: string]: string | number | null }`,
 * because the general Razorpay API accepts non-string note values, even
 * though this codebase only ever sends `Record<string, string>`
 * (`CreateOrderInput.notes`). Rather than couple `normalizeOrder` to that
 * wide surface, this names only the four fields it reads, and the SDK calls
 * below assert their result into this shape once, at the one place an
 * external type meets this codebase's own. Every read after that point is
 * checked against this interface exactly as if it were the SDK's declared
 * return type — nothing downstream is untyped, which is what "no `any`" is
 * actually guarding against.
 */
interface RazorpayOrderResponse {
  id: string;
  amount: number | string;
  status: string;
  notes?: Record<string, string>;
}

/**
 * Razorpay amounts are already integer paise (repo rule) — `Number(amount)`
 * only ever normalizes the SDK's `number | string` into `number`, never
 * converts a unit.
 */
function normalizeOrder(order: RazorpayOrderResponse): Order {
  return {
    id: order.id,
    amountPaise: Number(order.amount),
    status: order.status,
    notes: order.notes ?? {},
  };
}

/**
 * The real adapter, over the official `razorpay` SDK. One client is built
 * per adapter instance and reused across both methods — the same shape as
 * `s3Storage`'s `S3Client` in `integrations/storage.ts`. Unlike `jwtVerifier`
 * (`middlewares/auth.middleware.ts`) or `smtpEmail` (`integrations/notification-adapters.ts`),
 * which lazily import their SDKs to defer heavier or side-effecting
 * initialization, constructing `Razorpay(...)` does no I/O — it only stores
 * the given key id/secret — so there is nothing to gain by deferring it.
 */
export function razorpayGateway(config: RazorpayConfig): PaymentGateway {
  const client = new Razorpay({ key_id: config.keyId, key_secret: config.keySecret });

  return {
    async createOrder({ amountPaise, receipt, notes }): Promise<Order> {
      const order = await client.orders.create({
        amount: amountPaise,
        currency: "INR",
        receipt,
        notes,
      });
      return normalizeOrder(order as unknown as RazorpayOrderResponse);
    },

    async fetchOrder(orderId): Promise<Order> {
      const order = await client.orders.fetch(orderId);
      return normalizeOrder(order as unknown as RazorpayOrderResponse);
    },
  };
}
