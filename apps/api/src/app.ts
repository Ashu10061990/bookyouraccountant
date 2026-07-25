import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { ERROR_CODES } from "@bya/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { type AuthDeps, firebaseVerifier } from "./platform/auth.js";
import { type Cipher, createCipher } from "./platform/crypto.js";
import { localKms } from "./platform/kms.js";
import { buildNotificationSenders } from "./platform/notification-adapters.js";
import { createNotifier, type Notifier } from "./platform/notifications.js";
import {
  type PaymentGateway,
  razorpayGateway,
  unavailablePaymentGateway,
} from "./platform/payments.js";
import { s3Storage, type StoragePort, unavailableStorage } from "./platform/storage.js";
import { AppError } from "./platform/errors.js";
import { isConnected } from "./platform/db.js";
import { type Env, loadEnv } from "./platform/env.js";
import { registerErrorHandler } from "./platform/error-handler.js";
import { buildLoggerOptions } from "./platform/logger.js";
import { registerAccountantRoutes } from "./modules/accountants/accountants.routes.js";
import { markVerifiedByExam } from "./modules/accountants/accountants.repository.js";
import { registerBusinessRoutes } from "./modules/businesses/businesses.routes.js";
import { registerConfigRoutes } from "./modules/config/config.routes.js";
import { AUDIT_ACTIONS, record as recordAudit } from "./modules/audit/audit.service.js";
import { registerExamRoutes } from "./modules/exams/exams.routes.js";
import { type OnExamPass } from "./modules/exams/exams.service.js";
import { latestPass as examLatestPass } from "./modules/exams/exams.repository.js";
import { registerLeadRoutes } from "./modules/leads/leads.routes.js";
import { logDelivery } from "./modules/notifications/notifications.repository.js";
import { registerServiceRoutes } from "./modules/services/services.routes.js";
import { registerUploadRoutes } from "./modules/uploads/uploads.routes.js";
import { registerUserRoutes } from "./modules/users/users.routes.js";
import { findAuthUser } from "./modules/users/users.repository.js";

export interface BuildAppOptions {
  /** Disable in tests to keep output readable. */
  logger?: boolean;
  /**
   * Injected so tests never depend on the developer's shell environment.
   * Omitted in production, where the real environment is parsed and validated
   * once, here, at boot.
   */
  env?: Env;
  /**
   * Injected so tests run with no Firebase credentials. In production the
   * defaults are the real Firebase verifier and the real users repository.
   */
  auth?: AuthDeps;
  /**
   * Injected in tests. In production it is built from KMS_MASTER_KEY, and is
   * deliberately unavailable when that is unset — see `unavailableCipher`.
   */
  cipher?: Cipher;
  /**
   * Injected in tests (a fake `StoragePort`, per the storage slice's task 3).
   * In production it is built from `S3_BUCKET` (+ region, optional endpoint,
   * optional static credentials), and is deliberately unavailable when
   * `S3_BUCKET` is unset — see `unavailableStorage`.
   */
  storage?: StoragePort;
  /**
   * Injected in tests (a fake `PaymentGateway`). In production it is built
   * from `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET`, and is deliberately
   * unavailable when either is unset — see `unavailablePaymentGateway`.
   */
  payments?: PaymentGateway;
  /**
   * Injected in tests (a fake `Notifier`, or a real one built over fake
   * `ChannelSender`s). In production it is `createNotifier` over
   * `buildNotificationSenders(env)` — a real channel adapter per
   * fully-configured secret set, none at all when nothing is configured —
   * and `notifications.repository.ts`'s `logDelivery`.
   */
  notifier?: Notifier;
  /** Randomness for the exam draw. Defaults to `Math.random`; seeded in tests. */
  examRng?: () => number;
  /**
   * Current-time source for the exam throttle and the notifier's
   * delivery-log timestamps. Defaults to `new Date()`.
   */
  now?: () => Date;
}

/**
 * The cipher used when no KMS master key is configured.
 *
 * Every operation fails with a clear 503. The alternative — storing PAN and
 * bank details unencrypted when a key happens to be missing — is the one
 * behaviour that must not exist, because it fails silently and looks fine: the
 * request succeeds, the data lands, and nobody learns it is in plaintext until
 * someone reads the collection.
 */
function unavailableCipher(): Cipher {
  const unavailable = (): never => {
    throw new AppError(503, ERROR_CODES.INTERNAL, "KYC storage is not configured on this server.");
  };

  return { seal: () => Promise.resolve(unavailable()), open: () => Promise.resolve(unavailable()) };
}

/**
 * Builds a fully wired Fastify instance without binding a port, so tests can
 * drive it via `app.inject()`.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = options.env ?? loadEnv();

  const app = Fastify({
    // Redaction is configured centrally in buildLoggerOptions and verified by
    // logger.test.ts. Never construct a logger for this app any other way —
    // a bare `logger: true` here would log PII in plaintext.
    logger: options.logger === false ? false : buildLoggerOptions(env),
    // Trust exactly ONE proxy hop (Cloud Run's load balancer). `true` would
    // trust the whole X-Forwarded-For chain, letting a client spoof its own IP
    // and walk straight past IP-keyed rate limiting.
    trustProxy: 1,
    // Fastify's default request id is a per-process counter, so two instances
    // both emit "req-1". A UUID keeps ids correlatable across instances.
    genReqId: () => randomUUID(),
  });

  // These MUST be awaited. `void app.register(...)` returns before the plugin
  // attaches its hooks, so any route registered afterwards is never covered by
  // it — rate limiting silently does nothing. `no-floating-promises` does not
  // catch this, because `void` is exactly how you satisfy that rule.
  await app.register(helmet);
  await app.register(cors, {
    origin: env.ALLOWED_ORIGINS,
    credentials: true,
  });
  await app.register(rateLimit, { max: env.RATE_LIMIT_MAX, timeWindow: "1 minute" });

  registerErrorHandler(app);

  // Collected from Fastify's own route table rather than hand-listed, so the
  // index at `/` cannot drift out of date as routes are added or renamed.
  // Registered before any route, since onRoute only fires for later ones.
  const routes: { method: string; url: string }[] = [];
  app.addHook("onRoute", (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      // HEAD is auto-generated alongside every GET; listing both is noise.
      if (method !== "HEAD") routes.push({ method, url: route.url });
    }
  });

  // Firebase stays the identity provider (spec §2): only data moves to Atlas.
  // The role, however, always comes from Mongo — see platform/auth.ts.
  const auth: AuthDeps = options.auth ?? {
    verifier: firebaseVerifier(env.FIREBASE_PROJECT_ID, {
      checkRevoked: !env.FIREBASE_ALLOW_UNREVOKED_CHECK,
    }),
    userLookup: findAuthUser,
  };

  /**
   * Liveness and readiness in one.
   *
   * This deliberately reports the database, and returns 503 when it is not
   * connected. The previous version returned `{ status: "ok" }` unconditionally
   * — so a server that had never opened a database connection looked perfectly
   * healthy to a load balancer, which would then route real traffic to it. It
   * was a check that could not fail, which is the same as no check.
   */
  app.get("/health", (_request, reply) => {
    const connected = isConnected();

    return reply.status(connected ? 200 : 503).send({
      status: connected ? "ok" : "degraded",
      database: connected ? "connected" : "disconnected",
    });
  });

  const cipher =
    options.cipher ??
    (env.KMS_MASTER_KEY === undefined
      ? unavailableCipher()
      : createCipher(localKms(Buffer.from(env.KMS_MASTER_KEY, "base64"))));

  // Same shape as `cipher` just above: real adapter when configured, a
  // fail-loud stand-in otherwise — never a silent no-op that reports an
  // upload succeeded while storing nothing. Credentials are passed to the
  // adapter only when both are present; with either or both absent the AWS
  // SDK falls back to its default provider chain (in production: the
  // instance/task's IAM role).
  const storage =
    options.storage ??
    (env.S3_BUCKET === undefined
      ? unavailableStorage()
      : s3Storage({
          region: env.AWS_REGION,
          bucket: env.S3_BUCKET,
          ...(env.S3_ENDPOINT === undefined ? {} : { endpoint: env.S3_ENDPOINT }),
          ...(env.AWS_ACCESS_KEY_ID !== undefined && env.AWS_SECRET_ACCESS_KEY !== undefined
            ? { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY }
            : {}),
        }));

  // Decorated onto the instance so every route reads it from exactly one
  // place: `registerUploadRoutes` below consumes it as `request.server.storage`
  // for `POST /v1/uploads/presign`. This composition root is the only place
  // that decides which storage backend is live.
  app.decorate("storage", storage);

  // Same gated-adapter shape as `cipher`/`storage` above: a real adapter when
  // both Razorpay keys are configured, `unavailablePaymentGateway()` — every
  // createOrder/fetchOrder call fails loud with a 503 — otherwise. Payments
  // has no route consumer yet (spec `docs/specs/2026-07-25-payments-slice.md`:
  // "honest scope"); decorating it now is the seam P3's webhook route and,
  // later, the assignment engine read from.
  const payments =
    options.payments ??
    (env.RAZORPAY_KEY_ID !== undefined && env.RAZORPAY_KEY_SECRET !== undefined
      ? razorpayGateway({ keyId: env.RAZORPAY_KEY_ID, keySecret: env.RAZORPAY_KEY_SECRET })
      : unavailablePaymentGateway());
  app.decorate("payments", payments);

  // Same gated-adapter shape as `cipher`/`storage` above, but the "nothing
  // configured" case is not a fail-loud stand-in — an empty `senders` list is
  // a legitimate, silent-by-design state: every notification then logs
  // `skipped` per channel (createNotifier's own behaviour) rather than the
  // 503 `unavailableCipher`/`unavailableStorage` throw. That is deliberate —
  // a missing SMTP/WhatsApp/MSG91 credential must never fail the business
  // action (e.g. an accountant's verification) that triggers a notification.
  const notifier =
    options.notifier ??
    createNotifier(buildNotificationSenders(env), {
      logDelivery,
      now: options.now ?? (() => new Date()),
    });

  // Decorated for the same reason `storage` is: a single place every future
  // caller reads it from. N3 wires `accountant_verified` into the
  // accountants service by injecting `app.notifier` where routes are
  // registered — no route yet reads it from here in N2.
  app.decorate("notifier", notifier);

  // Exam ⇄ accountants cross-wiring, done at the composition root so neither
  // module depends on the other:
  //  - passing the exam marks an existing accountant profile verified, audited,
  //    inside the submit transaction;
  //  - a profile created after passing is born verified, reading the pass from
  //    the server's own attempt record.
  const onExamPass: OnExamPass = async (uid, score, total, session) => {
    const changed = await markVerifiedByExam(uid, score, total, session);
    if (changed) {
      await recordAudit(
        {
          action: AUDIT_ACTIONS.ACCOUNTANT_VERIFY,
          actor: { uid, role: "accountant" },
          subjectType: "accountant",
          subjectId: uid,
          metadata: { via: "exam", score, total },
        },
        session,
      );
    }
  };

  registerServiceRoutes(app, auth);
  registerAccountantRoutes(app, auth, cipher, examLatestPass);
  registerBusinessRoutes(app, auth, cipher);
  registerUserRoutes(app, auth);
  registerLeadRoutes(app, auth);
  registerConfigRoutes(app, auth);
  registerUploadRoutes(app, auth);
  registerExamRoutes(app, auth, {
    rng: options.examRng ?? Math.random,
    now: options.now ?? (() => new Date()),
    onPass: onExamPass,
  });

  /**
   * A self-describing index, so hitting the root of the API tells you what it
   * serves instead of a bare 404.
   *
   * Public, like `/health`. It lists paths, not data — and every one of those
   * paths carries its own guard, so naming them grants nothing. Registered
   * last, so `routes` is fully populated by the time this closure runs.
   */
  app.get("/", () => ({
    name: "BookYourAccountant API",
    endpoints: [...routes].sort(
      (a, b) => a.url.localeCompare(b.url) || a.method.localeCompare(b.method),
    ),
  }));

  return app;
}
