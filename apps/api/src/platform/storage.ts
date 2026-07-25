import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { ERROR_CODES } from "@bya/shared";
import { AppError, badRequest } from "./errors.js";

/**
 * File storage — spec `docs/specs/2026-07-25-s3-storage-slice.md`.
 *
 * ## Why a port
 *
 * The browser uploads bytes directly to the object store via a short-lived
 * presigned PUT URL the API mints — the file never streams through the API
 * (no large-body handling, no memory pressure). The API only ever holds the
 * **object key** (a string). Mirrors `platform/crypto.ts`'s `Cipher` port: a
 * narrow interface, a real adapter behind it (AWS S3, added next), and a
 * fail-loud fallback for when there is no configuration to run the real
 * adapter on.
 */

/** Where a caller should PUT one object, and for how long the URL is valid. */
export interface UploadTarget {
  key: string;
  uploadUrl: string;
  expiresInSeconds: number;
}

export interface StoragePort {
  /** Presigned PUT for a caller to upload one object to an owner-scoped key. */
  presignUpload(input: {
    key: string;
    contentType: string;
    maxBytes: number;
  }): Promise<UploadTarget>;
  /** Presigned GET, short-lived, for reading one object back. */
  presignDownload(key: string): Promise<string>;
  /** Remove an object (used by the future cascade-delete). */
  remove(key: string): Promise<void>;
}

/**
 * The whitelisted upload scopes, ported from the legacy six Cloud Storage
 * paths, mapped to each one's size cap in MB. `buildOwnedKey` takes a
 * `StorageScope` — there is no scope value a caller can invent that isn't
 * one of these six.
 */
export const STORAGE_SCOPES = {
  resumes: 5,
  marksheets: 5,
  kyc: 5,
  photos: 5,
  mis: 10,
  clientUploads: 10,
} as const;

export type StorageScope = keyof typeof STORAGE_SCOPES;

const BYTES_PER_MB = 1024 * 1024;

/** A scope's size cap in bytes, for validating a presign request. */
export function maxBytesForScope(scope: StorageScope): number {
  return STORAGE_SCOPES[scope] * BYTES_PER_MB;
}

/** `.jpg`, `.pdf`, `.xlsx` — one dot, then 1-8 lowercase alphanumerics. */
const SAFE_EXTENSION_PATTERN = /^\.[a-z0-9]{1,8}$/;

function invalidFilename(): never {
  throw badRequest("Invalid file name.");
}

/**
 * Extracts and validates the extension from a client-supplied filename.
 * Everything else about the filename is discarded — see `buildOwnedKey`.
 *
 * Uses `node:path`'s `extname` rather than a hand-rolled split, so a
 * multi-dot name (`archive.tar.gz`) keeps only its final extension, and a
 * bare dotfile-style name (`.jpg`, nothing before the dot) is correctly
 * treated as *no* extension rather than one — the same rule Node applies
 * everywhere else.
 */
function safeExtension(filename: string): string {
  const ext = extname(filename).toLowerCase();
  if (ext === "") return "";
  if (!SAFE_EXTENSION_PATTERN.test(ext)) invalidFilename();
  return ext;
}

/**
 * Builds the object key for one upload: `<scope>/<uid>/<uuid><ext>`.
 *
 * This is the security core of the storage slice. Two things make a key
 * un-spoofable:
 *
 * - **The object name is a fresh `randomUUID()`, never the client's
 *   filename.** A malicious filename cannot steer the key onto another
 *   object — at most it can pick a wrong extension, and that is validated
 *   below too.
 * - **The key is always `<scope>/<uid>/…`, and `uid` is the caller's own
 *   verified uid, never anything from the request body.** A caller can only
 *   ever address objects under its own uid.
 *
 * The filename is still checked for `/`, `\` and `..` as defence in depth —
 * even though only its extension survives into the key, a filename shaped
 * like a path is a signal worth refusing outright rather than quietly
 * tolerating.
 */
export function buildOwnedKey(scope: StorageScope, uid: string, filename: string): string {
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    invalidFilename();
  }

  const ext = safeExtension(filename);
  return `${scope}/${uid}/${randomUUID()}${ext}`;
}

/**
 * The storage port used when no object-store configuration is present
 * (`S3_BUCKET` unset — see `env.ts`). Every method fails loud with a 503.
 *
 * The alternative — an upload that reports success but stored nothing — is
 * the one behaviour this must never produce: it would look fine to the
 * caller and surface only later as a document nobody can retrieve. Mirrors
 * `unavailableCipher` in `app.ts`.
 */
export function unavailableStorage(): StoragePort {
  const unavailable = (): never => {
    throw new AppError(503, ERROR_CODES.INTERNAL, "File storage is not configured on this server.");
  };

  return {
    presignUpload: () => Promise.resolve(unavailable()),
    presignDownload: () => Promise.resolve(unavailable()),
    remove: () => Promise.resolve(unavailable()),
  };
}
