import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ERROR_CODES } from "@bya/shared";
import { AppError, badRequest } from "../errors/app-error.js";

/**
 * File storage — spec `docs/specs/2026-07-25-s3-storage-slice.md`.
 *
 * ## Why a port
 *
 * The browser uploads bytes directly to the object store via a short-lived
 * presigned PUT URL the API mints — the file never streams through the API
 * (no large-body handling, no memory pressure). The API only ever holds the
 * **object key** (a string). Mirrors `helpers/crypto.helper.ts`'s `Cipher` port: a
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

declare module "fastify" {
  interface FastifyInstance {
    /**
     * The storage backend `app.ts` selected at boot — `unavailableStorage()`
     * until `S3_BUCKET` is configured. Always present once `buildApp` has
     * run; unlike `FastifyRequest.ctx` (set per-request by a preHandler),
     * this is decorated once, at composition time.
     */
    storage: StoragePort;
  }
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

/** Configuration for the real `s3Storage` adapter — see `env.ts` for where these come from. */
export interface S3Config {
  region: string;
  bucket: string;
  /** Set only for a local S3-compatible store (LocalStack/MinIO); omitted against real AWS. */
  endpoint?: string;
  /**
   * Static credentials — for local dev and LocalStack only. In production
   * both are omitted and the SDK's default provider chain resolves the
   * deployment's IAM role instead; see `s3Storage` below.
   */
  accessKeyId?: string;
  secretAccessKey?: string;
}

/** How long a presigned PUT (upload) URL stays valid. */
const UPLOAD_EXPIRY_SECONDS = 300;
/** How long a presigned GET (download) URL stays valid — short, since one is minted per read. */
const DOWNLOAD_EXPIRY_SECONDS = 120;

/**
 * The real storage adapter, over `@aws-sdk/client-s3` and its request
 * presigner. One `S3Client` is built per adapter instance and reused across
 * calls, per the SDK's own guidance — it owns connection-pooling state that
 * a fresh client per request would throw away.
 *
 * `endpoint` and `credentials` are added to the client config only when
 * present: `exactOptionalPropertyTypes` forbids setting either to `undefined`
 * explicitly, so this builds the config with conditional spreads rather than
 * `endpoint: config.endpoint` (which would be `string | undefined`).
 *
 * `forcePathStyle` follows whether `endpoint` is set. A local S3-compatible
 * store (LocalStack/MinIO) is addressed path-style — `<endpoint>/<bucket>/…`
 * — because it has no wildcard DNS/TLS for the virtual-hosted `<bucket>.
 * <endpoint>/…` form real AWS uses by default. Real AWS supports both, so
 * this only needs to switch on, never off.
 *
 * Credentials are passed only when *both* `accessKeyId` and `secretAccessKey`
 * are present. With either or both absent, the client falls back to the
 * SDK's default provider chain (environment variables, a shared config file,
 * or — the intended production path — the instance/task's IAM role). A
 * partial credential pair (one set, one not) is therefore treated the same
 * as neither being set, rather than sent to the SDK half-formed.
 */
export function s3Storage(config: S3Config): StoragePort {
  const client = new S3Client({
    region: config.region,
    forcePathStyle: config.endpoint !== undefined,
    ...(config.endpoint === undefined ? {} : { endpoint: config.endpoint }),
    ...(config.accessKeyId !== undefined && config.secretAccessKey !== undefined
      ? {
          credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          },
        }
      : {}),
  });

  return {
    /**
     * Known limitation: a presigned PUT does not itself hard-enforce
     * `maxBytes` — S3 accepts whatever bytes the client sends to the signed
     * URL, regardless of the size the caller declared when asking for it.
     * Hard-enforcing a ceiling on the URL itself needs either a bucket
     * policy keyed on object size or a presigned POST with a signed policy
     * document, which trades this simple PUT flow for a multipart form.
     * For now, `maxBytes` is validated server-side against the request (the
     * caller checks the declared size against the scope's cap before ever
     * minting a URL) and relies on the browser client to honor it — not a
     * hard guarantee against a client that ignores both. `maxBytes` stays
     * part of this method's signature so that server-side check has it,
     * even though the adapter itself never reads it.
     */
    async presignUpload({ key, contentType }): Promise<UploadTarget> {
      const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        ContentType: contentType,
      });
      const uploadUrl = await getSignedUrl(client, command, { expiresIn: UPLOAD_EXPIRY_SECONDS });

      return { key, uploadUrl, expiresInSeconds: UPLOAD_EXPIRY_SECONDS };
    },

    async presignDownload(key): Promise<string> {
      const command = new GetObjectCommand({ Bucket: config.bucket, Key: key });
      return getSignedUrl(client, command, { expiresIn: DOWNLOAD_EXPIRY_SECONDS });
    },

    async remove(key): Promise<void> {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}
