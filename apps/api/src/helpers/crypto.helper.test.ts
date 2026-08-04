import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createCipher, maskAccountNumber, maskPan } from "./crypto.helper.js";
import { localKms } from "../integrations/kms.js";

const PAN = "ABCDE1234F";
const kms = localKms(randomBytes(32));
const cipher = createCipher(kms);

describe("seal / open", () => {
  it("round-trips a value", async () => {
    const sealed = await cipher.seal(PAN);
    expect(await cipher.open(sealed)).toBe(PAN);
  });

  it("never stores the plaintext anywhere in the sealed value", async () => {
    const sealed = await cipher.seal(PAN);

    // The whole point. If the PAN appeared in any field, the encryption would
    // be decorative — and it would be decorative in a way that looks correct.
    expect(JSON.stringify(sealed)).not.toContain(PAN);
    expect(Buffer.from(sealed.ciphertext, "base64").toString("utf8")).not.toContain(PAN);
  });

  it("produces different ciphertext for the same input every time", async () => {
    const a = await cipher.seal(PAN);
    const b = await cipher.seal(PAN);

    // Deterministic ciphertext would let anyone holding the table learn that
    // two accountants share a PAN — or confirm a guessed one by encrypting it.
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
    expect(a.wrappedKey).not.toBe(b.wrappedKey);

    expect(await cipher.open(a)).toBe(PAN);
    expect(await cipher.open(b)).toBe(PAN);
  });

  it("uses a fresh data key per value", async () => {
    const a = await cipher.seal("value-one");
    const b = await cipher.seal("value-two");

    // One data key across rows would mean a single compromise unlocks every
    // record it ever encrypted.
    expect(a.wrappedKey).not.toBe(b.wrappedKey);
  });

  it("records which master key wrapped it, so rotation does not orphan rows", async () => {
    const sealed = await cipher.seal(PAN);
    expect(sealed.keyId).toBe("local-dev");
  });

  it("handles unicode and long values", async () => {
    const value = "पैन कार्ड ".repeat(50);
    expect(await cipher.open(await cipher.seal(value))).toBe(value);
  });

  it("handles the empty string without producing something unopenable", async () => {
    expect(await cipher.open(await cipher.seal(""))).toBe("");
  });
});

describe("tamper detection", () => {
  // GCM is authenticated, and this is why it was chosen. With an unauthenticated
  // mode, altering the ciphertext would silently yield *different plaintext* —
  // for a PAN, that means attributing tax records to the wrong person with no
  // error anywhere.
  it("refuses to open a value whose ciphertext was altered", async () => {
    const sealed = await cipher.seal(PAN);
    const bytes = Buffer.from(sealed.ciphertext, "base64");
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;

    await expect(
      cipher.open({ ...sealed, ciphertext: bytes.toString("base64") }),
    ).rejects.toThrow();
  });

  it("refuses to open a value whose auth tag was altered", async () => {
    const sealed = await cipher.seal(PAN);
    const tag = Buffer.from(sealed.tag, "base64");
    tag[0] = (tag[0] ?? 0) ^ 0xff;

    await expect(cipher.open({ ...sealed, tag: tag.toString("base64") })).rejects.toThrow();
  });

  it("refuses to open a value whose IV was altered", async () => {
    const sealed = await cipher.seal(PAN);
    const iv = Buffer.from(sealed.iv, "base64");
    iv[0] = (iv[0] ?? 0) ^ 0xff;

    await expect(cipher.open({ ...sealed, iv: iv.toString("base64") })).rejects.toThrow();
  });

  it("refuses to open a value whose wrapped key was altered", async () => {
    const sealed = await cipher.seal(PAN);
    const key = Buffer.from(sealed.wrappedKey, "base64");
    key[key.length - 1] = (key[key.length - 1] ?? 0) ^ 0xff;

    await expect(cipher.open({ ...sealed, wrappedKey: key.toString("base64") })).rejects.toThrow();
  });

  it("refuses to open with a different master key", async () => {
    const sealed = await cipher.seal(PAN);
    const otherCipher = createCipher(localKms(randomBytes(32)));

    // Losing the master key must mean the data is unreadable — not partially
    // readable, and not silently wrong.
    await expect(otherCipher.open(sealed)).rejects.toThrow();
  });
});

describe("localKms", () => {
  it("rejects a master key that is not 32 bytes", () => {
    // AES-256 needs exactly 32. A short key would otherwise fail deep inside
    // node:crypto at first use, in whatever request happened to hit it.
    expect(() => localKms(randomBytes(16))).toThrow(/32 bytes/);
    expect(() => localKms(Buffer.alloc(0))).toThrow(/32 bytes/);
  });

  it("wraps and unwraps a data key", async () => {
    const kmsUnderTest = localKms(randomBytes(32));
    const dataKey = randomBytes(32);

    const unwrapped = await kmsUnderTest.unwrap(await kmsUnderTest.wrap(dataKey));
    expect(unwrapped.equals(dataKey)).toBe(true);
  });

  it("never emits the data key in the wrapped form", async () => {
    const kmsUnderTest = localKms(randomBytes(32));
    const dataKey = randomBytes(32);
    const wrapped = await kmsUnderTest.wrap(dataKey);

    expect(wrapped.includes(dataKey)).toBe(false);
  });
});

describe("masking", () => {
  // Matches the legacy `panMasked` format in src/lib/schema.js exactly.
  // Accountants and admins already recognise records by this shape, and
  // migrated rows carry it — a different convention would make the same record
  // look different either side of the migration.
  it("masks a PAN the way the legacy system does", () => {
    expect(maskPan("ABCDE1234F")).toBe("XXXXX1234F");
  });

  it("masks an account number, keeping the last four", () => {
    expect(maskAccountNumber("50100123456789")).toBe("XXXXXXXXXX6789");
  });

  it("does not leak short values by leaving them unmasked", () => {
    expect(maskPan("AB")).toBe("XX");
    expect(maskPan("ABCDE")).toBe("XXXXX");
    expect(maskAccountNumber("123")).toBe("XXX");
  });

  it("never returns the original value for a realistic input", () => {
    for (const value of ["ABCDE1234F", "ZZZZZ9999Z"]) {
      expect(maskPan(value)).not.toBe(value);
      expect(maskPan(value)).toContain("X");
    }
  });
});
