import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertIndexes } from "../config/db.js";
import { buildTestApp } from "../test/app.js";
import { testEnv } from "../test/env.js";
import { clearTestMongo, startTestMongo, stopTestMongo } from "../test/mongo.js";
import { PaymentEventModel } from "../models/payment-event.model.js";

/**
 * `POST /v1/payments/webhook` — spec `docs/specs/2026-07-25-payments-slice.md`
 * (Webhook section), task P3. Against a real (in-memory) Mongo, exactly like
 * `payments.repository.test.ts`: the unique-index-backed idempotency
 * guarantee is only provable against a real duplicate-key error.
 *
 * `assertIndexes()` in `beforeAll` is load-bearing for the same reason it is
 * there: `connectDb` runs with `autoIndex: false`, so without this call the
 * redelivery test would pass for the wrong reason (no unique index to
 * violate) rather than the right one.
 */

const WEBHOOK_SECRET = "whsec_test";

/** Signs the exact raw string a test is about to send as `payload` — never a
 * re-serialized object, which is the one thing this route must never do. */
function signatureFor(rawBody: string): string {
  return createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
}

function headersFor(rawBody: string, eventId?: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-razorpay-signature": signatureFor(rawBody),
    ...(eventId === undefined ? {} : { "x-razorpay-event-id": eventId }),
  };
}

let app: FastifyInstance;

beforeAll(async () => {
  await startTestMongo();
  await assertIndexes();
  app = await buildTestApp(
    {},
    undefined,
    undefined,
    undefined,
    undefined,
    testEnv({ RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET }),
  );
}, 60_000);

afterAll(async () => {
  await app.close();
  await stopTestMongo();
});

beforeEach(async () => {
  await clearTestMongo();
});

describe("POST /v1/payments/webhook", () => {
  it("accepts a correctly-signed webhook and records exactly one row", async () => {
    const rawBody = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: { id: "pay_1", order_id: "order_1", amount: 150000, status: "captured" },
        },
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/v1/payments/webhook",
      headers: headersFor(rawBody, "evt_1"),
      payload: rawBody,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true });

    expect(await PaymentEventModel.countDocuments({ eventId: "evt_1" })).toBe(1);
    const row = await PaymentEventModel.findOne({ eventId: "evt_1" }).lean();
    expect(row).toMatchObject({
      eventId: "evt_1",
      type: "payment.captured",
      orderId: "order_1",
      paymentId: "pay_1",
      amountPaise: 150000,
      status: "captured",
    });
  });

  it("a redelivery of the same event id is still exactly one row, even with a different payload", async () => {
    const rawBody = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_2", status: "authorized" } } },
    });
    const first = await app.inject({
      method: "POST",
      url: "/v1/payments/webhook",
      headers: headersFor(rawBody, "evt_redelivery"),
      payload: rawBody,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ received: true });

    // Same event id, a superficially different body — a real Razorpay retry
    // can look like this. Idempotency is keyed on the event id alone.
    const redeliveredBody = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_2", status: "captured" } } },
    });
    const second = await app.inject({
      method: "POST",
      url: "/v1/payments/webhook",
      headers: headersFor(redeliveredBody, "evt_redelivery"),
      payload: redeliveredBody,
    });

    // MUST be 200, not an error — Razorpay retries anything but a 2xx, so
    // erroring a redelivery would turn "already recorded" into an infinite
    // retry loop instead of the no-op idempotency is meant to be.
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ received: true });

    expect(await PaymentEventModel.countDocuments({ eventId: "evt_redelivery" })).toBe(1);
    // The first write wins; the redelivery must not silently overwrite it.
    expect((await PaymentEventModel.findOne({ eventId: "evt_redelivery" }).lean())?.status).toBe(
      "authorized",
    );
  });

  it("rejects a bad signature with 400 and writes no row", async () => {
    const rawBody = JSON.stringify({ event: "payment.captured" });

    const res = await app.inject({
      method: "POST",
      url: "/v1/payments/webhook",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": "0".repeat(64),
        "x-razorpay-event-id": "evt_bad_signature",
      },
      payload: rawBody,
    });

    expect(res.statusCode).toBe(400);
    expect(await PaymentEventModel.countDocuments({ eventId: "evt_bad_signature" })).toBe(0);
  });

  it("rejects a missing signature header with 400 and writes no row", async () => {
    const rawBody = JSON.stringify({ event: "payment.captured" });

    const res = await app.inject({
      method: "POST",
      url: "/v1/payments/webhook",
      headers: { "content-type": "application/json", "x-razorpay-event-id": "evt_no_signature" },
      payload: rawBody,
    });

    expect(res.statusCode).toBe(400);
    expect(await PaymentEventModel.countDocuments({ eventId: "evt_no_signature" })).toBe(0);
  });

  it("rejects a missing event id header with 400, even with a valid signature", async () => {
    const rawBody = JSON.stringify({ event: "payment.captured" });

    const res = await app.inject({
      method: "POST",
      url: "/v1/payments/webhook",
      headers: headersFor(rawBody),
      payload: rawBody,
    });

    expect(res.statusCode).toBe(400);
    expect(await PaymentEventModel.countDocuments({})).toBe(0);
  });
});

describe("when no webhook secret is configured", () => {
  it("responds 503 rather than processing an unverifiable webhook", async () => {
    // Deliberately built with no RAZORPAY_WEBHOOK_SECRET, as a server that
    // never had a webhook registered in the Razorpay dashboard would be.
    const unconfigured = await buildTestApp();

    try {
      const rawBody = JSON.stringify({ event: "payment.captured" });
      const res = await unconfigured.inject({
        method: "POST",
        url: "/v1/payments/webhook",
        headers: {
          "content-type": "application/json",
          "x-razorpay-signature": "irrelevant",
          "x-razorpay-event-id": "evt_unconfigured",
        },
        payload: rawBody,
      });

      // 503, not a silent 200. Processing without a secret to check against
      // would mean accepting a payload signed by anyone, or no one.
      expect(res.statusCode).toBe(503);
      expect(await PaymentEventModel.countDocuments({ eventId: "evt_unconfigured" })).toBe(0);
    } finally {
      await unconfigured.close();
    }
  });
});
