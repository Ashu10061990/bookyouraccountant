import { PaymentEventModel, type PaymentEventDocument } from "./payments.schema.js";

/**
 * Data access for payment events. The only file in this module importing
 * Mongoose.
 */

/** What the webhook route has decoded, before it is safe to persist. */
export type PaymentEventInput = Omit<PaymentEventDocument, "createdAt">;

/**
 * Narrows a caught `unknown` to "this is Mongo's duplicate-key error", with no
 * `any`. The driver surfaces a unique-index violation as a `MongoServerError`
 * whose `code` is the numeric `11000` — that class is not something this
 * module depends on directly, so a structural check on `code` is what is
 * actually safe here rather than an `instanceof`.
 */
function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

/**
 * Records one webhook event exactly once — the idempotency guarantee the
 * webhook handler needs (spec: "Webhook — source of truth + idempotency").
 *
 * The unique index on `eventId` (`payments.schema.ts`) does the real work: a
 * redelivered event's insert collides with the row already there, and Mongo
 * rejects it with E11000. That is caught here and turned into
 * `{ firstTime: false }` — a signal to the caller, not a failure — so a
 * webhook handler can respond 200 without reprocessing. Any other error (a
 * genuine DB problem) is rethrown; only the duplicate-key shape is meaningful
 * to this function.
 */
export async function recordEventOnce(event: PaymentEventInput): Promise<{ firstTime: boolean }> {
  try {
    await PaymentEventModel.create({
      eventId: event.eventId,
      type: event.type,
      ...(event.orderId === undefined ? {} : { orderId: event.orderId }),
      ...(event.paymentId === undefined ? {} : { paymentId: event.paymentId }),
      ...(event.amountPaise === undefined ? {} : { amountPaise: event.amountPaise }),
      ...(event.status === undefined ? {} : { status: event.status }),
    });
    return { firstTime: true };
  } catch (error) {
    if (isDuplicateKeyError(error)) return { firstTime: false };
    throw error;
  }
}
