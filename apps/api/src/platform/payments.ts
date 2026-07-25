import { createHmac, timingSafeEqual } from "node:crypto";
import { ERROR_CODES } from "@bya/shared";
import { AppError } from "./errors.js";

/**
 * Payments (Razorpay) — spec `docs/specs/2026-07-25-payments-slice.md`.
 *
 * ## Why a port
 *
 * Same shape as `platform/crypto.ts`'s `Cipher` and `platform/storage.ts`'s
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

/**
 * Decodes two hex strings and reports whether they are byte-for-byte equal,
 * in constant time — and safely when they are not even the same length.
 *
 * `crypto.timingSafeEqual` throws `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` when
 * given buffers of different byte length, so the length check here MUST
 * happen first: a malformed or truncated signature must fail verification,
 * never crash the request handler that calls it (a webhook signature is
 * attacker-controlled input).
 */
function hexDigestsMatch(expectedHex: string, candidateHex: string): boolean {
  const expected = Buffer.from(expectedHex, "hex");
  const candidate = Buffer.from(candidateHex, "hex");

  if (expected.length !== candidate.length) return false;
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
 * Mirrors `unavailableStorage` in `platform/storage.ts`.
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
