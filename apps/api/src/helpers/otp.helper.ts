import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import {
  AUTH_UID_BYTES,
  OTP_LENGTH,
  OTP_SALT_BYTES,
  REFRESH_TOKEN_BYTES,
} from "../constants/index.js";

/**
 * OTP and opaque-token primitives — pure `node:crypto`, no I/O, so every
 * property here (digit count, hash determinism, constant-time compare,
 * hash-at-rest) is provable in a plain unit test (`otp.helper.test.ts`).
 *
 * Nothing in this file stores anything. The rules — the database holds ONLY
 * salted hashes of OTPs and sha256 hashes of refresh tokens, never the
 * secrets themselves — are enforced by the repositories accepting only the
 * hashed forms these functions produce.
 */

/** A uniformly random `OTP_LENGTH`-digit code, zero-padded (`"007301"` is valid). */
export function generateOtp(): string {
  // randomInt is uniform over [0, 10^n) — no modulo bias, unlike hand-rolling
  // over randomBytes.
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

/** A fresh per-record salt, hex-encoded. Never reused across OTP rows. */
export function generateOtpSalt(): string {
  return randomBytes(OTP_SALT_BYTES).toString("hex");
}

/**
 * sha256(salt || otp), hex. The salt makes a stolen `otps` collection
 * useless as a rainbow-table target even though the OTP space is small —
 * each record must be brute-forced individually, inside its 5-minute life.
 */
export function hashOtp(otp: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${otp}`).digest("hex");
}

/**
 * Constant-time equality over the two hex digests.
 *
 * `timingSafeEqual` throws on length mismatch rather than returning false,
 * so length is checked first — the lengths of two sha256 hex digests are
 * public knowledge, never a secret to protect.
 */
export function constantTimeEqualHex(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** A 256-bit opaque refresh token, base64url. Returned to the client exactly once. */
export function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
}

/** sha256 hex of an opaque token — the only form the database ever sees. */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A fresh 24-hex identity key for a first sign-in. */
export function generateAuthUid(): string {
  return randomBytes(AUTH_UID_BYTES).toString("hex");
}

/** A family id grouping a refresh token and all its rotations. */
export function generateTokenFamilyId(): string {
  return randomBytes(AUTH_UID_BYTES).toString("hex");
}
