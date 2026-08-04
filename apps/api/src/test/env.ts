import type { Env } from "../config/env.js";

/**
 * A valid `Env` for tests, so no test depends on the developer's shell.
 *
 * Built as a literal rather than by calling `loadEnv({...})` on purpose: if a
 * test's environment came from the same parser under test, a parser bug could
 * make every test agree with it.
 */
export function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: "test",
    PORT: 0,
    HOST: "127.0.0.1",
    MONGODB_URI: "mongodb://127.0.0.1:27017/bya-test",
    ALLOWED_ORIGINS: ["http://localhost:5173"],
    LOG_LEVEL: "silent",
    // High, not disabled: rate limiting stays attached so the Phase 1
    // regression guard still asserts x-ratelimit-* headers on a real instance,
    // while a test file making hundreds of requests does not trip it.
    RATE_LIMIT_MAX: 100_000,
    // A fixed test secret (≥32 chars, matching the env floor). Tests that
    // exercise the REAL jwt path sign with this and the app verifies with it;
    // suites using `fakeVerifier` never read it.
    JWT_SECRET: "test-jwt-secret-0123456789abcdef0123456789abcdef",
    AUTH_DEV_ECHO_OTP: false,
    OTP_TTL_SEC: 300,
    OTP_MAX_ATTEMPTS: 5,
    OTP_RESEND_COOLDOWN_SEC: 30,
    // Defaulted, like the fields above — required in `Env`, so listed here
    // even though most tests never touch storage. S3_BUCKET and the
    // credential/endpoint fields are genuinely optional (no default) and are
    // deliberately omitted, exactly like KMS_MASTER_KEY above: a test that
    // needs storage configured passes S3_BUCKET etc. via `overrides`.
    AWS_REGION: "ap-south-1",
    ...overrides,
  };
}
