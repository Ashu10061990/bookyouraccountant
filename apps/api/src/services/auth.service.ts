import { ERROR_CODES } from "@bya/shared";
import {
  ACCESS_TOKEN_TTL_SEC,
  OTP_MAX_SENDS_PER_HOUR,
  OTP_SEND_WINDOW_MS,
  REFRESH_TOKEN_TTL_SEC,
} from "../constants/index.js";
import { AppError, forbidden, unauthenticated } from "../errors/app-error.js";
import { signAccessToken } from "../helpers/jwt.helper.js";
import {
  constantTimeEqualHex,
  generateAuthUid,
  generateOtp,
  generateOtpSalt,
  generateRefreshToken,
  generateTokenFamilyId,
  hashOtp,
  hashRefreshToken,
} from "../helpers/otp.helper.js";
import type { Notifier } from "../integrations/notifications.js";
import * as otps from "../repositories/otps.repository.js";
import * as refreshTokens from "../repositories/refresh-tokens.repository.js";
import { findAuthUidByPhone, touchLastLogin } from "../repositories/users.repository.js";

/**
 * First-party phone-OTP authentication.
 *
 * ## The properties this file is responsible for
 *
 * 1. **No enumeration.** `requestOtp`'s response is byte-identical whether or
 *    not the phone belongs to any account — no lookup even happens on that
 *    path. Throttling responses key on the *phone's own send history*, which
 *    an attacker learns nothing new from.
 * 2. **Secrets at rest are hashes.** The OTP is salted-sha256'd; the refresh
 *    token is sha256'd; the plaintext of either exists only in the response
 *    (and the OTP additionally in the SMS body handed to the notifier).
 * 3. **Single use, bounded guessing.** An OTP dies on success, on its
 *    `OTP_MAX_ATTEMPTS`-th wrong guess (the counter is spent atomically,
 *    BEFORE comparing), and at expiry.
 * 4. **Rotation with reuse detection.** A refresh token is exchanged exactly
 *    once. Presenting an already-rotated token is treated as theft: the whole
 *    family is revoked and the caller gets an opaque 401.
 */

export interface AuthConfig {
  jwtSecret: string;
  otpTtlSec: number;
  otpMaxAttempts: number;
  otpResendCooldownSec: number;
  /** Echo the OTP in the response — dev only; env refuses it in production. */
  devEchoOtp: boolean;
}

export interface AuthServiceDeps {
  notifier: Notifier;
  config: AuthConfig;
  now: () => Date;
}

export interface OtpRequestResult {
  expiresInSec: number;
  resendAfterSec: number;
  /** Present only when `AUTH_DEV_ECHO_OTP=true` (boot-refused in production). */
  devOtp?: string;
}

export interface SessionResult {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
  authUid: string;
}

/** One message for every OTP denial a guesser can trigger by being wrong. */
function invalidOtp(): AppError {
  return new AppError(401, ERROR_CODES.OTP_INVALID, "That code is invalid. Request a new one.");
}

export async function requestOtp(deps: AuthServiceDeps, phone: string): Promise<OtpRequestResult> {
  const { config } = deps;
  const now = deps.now();

  // Per-phone cooldown, read from the newest row regardless of whether it was
  // consumed — a successful sign-in does not reset the resend clock.
  const latest = await otps.latestForPhone(phone);
  if (latest !== null && latest.resendableAt.getTime() > now.getTime()) {
    throw new AppError(
      429,
      ERROR_CODES.RATE_LIMITED,
      "Please wait a moment before requesting another code.",
    );
  }

  // Hourly cap, counted from the collection itself so it survives restarts
  // and holds across instances.
  const sentThisHour = await otps.countSendsSince(
    phone,
    new Date(now.getTime() - OTP_SEND_WINDOW_MS),
  );
  if (sentThisHour >= OTP_MAX_SENDS_PER_HOUR) {
    throw new AppError(
      429,
      ERROR_CODES.RATE_LIMITED,
      "Too many codes requested for this number. Try again later.",
    );
  }

  // A new code supersedes every open one: exactly one OTP is ever live per
  // phone, so `verifyOtp`'s "latest row" read is unambiguous.
  await otps.supersedeActiveForPhone(phone, now);

  const otp = generateOtp();
  const salt = generateOtpSalt();
  await otps.insertOtp({
    phone,
    otpHash: hashOtp(otp, salt),
    salt,
    resendableAt: new Date(now.getTime() + config.otpResendCooldownSec * 1000),
    expiresAt: new Date(now.getTime() + config.otpTtlSec * 1000),
    createdAt: now,
  });

  // Fire-and-forget by design: `notify` never rejects, and an unconfigured
  // SMS channel logs a `skipped` delivery row (dev runs pair that with
  // AUTH_DEV_ECHO_OTP). NOTE: this response is built from the request's own
  // inputs only — nothing user-existence-dependent may ever be added to it.
  await deps.notifier.notify({
    event: "auth_otp",
    to: { phone },
    data: { otp, minutes: Math.ceil(config.otpTtlSec / 60) },
  });

  return {
    expiresInSec: config.otpTtlSec,
    resendAfterSec: config.otpResendCooldownSec,
    ...(config.devEchoOtp ? { devOtp: otp } : {}),
  };
}

export async function verifyOtp(
  deps: AuthServiceDeps,
  phone: string,
  otp: string,
): Promise<SessionResult> {
  const { config } = deps;
  const now = deps.now();

  const record = await otps.latestForPhone(phone);
  if (record === null || record.consumedAt !== undefined) {
    throw invalidOtp();
  }

  if (record.expiresAt.getTime() <= now.getTime()) {
    throw new AppError(410, ERROR_CODES.OTP_EXPIRED, "That code has expired. Request a new one.");
  }

  // Spend the attempt BEFORE comparing, atomically. Checking after a failure
  // would let concurrent guesses share the last attempt; a counter that only
  // moves forward cannot be raced past.
  const spent = await otps.spendAttempt(record.id);
  if (spent === null) {
    throw invalidOtp();
  }
  if (spent.attemptCount > config.otpMaxAttempts) {
    throw new AppError(
      429,
      ERROR_CODES.OTP_ATTEMPTS_EXHAUSTED,
      "Too many incorrect attempts. Request a new code.",
    );
  }

  if (!constantTimeEqualHex(hashOtp(otp, record.salt), record.otpHash)) {
    throw invalidOtp();
  }

  // Single use: the guarded update wins for exactly one caller. A concurrent
  // duplicate verify loses here even though it passed the compare above.
  const consumed = await otps.consumeOtp(record.id, now);
  if (!consumed) {
    throw invalidOtp();
  }

  // Mint identity on first sign-in. If the phone already belongs to a user
  // row, the existing identity is reused — signing in again must never fork
  // an account.
  const existingUid = await findAuthUidByPhone(phone);
  const authUid = existingUid ?? generateAuthUid();
  if (existingUid !== null) {
    await touchLastLogin(existingUid);
  }

  return issueSession(deps, { authUid, phone, familyId: generateTokenFamilyId() }, now);
}

export async function refreshSession(
  deps: AuthServiceDeps,
  presentedToken: string,
): Promise<SessionResult> {
  const now = deps.now();
  const record = await refreshTokens.findByTokenHash(hashRefreshToken(presentedToken));

  // Unknown, revoked and expired all collapse into one opaque 401 — naming
  // which failed would be an oracle over the token store.
  if (record === null || record.revokedAt !== undefined) {
    throw unauthenticated();
  }
  if (record.expiresAt.getTime() <= now.getTime()) {
    throw unauthenticated();
  }

  // Reuse = theft signal. A rotated token's legitimate holder already has the
  // successor, so whoever is presenting the old one — original owner or thief
  // — one of them is not the owner. Kill the entire family.
  if (record.rotatedAt !== undefined) {
    await refreshTokens.revokeFamily(record.familyId, now);
    throw unauthenticated();
  }

  // The guarded update makes rotation single-winner under concurrency: the
  // loser of a race lands in the same reuse path as a replayed token.
  const rotated = await refreshTokens.markRotated(record.tokenHash, now);
  if (!rotated) {
    await refreshTokens.revokeFamily(record.familyId, now);
    throw unauthenticated();
  }

  return issueSession(
    deps,
    { authUid: record.authUid, phone: record.phone, familyId: record.familyId },
    now,
  );
}

/**
 * Revokes the presented token's whole family. Idempotent: logging out with a
 * token that no longer exists (expired and TTL-collected, or already revoked)
 * is a success, not an error — the state the caller asked for holds.
 */
export async function logout(
  deps: AuthServiceDeps,
  callerUid: string,
  presentedToken: string,
): Promise<void> {
  const record = await refreshTokens.findByTokenHash(hashRefreshToken(presentedToken));
  if (record === null) {
    return;
  }

  // A caller may only kill their own sessions — without this, any
  // authenticated user who obtained someone else's refresh token could
  // weaponise logout as a denial of service against them.
  if (record.authUid !== callerUid) {
    throw forbidden();
  }

  await refreshTokens.revokeFamily(record.familyId, deps.now());
}

/** Mints an access/refresh pair and persists the refresh hash. */
async function issueSession(
  deps: AuthServiceDeps,
  identity: { authUid: string; phone: string; familyId: string },
  now: Date,
): Promise<SessionResult> {
  const accessToken = await signAccessToken(
    { authUid: identity.authUid, phone: identity.phone },
    deps.config.jwtSecret,
    now,
  );

  const refreshToken = generateRefreshToken();
  await refreshTokens.insertRefreshToken({
    tokenHash: hashRefreshToken(refreshToken),
    familyId: identity.familyId,
    authUid: identity.authUid,
    phone: identity.phone,
    expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_SEC * 1000),
    createdAt: now,
  });

  return {
    accessToken,
    refreshToken,
    expiresInSec: ACCESS_TOKEN_TTL_SEC,
    authUid: identity.authUid,
  };
}
