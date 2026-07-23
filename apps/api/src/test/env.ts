import type { Env } from "../platform/env.js";

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
    ...overrides,
  };
}
