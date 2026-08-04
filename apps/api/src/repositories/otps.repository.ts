import { OtpModel, type OtpDocument } from "../models/otp.model.js";

/**
 * Data access for OTP records. The only file in the auth module importing
 * the Otp model. Accepts and returns hashes only — the plaintext code never
 * crosses this boundary (see `helpers/otp.helper.ts`).
 */

export interface OtpRecord {
  id: string;
  phone: string;
  otpHash: string;
  salt: string;
  attemptCount: number;
  resendableAt: Date;
  consumedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
}

type LeanOtp = OtpDocument & { _id: { toString(): string } };

function toRecord(document: LeanOtp): OtpRecord {
  return {
    id: document._id.toString(),
    phone: document.phone,
    otpHash: document.otpHash,
    salt: document.salt,
    attemptCount: document.attemptCount,
    resendableAt: document.resendableAt,
    ...(document.consumedAt === undefined ? {} : { consumedAt: document.consumedAt }),
    expiresAt: document.expiresAt,
    createdAt: document.createdAt,
  };
}

export async function insertOtp(input: {
  phone: string;
  otpHash: string;
  salt: string;
  resendableAt: Date;
  expiresAt: Date;
  createdAt: Date;
}): Promise<OtpRecord> {
  const created = await OtpModel.create({ ...input, attemptCount: 0 });
  return toRecord(created.toObject());
}

/** The newest OTP row for a phone, consumed or not — throttling reads this. */
export async function latestForPhone(phone: string): Promise<OtpRecord | null> {
  const document = await OtpModel.findOne({ phone })
    .sort({ createdAt: -1 })
    .lean<LeanOtp | null>()
    .exec();

  return document === null ? null : toRecord(document);
}

/** How many codes this phone has been sent since `since` — the hourly cap. */
export function countSendsSince(phone: string, since: Date): Promise<number> {
  return OtpModel.countDocuments({ phone, createdAt: { $gte: since } }).exec();
}

/** Marks every still-open code for a phone consumed — a new send supersedes them. */
export async function supersedeActiveForPhone(phone: string, now: Date): Promise<void> {
  await OtpModel.updateMany(
    { phone, consumedAt: { $exists: false } },
    { $set: { consumedAt: now } },
  ).exec();
}

/**
 * Atomically spends one verification attempt and returns the post-increment
 * record. Incrementing BEFORE comparing (not after a failure) means two
 * concurrent guesses cannot both observe `attemptCount = 4` and each take
 * the "one left" path — the counter is the source of truth, not a read.
 */
export async function spendAttempt(id: string): Promise<OtpRecord | null> {
  const updated = await OtpModel.findByIdAndUpdate(id, { $inc: { attemptCount: 1 } }, { new: true })
    .lean<LeanOtp | null>()
    .exec();

  return updated === null ? null : toRecord(updated);
}

/** Single use: only an unconsumed row can be consumed, and only once. */
export async function consumeOtp(id: string, now: Date): Promise<boolean> {
  const result = await OtpModel.updateOne(
    { _id: id, consumedAt: { $exists: false } },
    { $set: { consumedAt: now } },
  ).exec();

  return result.modifiedCount === 1;
}
