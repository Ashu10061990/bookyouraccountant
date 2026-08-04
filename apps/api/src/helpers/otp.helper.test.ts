import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { OTP_LENGTH } from "../constants/index.js";
import {
  constantTimeEqualHex,
  generateAuthUid,
  generateOtp,
  generateOtpSalt,
  generateRefreshToken,
  generateTokenFamilyId,
  hashOtp,
  hashRefreshToken,
} from "./otp.helper.js";

describe("generateOtp", () => {
  it("always yields exactly OTP_LENGTH digits, zero-padded", () => {
    for (let i = 0; i < 500; i += 1) {
      expect(generateOtp()).toMatch(new RegExp(`^\\d{${OTP_LENGTH}}$`));
    }
  });

  it("does not repeat itself constantly", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateOtp()));
    // 50 draws from a million-code space colliding down to a handful would
    // mean the generator is broken, not unlucky.
    expect(seen.size).toBeGreaterThan(40);
  });
});

describe("hashOtp", () => {
  it("is deterministic for the same otp and salt", () => {
    expect(hashOtp("123456", "salt")).toBe(hashOtp("123456", "salt"));
  });

  it("changes with the salt — same code, different record, different hash", () => {
    expect(hashOtp("123456", generateOtpSalt())).not.toBe(hashOtp("123456", generateOtpSalt()));
  });

  it("never stores the code recognisably (sha256 hex out)", () => {
    const digest = hashOtp("123456", "salt");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain("123456");
  });
});

describe("constantTimeEqualHex", () => {
  it("matches equal digests", () => {
    const digest = hashOtp("123456", "salt");
    expect(constantTimeEqualHex(digest, digest)).toBe(true);
  });

  it("rejects different digests", () => {
    expect(constantTimeEqualHex(hashOtp("123456", "salt"), hashOtp("123457", "salt"))).toBe(false);
  });

  it("rejects a length mismatch instead of throwing", () => {
    expect(constantTimeEqualHex("abcd", hashOtp("123456", "salt"))).toBe(false);
  });
});

describe("refresh tokens and identity keys", () => {
  it("generates 256-bit base64url refresh tokens", () => {
    const token = generateRefreshToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateRefreshToken()).not.toBe(token);
  });

  it("hashes a refresh token to plain sha256 hex — what the collection stores", () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(createHash("sha256").update(token).digest("hex"));
  });

  it("mints 24-hex auth uids and family ids", () => {
    expect(generateAuthUid()).toMatch(/^[0-9a-f]{24}$/);
    expect(generateTokenFamilyId()).toMatch(/^[0-9a-f]{24}$/);
    expect(generateAuthUid()).not.toBe(generateAuthUid());
  });
});
