import type { AuthUser, TokenVerifier, UserLookup, VerifiedToken } from "../platform/auth.js";
import type { UserRole } from "@bya/shared";

/**
 * A `TokenVerifier` for tests: same interface as the Firebase one, no
 * credentials, no network.
 *
 * Tokens are plain strings mapped to the identity they stand for, so a test
 * reads as `authAs("business-uid")` rather than as JWT plumbing.
 */
export function fakeVerifier(tokens: Record<string, VerifiedToken>): TokenVerifier {
  return {
    verify(idToken: string): Promise<VerifiedToken> {
      const verified = tokens[idToken];
      if (verified === undefined) {
        // Mirrors what firebase-admin does with a bad token: reject. The API
        // must convert this to a 401 without echoing the reason.
        return Promise.reject(new Error("Firebase ID token has invalid signature"));
      }
      return Promise.resolve(verified);
    },
  };
}

/** A `UserLookup` backed by a plain object, for tests with no database. */
export function fakeUserLookup(users: Record<string, AuthUser>): UserLookup {
  return (uid: string) => Promise.resolve(users[uid] ?? null);
}

/** Builds a token/identity pair for a given uid. */
export function tokenFor(uid: string, claims: Record<string, unknown> = {}): VerifiedToken {
  return { uid, claims };
}

/** The Authorization header value for a fake token. */
export function bearer(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

export function userWithRole(role: UserRole, blocked = false): AuthUser {
  return { role, blocked };
}
