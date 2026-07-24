import { ERROR_CODES, type UserRole } from "@bya/shared";
import type { FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import { AppError, forbidden, unauthenticated } from "./errors.js";

/**
 * Authentication and authorization.
 *
 * ## Why this file is the centre of Phase 3
 *
 * The legacy system has two independent lines of defence: application code and
 * `firestore.rules`. Those rules encode real business logic — state
 * transitions, field immutability, role gating. **A Node API deletes the second
 * layer**, leaving this as the only gate. Every rule that used to live in the
 * rules file has to be re-implemented as an explicit guard here or in a
 * service, each with a test asserting the denial.
 */

/** What a verified Firebase ID token yields. */
export interface VerifiedToken {
  uid: string;
  /** Custom claims. Carried for observability — never for authorization. */
  claims: Record<string, unknown>;
}

/**
 * The seam that keeps the whole API testable with no Firebase credentials.
 *
 * Two implementations: `firebaseVerifier` in production, `fakeVerifier` in
 * tests. Both satisfy this interface, so a test exercises the real request
 * path rather than a mocked module — mocking `firebase-admin` would test the
 * mock's behaviour and drift silently when the SDK changes.
 */
export interface TokenVerifier {
  verify(idToken: string): Promise<VerifiedToken>;
}

/** The minimum a caller must know about a user to authorize them. */
export interface AuthUser {
  role: UserRole;
  blocked: boolean;
}

/**
 * Loads a user by Firebase uid.
 *
 * Injected rather than imported so this module never depends on the users
 * module — which depends on Mongoose, which would make every auth test need a
 * database.
 */
export type UserLookup = (uid: string) => Promise<AuthUser | null>;

/** What every authenticated handler can rely on. */
export interface RequestContext {
  uid: string;
  role: UserRole;
  blocked: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Present only after `requireAuth` has run. */
    ctx?: RequestContext;
    /** Present after `requireVerifiedToken` — identity, before any user row. */
    tokenUid?: string;
  }
}

export interface AuthDeps {
  verifier: TokenVerifier;
  userLookup: UserLookup;
}

/** Extracts a bearer token, or throws 401. Never reveals which part was wrong. */
function bearerToken(request: FastifyRequest): string {
  const header = request.headers.authorization;

  if (typeof header !== "string" || header.length === 0) {
    throw unauthenticated();
  }

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || token === undefined || token.length === 0) {
    throw unauthenticated();
  }

  return token;
}

/**
 * Verifies the caller's token and loads their user record.
 *
 * Three things this deliberately does NOT do:
 *
 * 1. Trust `claims.role`. Firebase custom claims are baked into a token valid
 *    for an hour, so a user demoted 5 minutes ago still carries `role: admin`
 *    in a perfectly valid token. Role is re-read from Mongo on every request.
 * 2. Trust anything in the body. Identity comes from the token alone.
 * 3. Forward the verifier's error message. It can name why a token failed,
 *    which is a probing oracle.
 */
export function requireAuth(deps: AuthDeps): preHandlerAsyncHookHandler {
  return async function authenticate(request): Promise<void> {
    await verifyToken(deps.verifier, request);
    const uid = tokenUidOf(request);

    const user = await deps.userLookup(uid);

    // A valid token for a user with no record is not authenticated *here*. It
    // happens legitimately between OTP and the create-user call, so it is a
    // 401 the client can act on, not a 500.
    if (user === null) {
      throw unauthenticated("Finish setting up your account to continue.");
    }

    if (user.blocked) {
      throw new AppError(
        403,
        ERROR_CODES.PROFILE_BLOCKED,
        "This account has been blocked. Contact support.",
      );
    }

    request.ctx = { uid, role: user.role, blocked: user.blocked };
  };
}

/** Verifies the bearer token and records the uid. Shared by both guards. */
async function verifyToken(verifier: TokenVerifier, request: FastifyRequest): Promise<void> {
  const token = bearerToken(request);

  try {
    const verified = await verifier.verify(token);
    request.tokenUid = verified.uid;
  } catch (error) {
    // Logged, not swallowed, and never echoed to the client — the verifier's
    // message names *why* a token failed, which is a probing oracle.
    request.log.warn({ err: error }, "token verification failed");
    throw unauthenticated();
  }
}

/**
 * Proves the caller holds a valid token, without requiring a user record.
 *
 * Exists for exactly one case: creating your own user document. At that moment
 * the token is valid but no row exists yet, so `requireAuth` — which rejects a
 * verified token with no user — cannot be used. Every other route uses
 * `requireAuth`, because "authenticated" should normally mean "and we know who
 * you are".
 */
export function requireVerifiedToken(deps: Pick<AuthDeps, "verifier">): preHandlerAsyncHookHandler {
  return async function verifyOnly(request): Promise<void> {
    await verifyToken(deps.verifier, request);
  };
}

/** Reads the verified uid, throwing if no token guard ran. */
export function tokenUidOf(request: FastifyRequest): string {
  if (request.tokenUid === undefined) {
    request.log.error("handler read the token uid on an unverified route");
    throw unauthenticated();
  }
  return request.tokenUid;
}

/**
 * Requires one of the given roles. Runs after `requireAuth` in the same
 * preHandler array.
 *
 * Compares against `ctx.role` — the value read from Mongo — never against a
 * token claim.
 */
export function requireRole(...roles: readonly UserRole[]): preHandlerAsyncHookHandler {
  return async function authorize(request): Promise<void> {
    const ctx = request.ctx;

    // Missing context means requireAuth did not run. That is a wiring mistake,
    // and it must fail closed and loudly rather than defaulting to allow.
    if (ctx === undefined) {
      request.log.error("requireRole ran without requireAuth — route is misconfigured");
      throw unauthenticated();
    }

    if (!roles.includes(ctx.role)) {
      throw forbidden();
    }

    return Promise.resolve();
  };
}

/** Reads the context, throwing if the route forgot to authenticate. */
export function contextOf(request: FastifyRequest): RequestContext {
  if (request.ctx === undefined) {
    request.log.error("handler read context on an unauthenticated route");
    throw unauthenticated();
  }
  return request.ctx;
}

/**
 * The production verifier, backed by the Firebase Admin SDK.
 *
 * Imported lazily so that neither tests nor a local boot without credentials
 * pays for initialising the SDK. Firebase remains the identity provider by
 * decision: only data moves to Atlas, because re-implementing auth is the
 * easiest thing here to get catastrophically wrong.
 *
 * `opts.checkRevoked` defaults to `true` (the production behaviour). The app
 * composition root (`app.ts`) passes `false` only when the gated dev flag
 * `FIREBASE_ALLOW_UNREVOKED_CHECK` is set — see env.ts, which refuses to boot
 * with that flag true in production.
 */
export function firebaseVerifier(
  projectId?: string,
  opts: { checkRevoked?: boolean } = {},
): TokenVerifier {
  const checkRevoked = opts.checkRevoked ?? true;

  return {
    async verify(idToken: string): Promise<VerifiedToken> {
      const { getApps, initializeApp, applicationDefault } = await import("firebase-admin/app");
      const { getAuth } = await import("firebase-admin/auth");

      if (getApps().length === 0) {
        // With revocation checking we call the Auth backend, which needs real
        // credentials (Application Default Credentials). Without it — the gated
        // dev path — a projectId is enough to verify a token's signature against
        // Google's public certs and validate its audience/issuer, no key needed.
        initializeApp(
          checkRevoked
            ? {
                credential: applicationDefault(),
                ...(projectId === undefined ? {} : { projectId }),
              }
            : { ...(projectId === undefined ? {} : { projectId }) },
        );
      }

      const decoded = await getAuth().verifyIdToken(idToken, checkRevoked);
      return { uid: decoded.uid, claims: { ...decoded } };
    },
  };
}
