import { USER_ROLES, type UserRole } from "@bya/shared";
import mongoose, { type Model } from "mongoose";

/**
 * The append-only audit log — spec §6.7.
 *
 * Covers every admin override, every money state transition and every KYC
 * access. These are statutory records: under Indian retention rules they must
 * survive account deletion, and §6.8 requires "delete user" to anonymise rather
 * than remove them.
 *
 * Append-only is enforced by the *absence* of any update or delete path in
 * `audit.repository.ts`, asserted by a test over its exported surface. A schema
 * cannot enforce this on its own — anything holding the model can call
 * `updateOne` — so the guarantee comes from no code being able to reach it.
 */
export interface AuditDocument {
  /** Dotted verb: `kyc.read`, `accountant.verify`, `config.update`. */
  action: string;
  actorUid: string;
  actorRole: UserRole;
  /** What was acted on: `accountant`, `business`, `config`. */
  subjectType: string;
  subjectId: string;
  /**
   * Context worth keeping — never the sensitive value itself. Reading a PAN is
   * recorded as the fact of the read, not the PAN.
   */
  metadata?: Record<string, unknown>;
  at: Date;
}

const schema = new mongoose.Schema<AuditDocument>(
  {
    action: { type: String, required: true, index: true },
    actorUid: { type: String, required: true, index: true },
    actorRole: { type: String, required: true, enum: USER_ROLES },
    subjectType: { type: String, required: true },
    subjectId: { type: String, required: true, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, required: false },
    at: { type: Date, required: true, default: (): Date => new Date() },
  },
  {
    collection: "audit_log",
    // No `timestamps`: `updatedAt` would imply these are mutable, and nothing
    // should ever suggest an audit row can change.
    timestamps: false,
  },
);

// Answering "what happened to this subject, most recent first" is the query
// every investigation starts with.
schema.index({ subjectType: 1, subjectId: 1, at: -1 });

export const AuditModel: Model<AuditDocument> =
  (mongoose.models["Audit"] as Model<AuditDocument> | undefined) ??
  mongoose.model<AuditDocument>("Audit", schema);
