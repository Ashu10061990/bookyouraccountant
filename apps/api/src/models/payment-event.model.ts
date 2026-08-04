import mongoose, { type Model } from "mongoose";

/**
 * `paymentEvents` — the webhook-as-source-of-truth idempotency store. Spec
 * `docs/specs/2026-07-25-payments-slice.md` (Webhook section): every Razorpay
 * webhook delivery carries an event id, and redelivery is expected (Razorpay
 * retries on anything but a 2xx). The **unique index on `eventId`** is what
 * turns a redelivery into a no-op instead of a reprocessed event — see
 * `recordEventOnce` in `payments.repository.ts`.
 *
 * Append-only, like `examAttempts` in the exams module: a row is written once
 * and never updated, so there is deliberately no `updatedAt`.
 *
 * Acting on an event (minting a paid assignment) is a documented TODO for the
 * assignment engine slice — for now this collection IS the durable record
 * that a given event was received and what it said.
 */
export interface PaymentEventDocument {
  eventId: string;
  type: string;
  orderId?: string;
  paymentId?: string;
  amountPaise?: number;
  status?: string;
  createdAt: Date;
}

const schema = new mongoose.Schema<PaymentEventDocument>(
  {
    eventId: { type: String, required: true },
    type: { type: String, required: true },
    orderId: { type: String, required: false },
    paymentId: { type: String, required: false },
    amountPaise: { type: Number, required: false },
    status: { type: String, required: false },
    createdAt: { type: Date, required: true, default: (): Date => new Date() },
  },
  { collection: "paymentEvents" },
);

// The idempotency guarantee lives here, not in application code: a
// redelivered webhook (same eventId) collides on insert and Mongo itself
// rejects the second row with E11000. `recordEventOnce` depends on this exact
// constraint existing — see payments.repository.ts and db.ts's
// `assertIndexes` (autoIndex is off; this index only exists once that runs).
schema.index({ eventId: 1 }, { unique: true });

export const PaymentEventModel: Model<PaymentEventDocument> =
  (mongoose.models["PaymentEvent"] as Model<PaymentEventDocument> | undefined) ??
  mongoose.model<PaymentEventDocument>("PaymentEvent", schema);
