import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const VALID = {
  MONGODB_URI: "mongodb://localhost:27017/bya",
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
