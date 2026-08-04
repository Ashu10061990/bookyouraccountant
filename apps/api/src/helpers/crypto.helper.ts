import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { KeyManagementService } from "../integrations/kms.js";

/**
 * Envelope encryption for PAN and other statutory identifiers — spec §6.5.
 *
 * ## The shape
 *
 * Each value gets its own random data key. The value is encrypted with that
 * data key (AES-256-GCM); the data key is then wrapped by the KMS master key
 * and stored alongside. Nothing needs the master key to *read* a row except the
 * KMS, so the master key never leaves it.
 *
 * The alternative — one static key encrypting everything, which is what the
 * legacy system does with `KYC_KEY` — means rotation requires decrypting and
 * re-encrypting every row, and compromise of that one key exposes the whole
 * table. Spec §14.4 flags that migration as "the one moment those values exist
 * in plaintext in memory".
 *
 * ## Why GCM
 *
 * GCM is authenticated: tampering with the ciphertext fails decryption rather
 * than silently producing different plaintext. For a PAN that is the difference
 * between a loud error and quietly attributing tax records to the wrong person.
 */

/** An encrypted value, as stored. Every field is needed to decrypt. */
export interface SealedValue {
  /** Base64 ciphertext. */
  ciphertext: string;
  /** Base64 initialisation vector — unique per encryption, never reused. */
  iv: string;
  /** Base64 GCM authentication tag. */
  tag: string;
  /** Base64 data key, wrapped by the KMS master key. */
  wrappedKey: string;
  /** Which master key wrapped it, so rotation does not orphan old rows. */
  keyId: string;
}

export interface Cipher {
  seal(plaintext: string): Promise<SealedValue>;
  open(sealed: SealedValue): Promise<string>;
}

export function createCipher(kms: KeyManagementService): Cipher {
  return {
    async seal(plaintext: string): Promise<SealedValue> {
      // A fresh data key per value. Reusing one across rows would make a single
      // compromise unlock every record it ever encrypted.
      const dataKey = randomBytes(32);
      const iv = randomBytes(12);

      const cipher = createCipheriv("aes-256-gcm", dataKey, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const wrappedKey = await kms.wrap(dataKey);

      // The data key is out of scope from here; nothing holds it in memory
      // longer than this call.
      return {
        ciphertext: ciphertext.toString("base64"),
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        wrappedKey: wrappedKey.toString("base64"),
        keyId: kms.keyId(),
      };
    },

    async open(sealed: SealedValue): Promise<string> {
      const dataKey = await kms.unwrap(Buffer.from(sealed.wrappedKey, "base64"));

      const decipher = createDecipheriv("aes-256-gcm", dataKey, Buffer.from(sealed.iv, "base64"));
      decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));

      // Throws on a bad tag rather than returning garbage. Deliberately not
      // caught here — a caller that swallowed this would be treating tampered
      // data as absent data.
      return Buffer.concat([
        decipher.update(Buffer.from(sealed.ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}

/**
 * `ABCDE1234F` → `XXXXX1234F`.
 *
 * The masked form is what every API response carries; the full value is
 * decrypted only where genuinely needed, and that access is audited.
 *
 * Masks the first five characters, matching the legacy system's `panMasked`
 * exactly (`src/lib/schema.js`). That is deliberate rather than incidental:
 * accountants have been seeing this format, admins recognise records by it,
 * and migrated rows carry it — changing the convention would make the same
 * record look different before and after migration.
 *
 * A PAN is five letters, four digits, one letter; the four digits and the
 * final letter are enough for a human to confirm the right record.
 */
export function maskPan(pan: string): string {
  const VISIBLE = 5;
  if (pan.length <= VISIBLE) return "X".repeat(pan.length);
  return "X".repeat(pan.length - VISIBLE) + pan.slice(-VISIBLE);
}

/** `50100123456789` → `XXXXXXXXXX6789`. */
export function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length < 4) return "X".repeat(accountNumber.length);
  return "X".repeat(accountNumber.length - 4) + accountNumber.slice(-4);
}
