import type { DeliveryRecord } from "../../platform/notifications.js";
import { NotificationModel } from "./notifications.schema.js";

/**
 * Data access for the delivery log.
 *
 * **This module deliberately exports no update and no delete function** —
 * same discipline as `audit.repository.ts`, for the same reason: a delivery
 * attempt's recorded outcome must never change after the fact. A resend is a
 * new attempt (a new row), not an edit to the old one's.
 *
 * No `session` parameter: unlike an audit entry, a delivery-log row is
 * deliberately *not* transactional with the business action that triggered
 * it (spec: "fire-and-forget — the Notifier swallows+logs its own
 * failures"). A notification is best-effort by design, so tying its log
 * write to the same transaction as, say, an accountant's verification would
 * make an SMTP hiccup capable of rolling back a verification — exactly the
 * coupling `Notifier` exists to avoid.
 */
export async function logDelivery(record: DeliveryRecord): Promise<void> {
  await NotificationModel.create({
    event: record.event,
    channel: record.channel,
    to: record.to,
    status: record.status,
    ...(record.error === undefined ? {} : { error: record.error }),
    createdAt: record.createdAt,
  });
}
