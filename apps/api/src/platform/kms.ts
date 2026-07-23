/**
 * Key management — the wrapping half of envelope encryption (spec §6.5).
 *
 * A port, for the same reason `TokenVerifier` is one: the production
 * implementation talks to a cloud KMS that no test should need, and the seam
 * makes the whole crypto path testable without credentials.
 *
 * It is also the seam the provider decision goes through. Auth lives on Google
 * (Firebase) while the database lives on AWS (Atlas), so "which KMS" is a real
 * choice — and one that does not need making today. Anything satisfying this
 * interface will drop in.
 */
export interface KeyManagementService {
  /** Wraps a freshly generated data key. Returns the encrypted key. */
  wrap(dataKey: Buffer): Promise<Buffer>;
  /** Unwraps a stored encrypted data key. */
  unwrap(wrappedKey: Buffer): Promise<Buffer>;
  /**
   * Identifies the wrapping key, stored beside the ciphertext.
   *
   * This is what makes rotation possible without re-encrypting the database:
   * old rows name the old key, new rows name the new one, and both stay
   * readable.
   */
  keyId(): string;
}

/**
 * Local development and tests: a master key from the environment, used
 * directly to wrap data keys with AES-256-GCM.
 *
 * **Not for production.** The master key sits in the process environment rather
 * than in a hardware-backed keystore, so it offers no access audit and no
 * rotation story. Spec §6.5 requires a cloud KMS holding the master key, which
 * is what buys "rotation and access audit without re-encrypting the DB".
 */
export function localKms(masterKey: Buffer, keyIdentifier = "local-dev"): KeyManagementService {
  if (masterKey.length !== 32) {
    throw new Error(`KMS master key must be 32 bytes for AES-256, got ${String(masterKey.length)}`);
  }

  return {
    async wrap(dataKey: Buffer): Promise<Buffer> {
      const { randomBytes, createCipheriv } = await import("node:crypto");
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", masterKey, iv);
      const wrapped = Buffer.concat([cipher.update(dataKey), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), wrapped]);
    },

    async unwrap(wrappedKey: Buffer): Promise<Buffer> {
      const { createDecipheriv } = await import("node:crypto");
      const iv = wrappedKey.subarray(0, 12);
      const tag = wrappedKey.subarray(12, 28);
      const body = wrappedKey.subarray(28);
      const decipher = createDecipheriv("aes-256-gcm", masterKey, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(body), decipher.final()]);
    },

    keyId(): string {
      return keyIdentifier;
    },
  };
}
