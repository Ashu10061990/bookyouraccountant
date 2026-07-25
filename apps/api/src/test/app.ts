import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import type { Cipher } from "../platform/crypto.js";
import type { AuthDeps } from "../platform/auth.js";
import type { Notifier } from "../platform/notifications.js";
import type { StoragePort } from "../platform/storage.js";
import { findAuthUser } from "../modules/users/users.repository.js";
import { fakeVerifier, tokenFor } from "./auth-fake.js";
import { testEnv } from "./env.js";

/**
 * The tokens every integration test shares. Each maps to a uid; whether that
 * uid has a user record, and with what role, is decided by the database — not
 * by the token. That is the property under test in half these suites.
 */
export const TOKENS = {
  business: "token-business",
  accountant: "token-accountant",
  admin: "token-admin",
  other: "token-other",
  stranger: "token-stranger",
} as const;

export const UIDS = {
  business: "uid-business",
  accountant: "uid-accountant",
  admin: "uid-admin",
  other: "uid-other",
  stranger: "uid-stranger",
} as const;

/**
 * An app wired exactly as production is, except that the token verifier is the
 * fake one.
 *
 * `userLookup` is the REAL repository, hitting the real in-memory Mongo. That
 * is deliberate: the stale-claim and role-escalation guards are only
 * meaningful if the role genuinely comes from the database.
 */
export async function buildTestApp(
  overrides: Partial<AuthDeps> = {},
  cipher?: Cipher,
  exam?: { examRng?: () => number; now?: () => Date },
  /**
   * Injected so a test can assert what key/contentType/maxBytes the uploads
   * module actually sent, and control what `UploadTarget` comes back —
   * without either touching AWS. Omitted by default, so a test that hits
   * `/v1/uploads/presign` without asking for storage gets the same loud 503
   * `unavailableStorage()` a misconfigured server would give, exactly like
   * the `cipher` parameter above for KYC.
   */
  storage?: StoragePort,
  /**
   * Injected so a test can assert exactly what `notify` was called with — a
   * fake `Notifier` that records every call — without touching Mongo's
   * delivery-log collection or any real channel adapter. Omitted by default,
   * so a test that does not ask for one gets the app's real notifier (no
   * configured senders in `testEnv()` ⇒ every attempt logs `skipped`),
   * exactly like the `cipher`/`storage` params above.
   */
  notifier?: Notifier,
): Promise<FastifyInstance> {
  const auth: AuthDeps = {
    verifier: fakeVerifier({
      [TOKENS.business]: tokenFor(UIDS.business),
      [TOKENS.accountant]: tokenFor(UIDS.accountant),
      // A deliberately misleading claim: this token says the caller is an
      // admin. The database decides whether they actually are.
      [TOKENS.admin]: tokenFor(UIDS.admin, { role: "admin" }),
      [TOKENS.other]: tokenFor(UIDS.other),
      [TOKENS.stranger]: tokenFor(UIDS.stranger, { role: "admin", admin: true }),
    }),
    userLookup: findAuthUser,
    ...overrides,
  };

  const app = await buildApp({
    logger: false,
    env: testEnv(),
    auth,
    // Omitted by default, so a test that touches KYC without asking for a
    // cipher gets the loud 503 a misconfigured server would give.
    ...(cipher === undefined ? {} : { cipher }),
    ...(exam?.examRng === undefined ? {} : { examRng: exam.examRng }),
    ...(exam?.now === undefined ? {} : { now: exam.now }),
    ...(storage === undefined ? {} : { storage }),
    ...(notifier === undefined ? {} : { notifier }),
  });
  await app.ready();
  return app;
}

/** Authorization header for one of the shared tokens. */
export function as(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}
