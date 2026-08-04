import mongoose, { type Model } from "mongoose";

/**
 * The `otps` collection — one row per OTP issued to a phone.
 *
 * The code itself is NEVER stored: only `otpHash = sha256(salt:otp)` with a
 * per-record random `salt` (`helpers/otp.helper.ts`). A read of this
 * collection therefore yields nothing directly usable, and the TTL index
 * below has Mongo itself remove rows shortly after they stop being valid —
 * expired OTP material does not accumulate.
 *
 * `attemptCount` and `consumedAt` are what make an OTP single-use and
 * brute-force-bounded; `resendableAt` is the per-phone cooldown the service
 * enforces. All three are server-owned — no client payload ever reaches
 * this model except through `services/auth.service.ts`.
 */
export interface OtpDocument {
  phone: string;
  otpHash: string;
  salt: string;
  /** Wrong-guess counter. At the configured max the record is dead. */
  attemptCount: number;
  /** When the phone may be sent another code. */
  resendableAt: Date;
  /** Set on successful verification (single use) or supersession by a newer code. */
  consumedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
}

const schema = new mongoose.Schema<OtpDocument>(
  {
    phone: { type: String, required: true, index: true },
    otpHash: { type: String, required: true },
    salt: { type: String, required: true },
    attemptCount: { type: Number, required: true, default: 0 },
    resendableAt: { type: Date, required: true },
    consumedAt: { type: Date, required: false },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, required: true, default: (): Date => new Date() },
  },
  { collection: "otps", timestamps: false },
);

// TTL: Mongo deletes the row once `expiresAt` passes. The service still
// checks `expiresAt` itself — the TTL monitor runs on a ~60s cycle, so a row
// can outlive its expiry by up to a minute, and correctness must not depend
// on the janitor having run.
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// The verify/throttle query: latest OTP for a phone.
schema.index({ phone: 1, createdAt: -1 });

export const OtpModel: Model<OtpDocument> =
  (mongoose.models["Otp"] as Model<OtpDocument> | undefined) ??
  mongoose.model<OtpDocument>("Otp", schema);
