/**
 * First-party auth numbers — OTP lifecycle, token lifetimes, entropy sizes.
 *
 * Everything an attacker would probe lives here as a named value, not an
 * inline literal: the OTP TTL/attempt/cooldown numbers are the *defaults*
 * behind the optional env knobs (`OTP_TTL_SEC` / `OTP_MAX_ATTEMPTS` /
 * `OTP_RESEND_COOLDOWN_SEC` in `config/env.ts`); the rest are fixed by
 * design and deliberately not configurable — a deploy must not be able to
 * shrink a refresh token to 8 bytes by typo.
 */

/** OTP digits. Six, zero-padded — `000123` is a valid code. */
export const OTP_LENGTH = 6;

/** Default OTP lifetime (env-overridable via `OTP_TTL_SEC`). */
export const OTP_TTL_SEC_DEFAULT = 300;

/** Default wrong-guess budget per OTP record (env: `OTP_MAX_ATTEMPTS`). */
export const OTP_MAX_ATTEMPTS_DEFAULT = 5;

/** Default per-phone resend cooldown (env: `OTP_RESEND_COOLDOWN_SEC`). */
export const OTP_RESEND_COOLDOWN_SEC_DEFAULT = 30;

/** Hard cap on OTP sends per phone per rolling hour, counted from the collection. */
export const OTP_MAX_SENDS_PER_HOUR = 5;

/** The rolling window `OTP_MAX_SENDS_PER_HOUR` is counted over. */
export const OTP_SEND_WINDOW_MS = 60 * 60 * 1000;

/** Random salt bytes hashed alongside each OTP — per record, never reused. */
export const OTP_SALT_BYTES = 16;

/** Access-token lifetime: short, because refresh is cheap and rotation is watched. */
export const ACCESS_TOKEN_TTL_SEC = 15 * 60;

/** Refresh-token lifetime. TTL-indexed, so Mongo expires the hash rows itself. */
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;

/** 256-bit opaque refresh tokens; returned once, stored only as a sha256 hash. */
export const REFRESH_TOKEN_BYTES = 32;

/** 24-hex identity key for users minted by first OTP sign-in. */
export const AUTH_UID_BYTES = 12;

/** Pinned JWT parameters. Verifier and signer both read these — never inline. */
export const JWT_ALG = "HS256";
export const JWT_ISSUER = "bookyouraccountant";
export const JWT_AUDIENCE = "bookyouraccountant";

/** `JWT_SECRET` floor. 32 chars ≈ the HS256 key size; anything shorter is brute-forceable. */
export const JWT_SECRET_MIN_LENGTH = 32;

/**
 * Route-level per-IP limits, layered over the per-phone throttles the
 * service enforces from the `otps` collection. Deliberately looser than the
 * per-phone rules — their job is to blunt distributed scraping of the
 * endpoint itself, not to be the primary throttle.
 */
export const AUTH_OTP_ROUTE_RATE_LIMIT = { max: 30, timeWindow: "15 minutes" } as const;
export const AUTH_REFRESH_ROUTE_RATE_LIMIT = { max: 120, timeWindow: "15 minutes" } as const;
