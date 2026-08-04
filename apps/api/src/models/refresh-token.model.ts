import mongoose, { type Model } from "mongoose";

/**
 * The `refreshtokens` collection — one row per refresh token ever issued.
 *
 * The opaque token is returned to the client exactly once and stored here
 * only as `tokenHash = sha256(token)`; a leaked collection cannot be
 * replayed. Rows are grouped by `familyId`: a family starts at OTP verify
 * and grows by one row per rotation. The lifecycle markers are one-way:
 *
 * - `rotatedAt` — this token was exchanged for a successor. Presenting a
 *   rotated token again is the theft signal that revokes the whole family
 *   (`services/auth.service.ts`).
 * - `revokedAt` — the family was killed (logout, or reuse detection).
 *
 * `phone` is carried so a rotation can re-mint an access token with the
 * same claims without a users-collection lookup — the identity may not have
 * a user row yet (pre-registration).
 */
export interface RefreshTokenDocument {
  tokenHash: string;
  familyId: string;
  authUid: string;
  phone: string;
  rotatedAt?: Date;
  revokedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
}

const schema = new mongoose.Schema<RefreshTokenDocument>(
  {
    // Unique: a sha256 collision is not a real event, but two inserts of the
    // same token must be impossible by construction, not by luck.
    tokenHash: { type: String, required: true, unique: true, index: true },
    familyId: { type: String, required: true, index: true },
    authUid: { type: String, required: true, index: true },
    phone: { type: String, required: true },
    rotatedAt: { type: Date, required: false },
    revokedAt: { type: Date, required: false },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, required: true, default: (): Date => new Date() },
  },
  { collection: "refreshtokens", timestamps: false },
);

// TTL: expired tokens are garbage-collected by Mongo. The service still
// checks `expiresAt` itself — see otp.model.ts for why the TTL monitor's
// ~60s cycle cannot be a correctness dependency.
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshTokenModel: Model<RefreshTokenDocument> =
  (mongoose.models["RefreshToken"] as Model<RefreshTokenDocument> | undefined) ??
  mongoose.model<RefreshTokenDocument>("RefreshToken", schema);
