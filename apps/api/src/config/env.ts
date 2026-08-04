import { z } from "zod";
import {
  JWT_SECRET_MIN_LENGTH,
  OTP_MAX_ATTEMPTS_DEFAULT,
  OTP_RESEND_COOLDOWN_SEC_DEFAULT,
  OTP_TTL_SEC_DEFAULT,
} from "../constants/index.js";

/**
 * Environment parsing for the API.
 *
 * Every value the process depends on is declared here and validated once, at
 * boot. Reading `process.env` ad hoc through the codebase means a typo becomes
 * a runtime `undefined` at the moment the value is first needed — which for a
 * payments API can be hours after deploy, under load, in a code path nobody
 * exercised in staging.
 *
 * Defaults exist only where a wrong-but-plausible value is harmless. There is
 * deliberately no default for `MONGODB_URI`.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    PORT: z.coerce.number().int().min(1).max(65535).default(8080),

    HOST: z.string().min(1).default("0.0.0.0"),

    // No default, deliberately. A localhost fallback in production would connect
    // to nothing (loud, fine), but a fallback pointing at any real cluster would
    // write to the wrong database and only surface as data corruption.
    MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

    ALLOWED_ORIGINS: z
      .string()
      .default("http://localhost:5173")
      .transform((raw) =>
        raw
          .split(",")
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      )
      .refine((origins) => origins.length > 0, {
        message: "ALLOWED_ORIGINS must list at least one origin",
      }),

    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

    /**
     * Global requests per minute per IP. Spec §6.6 sets 100 as the baseline and
     * also calls for tiered limits (OTP 5/hour/phone, login 10/15min/IP, payment
     * 20/hour/user) — those arrive with the endpoints that need them.
     *
     * Configurable rather than hardcoded so tests and load probes can raise it
     * without disabling rate limiting, which would leave the regression guard
     * asserting headers that no longer mean anything.
     */
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),

    /**
     * Signs and verifies every access token (HS256, `helpers/jwt.helper.ts`).
     *
     * Required with no default, exactly like MONGODB_URI: a defaulted secret
     * would let every deployment on Earth mint tokens for every other. Min 32
     * chars — the HS256 key size; generate with `openssl rand -base64 48`.
     */
    JWT_SECRET: z
      .string()
      .min(
        JWT_SECRET_MIN_LENGTH,
        `JWT_SECRET must be at least ${JWT_SECRET_MIN_LENGTH} characters (generate: openssl rand -base64 48)`,
      ),

    /**
     * DEV-ONLY. Echo the OTP in the `/v1/auth/otp/request` response so local
     * development works with no MSG91 credentials (the SMS channel then logs
     * `skipped`). The object-level refine below refuses to boot if this is
     * true in production — an echoed OTP is a full authentication bypass.
     */
    AUTH_DEV_ECHO_OTP: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),

    /**
     * OTP tuning knobs. Defaults live in `constants/auth.constants.ts`;
     * configurable so an incident response can tighten them without a deploy.
     */
    OTP_TTL_SEC: z.coerce.number().int().min(30).default(OTP_TTL_SEC_DEFAULT),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(OTP_MAX_ATTEMPTS_DEFAULT),
    OTP_RESEND_COOLDOWN_SEC: z.coerce
      .number()
      .int()
      .min(1)
      .default(OTP_RESEND_COOLDOWN_SEC_DEFAULT),

    /**
     * Base64 32-byte master key wrapping the per-value data keys (§6.5).
     *
     * Optional so the API boots without it — but any endpoint touching KYC then
     * fails loudly rather than storing a PAN in plaintext. Silently falling back
     * to no encryption is the one behaviour that must not exist here.
     *
     * Development only. Production replaces `localKms` with a cloud KMS, which is
     * what gives rotation and access audit without re-encrypting the database.
     */
    KMS_MASTER_KEY: z
      .string()
      .refine(
        (value) => Buffer.from(value, "base64").length === 32,
        "KMS_MASTER_KEY must be a base64-encoded 32-byte key (generate: openssl rand -base64 32)",
      )
      .optional(),

    /**
     * File storage — spec `docs/specs/2026-07-25-s3-storage-slice.md`.
     *
     * Defaulted rather than optional: a region is meaningless to omit (unlike
     * `S3_BUCKET`, there is no "storage disabled" reading of a missing region),
     * and `ap-south-1` (Mumbai) matches the DPDP residency requirement the rest
     * of the stack already honors.
     */
    AWS_REGION: z.string().min(1).default("ap-south-1"),

    /**
     * Optional, and the switch the storage adapter is selected on (`app.ts`):
     * unset ⇒ `unavailableStorage()`, fail-loud rather than a silent no-op.
     * Set only once real (or LocalStack) storage is meant to be reachable.
     */
    S3_BUCKET: z.string().min(1).optional(),

    /**
     * Static credentials — local dev and LocalStack only. Both optional, and
     * meaningful only together: `app.ts` passes them to the adapter solely
     * when both are present, otherwise leaving the AWS SDK's default provider
     * chain to resolve the deployment's IAM role. Never set in production.
     */
    AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
    AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),

    /**
     * Set to point the S3 client at a local S3-compatible store instead of
     * real AWS — e.g. `http://127.0.0.1:4566` for LocalStack. Unset in
     * production and against real AWS.
     */
    S3_ENDPOINT: z.url().optional(),

    /**
     * Notifications — spec `docs/specs/2026-07-25-notifications-slice.md`.
     *
     * All optional, and meaningful only in matching sets per channel:
     * `app.ts`'s `buildNotificationSenders` (`notification-adapters.ts`)
     * builds a real channel adapter only when its full set below is present.
     * A partially-configured channel (e.g. `SMTP_HOST` with no `SMTP_PASS`)
     * is treated the same as an unconfigured one — omitted from the fan-out
     * — rather than sent half-formed. With everything below unset, every
     * channel is simply absent, and `createNotifier` records a `skipped`
     * delivery-log row for each instead of crashing.
     */
    // SMTP email — all three or none.
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASS: z.string().min(1).optional(),

    // Meta WhatsApp Cloud API — both or none.
    WA_TOKEN: z.string().min(1).optional(),
    WA_PHONE_ID: z.string().min(1).optional(),

    // MSG91 SMS (flow API) — all three or none.
    MSG91_AUTHKEY: z.string().min(1).optional(),
    MSG91_TEMPLATE: z.string().min(1).optional(),
    MSG91_SENDER: z.string().min(1).optional(),

    /**
     * Payments (Razorpay) — spec `docs/specs/2026-07-25-payments-slice.md`.
     *
     * All three optional, and each gates a different thing in `app.ts` /
     * the webhook route: `razorpayGateway` (`integrations/payments.ts`) replaces
     * `unavailablePaymentGateway()` only once BOTH `RAZORPAY_KEY_ID` and
     * `RAZORPAY_KEY_SECRET` are present — that pair is the gateway itself
     * (order-create, order-fetch). `RAZORPAY_WEBHOOK_SECRET` is separate and
     * gates only `POST /v1/payments/webhook` (P3), which verifies the
     * `x-razorpay-signature` header against it — so the gateway can be live
     * while the webhook is still unconfigured, or vice versa. Dummy creds
     * now; real values land later via env / Secrets Manager.
     */
    RAZORPAY_KEY_ID: z.string().min(1).optional(),
    RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.AUTH_DEV_ECHO_OTP) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["AUTH_DEV_ECHO_OTP"],
        message:
          "AUTH_DEV_ECHO_OTP must not be true when NODE_ENV=production — " +
          "echoing the OTP in the response is a full authentication bypass and must never run in production.",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Parses and validates the environment, throwing with *every* problem listed
 * rather than the first. A boot that fails one variable at a time turns a
 * five-variable misconfiguration into five deploys.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => {
        const key = issue.path.join(".") || "(root)";
        return `  ${key}: ${issue.message}`;
      })
      .join("\n");

    throw new Error(`Invalid environment configuration:\n${problems}`);
  }

  return result.data;
}
