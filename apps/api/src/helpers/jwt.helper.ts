import { jwtVerify, SignJWT } from "jose";
import { ACCESS_TOKEN_TTL_SEC, JWT_ALG, JWT_AUDIENCE, JWT_ISSUER } from "../constants/index.js";

/**
 * Access-token primitives: sign and verify our own HS256 JWTs with `jose`.
 *
 * This file is pure crypto — no Fastify, no Mongoose — so the round-trip,
 * tamper, expiry and wrong-audience cases are provable in a plain unit test
 * (`jwt.helper.test.ts`) with no app or database. The request-guard side
 * consumes it through `integrations/token-verifier.ts`'s `jwtVerifier`.
 *
 * Issuer, audience and algorithm are pinned from `constants/auth.constants.ts`
 * on BOTH sides. Pinning the algorithm on verify is not optional hygiene: it
 * is what forecloses the classic `alg` confusion attacks — a token claiming
 * `none` or an asymmetric alg is rejected before signature checking.
 */

/** The claims an access token carries. `sub` is the authUid. */
export interface AccessTokenPayload {
  sub: string;
  phone?: string;
  [claim: string]: unknown;
}

function keyOf(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/**
 * Mints a 15-minute access token for an identity.
 *
 * `now` is injectable so expiry tests need no clock mocking — production
 * callers omit it.
 */
export async function signAccessToken(
  identity: { authUid: string; phone: string },
  secret: string,
  now: Date = new Date(),
): Promise<string> {
  const issuedAtSec = Math.floor(now.getTime() / 1000);

  return new SignJWT({ phone: identity.phone })
    .setProtectedHeader({ alg: JWT_ALG })
    .setSubject(identity.authUid)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt(issuedAtSec)
    .setExpirationTime(issuedAtSec + ACCESS_TOKEN_TTL_SEC)
    .sign(keyOf(secret));
}

/**
 * Verifies signature, expiry, issuer and audience, and asserts the claims
 * this API depends on are present and well-typed.
 *
 * Throws `jose`'s own errors on any failure. Callers in the request path
 * (`verifyToken` in the auth middleware) convert that to an opaque 401 —
 * the reason a token failed is a probing oracle and never reaches a client.
 *
 * `now` is injectable for the same reason it is on `signAccessToken`: the
 * app runs on one clock seam, and sign/verify must share it. A token minted
 * with an injected test clock is otherwise judged against the wall clock —
 * which made a frozen-clock test suite expire its own fresh tokens the
 * moment real time drifted 15 minutes past the frozen instant.
 */
export async function verifyAccessToken(
  token: string,
  secret: string,
  now?: Date,
): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, keyOf(secret), {
    algorithms: [JWT_ALG],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    ...(now === undefined ? {} : { currentDate: now }),
  });

  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("access token has no subject");
  }

  const phone = payload["phone"];
  if (phone !== undefined && typeof phone !== "string") {
    throw new Error("access token has a malformed phone claim");
  }

  return {
    ...payload,
    sub: payload.sub,
    ...(phone === undefined ? {} : { phone }),
  };
}
