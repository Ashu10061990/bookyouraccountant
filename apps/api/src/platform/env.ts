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
const envSchema = z.object({
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

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  // Optional: the Firebase Admin SDK infers the project from Application
  // Default Credentials when running on Google infrastructure. Required only
  // when running outside it, which the auth layer reports on its own.
  FIREBASE_PROJECT_ID: z.string().min(1).optional(),
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
