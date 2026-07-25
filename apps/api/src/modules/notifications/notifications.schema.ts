import mongoose, { type Model } from "mongoose";
import {
  DELIVERY_STATUSES,
  NOTIFICATION_CHANNELS,
  type DeliveryStatus,
  type NotificationChannel,
} from "../../platform/notifications.js";

/**
 * The append-only delivery log — spec `docs/specs/2026-07-25-notifications-slice.md`,
 * legacy §17. One row per channel per `notify()` call: `sent`, `failed` (with
 * the adapter's error), or `skipped` (no configured sender / no recipient
 * handle / no template for the event). Written by `createNotifier`'s
 * injected `logDelivery` (`notifications.repository.ts`), read by admin (a
 * future console).
 *
 * Mirrors `audit.schema.ts`'s shape: append-only by construction — this
 * module and its repository export no update or delete path, because a
 * delivery attempt's outcome should never change after the fact. A resend is
 * a new attempt (a new row), not an edit to the old one's.
 */
export interface NotificationDocument {
  /** e.g. `"accountant_verified"`. */
  event: string;
  channel: NotificationChannel;
  /** The recipient handle used, or that would have been used; `""` when none was available. */
  to: string;
  status: DeliveryStatus;
  /** Why a `failed` or `skipped` attempt ended that way. Absent for `sent`. */
  error?: string;
  /** Reserved for the future admin console (e.g. provider message ids). Unused by N1. */
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const schema = new mongoose.Schema<NotificationDocument>(
  {
    event: { type: String, required: true, index: true },
    channel: { type: String, required: true, enum: NOTIFICATION_CHANNELS },
    to: { type: String, required: true },
    status: { type: String, required: true, enum: DELIVERY_STATUSES, index: true },
    error: { type: String, required: false },
    metadata: { type: mongoose.Schema.Types.Mixed, required: false },
    createdAt: { type: Date, required: true, default: (): Date => new Date() },
  },
  {
    collection: "notifications",
    // No `timestamps`: `updatedAt` would imply a delivery-log row can change
    // after it is written, and nothing should ever suggest that — same
    // reasoning as `audit.schema.ts`.
    timestamps: false,
  },
);

// Answering "what happened for this event, most recent first" — the query an
// admin console (or an on-call engineer chasing a missed notification) starts
// from.
schema.index({ event: 1, createdAt: -1 });

export const NotificationModel: Model<NotificationDocument> =
  (mongoose.models["Notification"] as Model<NotificationDocument> | undefined) ??
  mongoose.model<NotificationDocument>("Notification", schema);
