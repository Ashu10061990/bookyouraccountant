import { z } from "zod";

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

    // Optional: the Firebase Admin SDK infers the project from Application
    // Default Credentials when running on Google infrastructure. Required only
    // when running outside it, which the auth layer reports on its own.
    FIREBASE_PROJECT_ID: z.string().min(1).optional(),

    /**
     * DEV-ONLY. Verify tokens with `checkRevoked: false`, so the API accepts real
     * Firebase tokens using Google's public certs with no service-account key.
     * The only cost: a signed-out token stays valid until it expires (≤1h). The
     * object-level refine below refuses to boot if this is true in production.
     */
    FIREBASE_ALLOW_UNREVOKED_CHECK: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),

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
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.FIREBASE_ALLOW_UNREVOKED_CHECK) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FIREBASE_ALLOW_UNREVOKED_CHECK"],
        message:
          "FIREBASE_ALLOW_UNREVOKED_CHECK must not be true when NODE_ENV=production — " +
          "the no-key dev verifier skips revocation checks and must never run in production.",
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
