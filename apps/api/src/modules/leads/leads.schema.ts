import { LEAD_MODES, SELF_ASSIGNABLE_ROLES, type LeadMode } from "@bya/shared";
import mongoose, { type Model } from "mongoose";

/**
 * The `leads` collection — captured the moment OTP succeeds, before the user
 * finishes registering, so a drop-off is still a contactable lead.
 */
export interface LeadDocument {
  firebaseUid: string;
  phone?: string;
  role?: (typeof SELF_ASSIGNABLE_ROLES)[number];
  mode: LeadMode;
  completed: boolean;
  lastSeenAt: Date;
  legacyId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new mongoose.Schema<LeadDocument>(
  {
    // Keyed by uid, one lead per user — the legacy code writes
    // `leads/{uid}` with merge: true, so re-capture updates rather than
    // duplicating. The unique index is what preserves that.
    firebaseUid: { type: String, required: true, unique: true, index: true },
    phone: { type: String, required: false },
    role: { type: String, required: false, enum: SELF_ASSIGNABLE_ROLES },
    mode: { type: String, required: true, enum: LEAD_MODES, default: "register" },
    completed: { type: Boolean, required: true, default: false },
    lastSeenAt: { type: Date, required: true, default: (): Date => new Date() },
    legacyId: { type: String, required: false },
  },
  { timestamps: true, collection: "leads" },
);

export const LeadModel: Model<LeadDocument> =
  (mongoose.models["Lead"] as Model<LeadDocument> | undefined) ??
  mongoose.model<LeadDocument>("Lead", schema);
