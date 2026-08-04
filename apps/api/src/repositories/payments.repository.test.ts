import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertIndexes } from "../config/db.js";
import { clearTestMongo, startTestMongo, stopTestMongo } from "../test/mongo.js";
import { recordEventOnce } from "./payments.repository.js";
import { PaymentEventModel } from "../models/payment-event.model.js";

/**
 * `recordEventOnce` against a real (in-memory) Mongo — spec
 * `docs/specs/2026-07-25-payments-slice.md` (Webhook section): the unique
 * index on `eventId` is what makes a redelivered webhook a no-op, and that
 * can only be proven against a real duplicate-key error, not a mock.
 *
 * `assertIndexes()` in `beforeAll` is load-bearing, exactly as in
 * `exams.test.ts`: `connectDb` sets `autoIndex: false`, so without this call
 * the unique index never gets built and every "second insert" below would
 * simply succeed instead of hitting E11000 — see `db.test.ts` for the proof
 * that omitting it changes the outcome.
 */

beforeAll(async () => {
  await startTestMongo();
  await assertIndexes();
}, 60_000);

afterAll(async () => {
  await stopTestMongo();
});

beforeEach(async () => {
  await clearTestMongo();
});

describe("recordEventOnce", () => {
  it("records a new event and reports it as the first time", async () => {
    const result = await recordEventOnce({ eventId: "evt_1", type: "payment.captured" });

    expect(result).toEqual({ firstTime: true });
    expect(await PaymentEventModel.countDocuments({ eventId: "evt_1" })).toBe(1);
  });

  it("stores the optional order/payment/amount/status fields when given", async () => {
    await recordEventOnce({
      eventId: "evt_2",
      type: "payment.captured",
      orderId: "order_1",
      paymentId: "pay_1",
      amountPaise: 150000,
      status: "captured",
    });

    const row = await PaymentEventModel.findOne({ eventId: "evt_2" }).lean();
    expect(row).toMatchObject({
      eventId: "evt_2",
      type: "payment.captured",
      orderId: "order_1",
      paymentId: "pay_1",
      amountPaise: 150000,
      status: "captured",
    });
    expect(row?.createdAt).toBeInstanceOf(Date);
  });

  it("omits optional fields entirely rather than storing them as null/undefined", async () => {
    await recordEventOnce({ eventId: "evt_3", type: "payment.captured" });

    const row = await PaymentEventModel.findOne({ eventId: "evt_3" }).lean();
    expect(row?.orderId).toBeUndefined();
    expect(row?.paymentId).toBeUndefined();
    expect(row?.amountPaise).toBeUndefined();
    expect(row?.status).toBeUndefined();
  });

  it("a redelivered event (same eventId) reports firstTime:false and does not duplicate the row", async () => {
    const first = await recordEventOnce({
      eventId: "evt_4",
      type: "payment.captured",
      status: "captured",
    });
    expect(first).toEqual({ firstTime: true });

    const second = await recordEventOnce({
      eventId: "evt_4",
      type: "payment.captured",
      status: "captured",
    });
    expect(second).toEqual({ firstTime: false });

    expect(await PaymentEventModel.countDocuments({ eventId: "evt_4" })).toBe(1);
  });

  it("keys idempotency on eventId alone — a redelivery with a different payload is still a no-op", async () => {
    // A real Razorpay retry can carry a superficially different body. The
    // guarantee is "this event id was already recorded", not "this exact
    // payload was already recorded".
    await recordEventOnce({ eventId: "evt_5", type: "payment.captured", status: "authorized" });

    const second = await recordEventOnce({
      eventId: "evt_5",
      type: "payment.captured",
      status: "captured",
    });

    expect(second).toEqual({ firstTime: false });
    expect(await PaymentEventModel.countDocuments({ eventId: "evt_5" })).toBe(1);
    // The first write wins; the redelivery must not silently overwrite it.
    expect((await PaymentEventModel.findOne({ eventId: "evt_5" }).lean())?.status).toBe(
      "authorized",
    );
  });

  it("treats different eventIds as independent events", async () => {
    await recordEventOnce({ eventId: "evt_6a", type: "payment.captured" });
    await recordEventOnce({ eventId: "evt_6b", type: "payment.captured" });

    expect(await PaymentEventModel.countDocuments({})).toBe(2);
  });
});
