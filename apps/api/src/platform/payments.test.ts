import { createHmac } from "node:crypto";
import { ERROR_CODES } from "@bya/shared";
import { describe, expect, it } from "vitest";
import {
  unavailablePaymentGateway,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from "./payments.js";

/**
 * Known-good vectors computed here with the same `crypto` primitives the
 * implementation uses — spec `docs/specs/2026-07-25-payments-slice.md` (P1):
 * "tested with known-good vectors computed in the test via crypto".
 */
const SECRET = "test-key-secret";
const OTHER_SECRET = "a-different-secret";
const ORDER_ID = "order_abc123";
const PAYMENT_ID = "pay_xyz789";

function paymentSignatureFor(secret: string, orderId: string, paymentId: string): string {
  return createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

/** Flips the last hex character so the signature is wrong but still well-formed. */
function tamper(hex: string): string {
  return hex.slice(0, -1) + (hex.endsWith("0") ? "1" : "0");
}

describe("verifyPaymentSignature", () => {
  it("verifies a correctly computed signature", () => {
    const signature = paymentSignatureFor(SECRET, ORDER_ID, PAYMENT_ID);
    expect(verifyPaymentSignature(SECRET, ORDER_ID, PAYMENT_ID, signature)).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const signature = tamper(paymentSignatureFor(SECRET, ORDER_ID, PAYMENT_ID));
    expect(verifyPaymentSignature(SECRET, ORDER_ID, PAYMENT_ID, signature)).toBe(false);
  });

  it("rejects a wrong-length signature and does not throw", () => {
    // node:crypto's timingSafeEqual throws on unequal-length buffers — that
    // must never surface as a 500, so the length mismatch has to be caught
    // before timingSafeEqual is ever called.
    expect(() => verifyPaymentSignature(SECRET, ORDER_ID, PAYMENT_ID, "abc")).not.toThrow();
    expect(verifyPaymentSignature(SECRET, ORDER_ID, PAYMENT_ID, "abc")).toBe(false);
  });

  it("rejects the empty string without throwing", () => {
    expect(() => verifyPaymentSignature(SECRET, ORDER_ID, PAYMENT_ID, "")).not.toThrow();
    expect(verifyPaymentSignature(SECRET, ORDER_ID, PAYMENT_ID, "")).toBe(false);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const signature = paymentSignatureFor(OTHER_SECRET, ORDER_ID, PAYMENT_ID);
    expect(verifyPaymentSignature(SECRET, ORDER_ID, PAYMENT_ID, signature)).toBe(false);
  });

  it("rejects a signature computed for a different order/payment pair", () => {
    const signature = paymentSignatureFor(SECRET, ORDER_ID, PAYMENT_ID);
    expect(verifyPaymentSignature(SECRET, ORDER_ID, "pay_someone_else", signature)).toBe(false);
  });
});

describe("verifyWebhookSignature", () => {
  const RAW_BODY = JSON.stringify({ event: "payment.captured", payload: { id: "evt_1" } });

  function webhookSignatureFor(secret: string, rawBody: string): string {
    return createHmac("sha256", secret).update(rawBody).digest("hex");
  }

  it("verifies a correctly computed signature", () => {
    const signature = webhookSignatureFor(SECRET, RAW_BODY);
    expect(verifyWebhookSignature(SECRET, RAW_BODY, signature)).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const signature = tamper(webhookSignatureFor(SECRET, RAW_BODY));
    expect(verifyWebhookSignature(SECRET, RAW_BODY, signature)).toBe(false);
  });

  it("rejects a wrong-length signature and does not throw", () => {
    expect(() => verifyWebhookSignature(SECRET, RAW_BODY, "abc")).not.toThrow();
    expect(verifyWebhookSignature(SECRET, RAW_BODY, "abc")).toBe(false);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const signature = webhookSignatureFor(OTHER_SECRET, RAW_BODY);
    expect(verifyWebhookSignature(SECRET, RAW_BODY, signature)).toBe(false);
  });

  it("rejects a tampered raw body even against an otherwise-valid signature", () => {
    const signature = webhookSignatureFor(SECRET, RAW_BODY);
    expect(verifyWebhookSignature(SECRET, `${RAW_BODY}tampered`, signature)).toBe(false);
  });
});

describe("unavailablePaymentGateway", () => {
  it("createOrder rejects with a 503 AppError", async () => {
    const gateway = unavailablePaymentGateway();

    await expect(async () =>
      gateway.createOrder({ amountPaise: 150000, receipt: "receipt-1", notes: {} }),
    ).rejects.toMatchObject({
      status: 503,
      code: ERROR_CODES.INTERNAL,
      message: "Payments are not configured on this server.",
    });
  });

  it("fetchOrder rejects with a 503 AppError", async () => {
    const gateway = unavailablePaymentGateway();

    await expect(async () => gateway.fetchOrder("order_abc123")).rejects.toMatchObject({
      status: 503,
      code: ERROR_CODES.INTERNAL,
      message: "Payments are not configured on this server.",
    });
  });
});
