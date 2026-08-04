import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const VALID = {
  MONGODB_URI: "mongodb://localhost:27017/bya",
  JWT_SECRET: "an-adequately-long-signing-secret-for-tests",
} satisfies NodeJS.ProcessEnv;

describe("loadEnv", () => {
  it("parses a minimal valid environment and applies defaults", () => {
    const env = loadEnv(VALID);

    expect(env.MONGODB_URI).toBe("mongodb://localhost:27017/bya");
    expect(env.PORT).toBe(8080);
    expect(env.HOST).toBe("0.0.0.0");
    expect(env.NODE_ENV).toBe("development");
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("coerces PORT to a number rather than leaving it a string", () => {
    const env = loadEnv({ ...VALID, PORT: "3001" });

    expect(env.PORT).toBe(3001);
    expect(typeof env.PORT).toBe("number");
  });

  // The reason this module exists. `Number(process.env.PORT ?? 8080)` on
  // "eighty" yields NaN, and `listen({ port: NaN })` binds an arbitrary free
  // port — the server starts, reports success, and is unreachable at the
  // address anything else expects. Failing at boot is the only safe outcome.
  it("throws on a non-numeric PORT instead of silently producing NaN", () => {
    expect(() => loadEnv({ ...VALID, PORT: "eighty" })).toThrow(/PORT/);
  });

  it("throws when PORT is outside the valid range", () => {
    expect(() => loadEnv({ ...VALID, PORT: "70000" })).toThrow(/PORT/);
  });

  // No default. A wrong-but-present connection string is how you write to the
  // wrong database and only find out from the data.
  it("throws when MONGODB_URI is missing", () => {
    expect(() => loadEnv({})).toThrow(/MONGODB_URI/);
  });

  it("splits ALLOWED_ORIGINS on commas and trims whitespace", () => {
    const env = loadEnv({
      ...VALID,
      ALLOWED_ORIGINS: "https://a.example , https://b.example",
    });

    expect(env.ALLOWED_ORIGINS).toEqual(["https://a.example", "https://b.example"]);
  });

  it("rejects an ALLOWED_ORIGINS that is present but empty", () => {
    // A trailing comma or a blank value must not silently collapse to an empty
    // allowlist — `cors` with `origin: []` rejects every browser request, which
    // presents as an inexplicable production outage rather than a config error.
    expect(() => loadEnv({ ...VALID, ALLOWED_ORIGINS: " , " })).toThrow(/ALLOWED_ORIGINS/);
  });

  it("rejects an unknown LOG_LEVEL", () => {
    expect(() => loadEnv({ ...VALID, LOG_LEVEL: "chatty" })).toThrow(/LOG_LEVEL/);
  });

  it("reports every invalid key at once, not just the first", () => {
    // A boot that fails one variable at a time turns a five-variable
    // misconfiguration into five deploys.
    const attempt = (): unknown => loadEnv({ PORT: "eighty", LOG_LEVEL: "chatty" });

    expect(attempt).toThrow(/MONGODB_URI/);
    expect(attempt).toThrow(/PORT/);
    expect(attempt).toThrow(/LOG_LEVEL/);
  });
});

describe("KMS_MASTER_KEY", () => {
  it("is optional, so the API boots without KYC configured", () => {
    expect(loadEnv(VALID).KMS_MASTER_KEY).toBeUndefined();
  });

  it("accepts a base64 32-byte key", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    expect(loadEnv({ ...VALID, KMS_MASTER_KEY: key }).KMS_MASTER_KEY).toBe(key);
  });

  // A short key fails deep inside node:crypto at first use otherwise — in
  // whichever request happens to touch KYC first, in production.
  it("rejects a key that is not 32 bytes", () => {
    expect(() =>
      loadEnv({ ...VALID, KMS_MASTER_KEY: Buffer.alloc(16).toString("base64") }),
    ).toThrow(/KMS_MASTER_KEY/);
  });

  it("rejects a key that is not base64", () => {
    expect(() => loadEnv({ ...VALID, KMS_MASTER_KEY: "not a key" })).toThrow(/KMS_MASTER_KEY/);
  });
});

describe("JWT_SECRET", () => {
  // No default, like MONGODB_URI: a defaulted signing secret would let every
  // deployment mint tokens for every other.
  it("is required", () => {
    expect(() => loadEnv({ MONGODB_URI: VALID.MONGODB_URI })).toThrow(/JWT_SECRET/);
  });

  // A short secret makes HS256 brute-forceable offline from a single captured
  // token — refuse at boot, not after the first stolen session.
  it("rejects a secret shorter than 32 characters", () => {
    expect(() => loadEnv({ ...VALID, JWT_SECRET: "too-short" })).toThrow(/JWT_SECRET/);
  });

  it("accepts a 32+ character secret", () => {
    expect(loadEnv(VALID).JWT_SECRET).toBe(VALID.JWT_SECRET);
  });
});

describe("AUTH_DEV_ECHO_OTP", () => {
  it("defaults to false", () => {
    expect(loadEnv({ ...VALID }).AUTH_DEV_ECHO_OTP).toBe(false);
  });

  it("parses the string 'true' to boolean true in development", () => {
    const env = loadEnv({ ...VALID, NODE_ENV: "development", AUTH_DEV_ECHO_OTP: "true" });
    expect(env.AUTH_DEV_ECHO_OTP).toBe(true);
  });

  it("rejects a non-boolean string loudly", () => {
    expect(() => loadEnv({ ...VALID, AUTH_DEV_ECHO_OTP: "yes" })).toThrow(/AUTH_DEV_ECHO_OTP/);
  });

  // Echoing the OTP in the response is a full authentication bypass: anyone
  // who can name a phone number can sign in as it.
  it("REFUSES to boot when true under NODE_ENV=production", () => {
    expect(() => loadEnv({ ...VALID, NODE_ENV: "production", AUTH_DEV_ECHO_OTP: "true" })).toThrow(
      /must not be true when NODE_ENV=production/,
    );
  });
});

describe("OTP tuning knobs", () => {
  it("applies the documented defaults", () => {
    const env = loadEnv(VALID);
    expect(env.OTP_TTL_SEC).toBe(300);
    expect(env.OTP_MAX_ATTEMPTS).toBe(5);
    expect(env.OTP_RESEND_COOLDOWN_SEC).toBe(30);
  });

  it("coerces overrides to numbers", () => {
    const env = loadEnv({
      ...VALID,
      OTP_TTL_SEC: "120",
      OTP_MAX_ATTEMPTS: "3",
      OTP_RESEND_COOLDOWN_SEC: "60",
    });
    expect(env.OTP_TTL_SEC).toBe(120);
    expect(env.OTP_MAX_ATTEMPTS).toBe(3);
    expect(env.OTP_RESEND_COOLDOWN_SEC).toBe(60);
  });

  it("rejects a non-numeric value loudly", () => {
    expect(() => loadEnv({ ...VALID, OTP_TTL_SEC: "five minutes" })).toThrow(/OTP_TTL_SEC/);
  });
});
