import type { UserRole } from "@bya/shared";
import { verifyAccessToken } from "../helpers/jwt.helper.js";

/**
 * The token-verification port and its production (first-party JWT) adapter.
 *
 * Split out of the auth middleware so the middleware holds only request
 * guards, while this file holds the verification seam: the interfaces a
 * verifier must satisfy, and the HS256 implementation over `jose`.
 */

/** What a verified access token yields. */
export interface VerifiedToken {
  uid: string;
  /** The phone the identity signed in with. Absent on fakes that never set one. */
  phone?: string;
  /** Remaining claims. Carried for observability — never for authorization. */
  claims: Record<string, unknown>;
}

/**
 * The seam that keeps the whole API testable without minting real tokens.
 *
 * Two implementations: `jwtVerifier` in production, `fakeVerifier` in tests.
 * Both satisfy this interface, so a test exercises the real request path
 * rather than a mocked module.
 */
export interface TokenVerifier {
  verify(accessToken: string): Promise<VerifiedToken>;
}

/** The minimum a caller must know about a user to authorize them. */
export interface AuthUser {
  role: UserRole;
  blocked: boolean;
}

/**
 * Loads a user by auth uid.
 *
 * Injected rather than imported so this module never depends on the users
 * repository — which depends on Mongoose, which would make every auth test
 * need a database.
 */
export type UserLookup = (uid: string) => Promise<AuthUser | null>;

export interface AuthDeps {
  verifier: TokenVerifier;
  userLookup: UserLookup;
}

/**
 * The production verifier: our own HS256 access tokens, minted by
 * `services/auth.service.ts` (`helpers/jwt.helper.ts` holds the sign/verify
 * primitives). Issuer and audience are pinned — a structurally valid JWT
 * signed with the right key but minted for anything else is rejected.
 *
 * `now` is the app's injected clock seam. Production omits it (wall clock);
 * tests MUST pass the same fake clock they mint tokens with, or expiry is
 * judged against real time while `iat`/`exp` live in frozen test time.
 */
export function jwtVerifier(secret: string, now?: () => Date): TokenVerifier {
  return {
    async verify(accessToken: string): Promise<VerifiedToken> {
      const payload = await verifyAccessToken(accessToken, secret, now?.());
      return {
        uid: payload.sub,
        ...(payload.phone === undefined ? {} : { phone: payload.phone }),
        claims: { ...payload },
      };
    },
  };
}
