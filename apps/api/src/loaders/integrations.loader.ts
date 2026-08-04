import { ERROR_CODES } from "@bya/shared";
import { type Env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";
import { type Cipher, createCipher } from "../helpers/crypto.helper.js";
import { localKms } from "../integrations/kms.js";
import { buildNotificationSenders } from "../integrations/notification-adapters.js";
import { createNotifier, type Notifier } from "../integrations/notifications.js";
import {
  type PaymentGateway,
  razorpayGateway,
  unavailablePaymentGateway,
} from "../integrations/payments.js";
import { s3Storage, type StoragePort, unavailableStorage } from "../integrations/storage.js";
import { type AuthDeps, jwtVerifier } from "../integrations/token-verifier.js";
import { logDelivery } from "../repositories/notifications.repository.js";
import { findAuthUser } from "../repositories/users.repository.js";

/**
 * The integration wiring, extracted from `app.ts` so the composition root
 * stays slim: everything here is "build the live adapter from env, or its
 * fail-loud stand-in", chosen in exactly one place.
 */
export interface IntegrationOverrides {
  /**
   * Injected so tests can mint identities without JWT plumbing. In production
   * the defaults are the real HS256 verifier and the real users repository.
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
  /**
   * Current-time source for the exam throttle and the notifier's
   * delivery-log timestamps. Defaults to `new Date()`.
   */
  now?: () => Date;
}

/** Every port the app decorates or hands to a route registrar. */
export interface Integrations {
  auth: AuthDeps;
  cipher: Cipher;
  storage: StoragePort;
  payments: PaymentGateway;
  notifier: Notifier;
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

/** Builds every third-party port from env, honouring test overrides. */
export function buildIntegrations(env: Env, options: IntegrationOverrides = {}): Integrations {
  // First-party identity: our own HS256 access tokens, minted by
  // services/auth.service.ts and verified here against the same JWT_SECRET.
  // The role always comes from Mongo — see middlewares/auth.middleware.ts.
  const auth: AuthDeps = options.auth ?? {
    // The verifier shares the app's clock seam (options.now): tokens are
    // minted and judged on the same time source, injected or real.
    verifier: jwtVerifier(env.JWT_SECRET, options.now),
    userLookup: findAuthUser,
  };

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

  return { auth, cipher, storage, payments, notifier };
}
