import type { LoggerOptions } from "pino";
import type { Env } from "./env.js";

/** The placeholder pino substitutes for a redacted value. */
export const REDACTED = "[Redacted]";

/**
 * Field names that must never reach a log sink, wherever they appear.
 *
 * PAN and Aadhaar are statutory identifiers; bank account and IFSC are payout
 * credentials; `idToken` is a bearer credential valid for an hour. Once any of
 * these lands in Cloud Logging it is in a system with a different retention
 * policy, a different access list, and no delete path — so the only workable
 * control is to never emit them.
 *
 * `panEncrypted` is included even though it is ciphertext: logging it leaks the
 * fact that a record exists and hands an attacker the exact blob to attack
 * offline if a key is ever compromised.
 */
const SENSITIVE_FIELDS = [
  "pan",
  "panEncrypted",
  "panMasked",
  "aadhaar",
  "aadhaarEncrypted",
  "aadhaarMasked",
  "phone",
  "phoneNumber",
  "bankAccount",
  "accountNumber",
  "ifsc",
  "idToken",
  "token",
  "password",
  "otp",
] as const;

/**
 * Wherever a sensitive field can appear. Pino's redact paths are literal, not
 * recursive — `pan` alone does NOT match `body.pan` — so every container a
 * field realistically travels in has to be enumerated.
 */
const CONTAINERS = ["", "body.", "req.body.", "context.", "user.", "data.", "payload."] as const;

function sensitivePaths(): string[] {
  const paths: string[] = [];
  for (const container of CONTAINERS) {
    for (const field of SENSITIVE_FIELDS) {
      paths.push(`${container}${field}`);
      // Arrays of records — e.g. a payout batch — are common enough in this
      // domain to be worth covering explicitly.
      paths.push(`${container}*.${field}`);
    }
  }
  return paths;
}

const CREDENTIAL_HEADER_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-api-key"]',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  "headers.authorization",
  "headers.cookie",
];

/**
 * Pino options with the redaction baseline applied.
 *
 * Verified by `logger.test.ts` asserting the secret is ABSENT from the emitted
 * bytes. A typo'd path yields output indistinguishable from a working config,
 * so counting configured paths would be a test that cannot fail.
 */
export function buildLoggerOptions(env: Pick<Env, "LOG_LEVEL" | "NODE_ENV">): LoggerOptions {
  return {
    level: env.LOG_LEVEL,
    redact: {
      paths: [...CREDENTIAL_HEADER_PATHS, ...sensitivePaths()],
      censor: REDACTED,
    },
    // The full URL is logged by Fastify's default serialiser, and a query
    // string is exactly where a PAN ends up when someone writes a search box.
    // Logging path-without-query keeps the logs useful and the PII out.
    serializers: {
      req(request: { method?: string; url?: string; id?: string }) {
        return {
          method: request.method,
          path: request.url?.split("?")[0],
          id: request.id,
        };
      },
    },
  };
}
