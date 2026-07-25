# Slice: AWS S3 file storage (+ accountant document uploads)

**Date:** 2026-07-25 · **Method:** vertical slice · **Branch:** `slice/aws-storage-and-integrations`

**Goal.** Give the rebuild the file-storage subsystem it has none of (legacy used
Cloud Storage for resumes, marksheets, KYC-doc images, profile photos, MIS `.xlsx`).
Build it on **AWS S3** behind a **port**, gated + dummy-cred like the existing
`Cipher`/`TokenVerifier` ports, and prove it with one real consumer:
**an accountant uploads a profile photo + a marksheet** during/after onboarding.

**Why a port + presigned URLs.** The browser uploads the bytes **directly to S3**
via a short-lived presigned PUT URL the API mints — the file never streams through
the API (no large-body handling, no memory pressure). The API only ever holds the
**object key** (a string), owner-scoped so one accountant cannot read another's.
Downloads are presigned GET URLs, minted only for a caller entitled to that key.

---

## Architecture (mirrors `platform/crypto.ts` + `unavailableCipher`)

**`apps/api/src/platform/storage.ts`** — the port:

```ts
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
```

- **`s3Storage(config)`** — the real adapter over `@aws-sdk/client-s3` +
  `@aws-sdk/s3-request-presigner`. Honors an optional `endpoint` so a local
  **LocalStack/MinIO** S3 works for verification; `forcePathStyle` when an
  endpoint is set.
- **`unavailableStorage()`** — the fail-loud fallback (like `unavailableCipher`):
  every method throws a 503 `"File storage is not configured on this server."`
  Selected when `S3_BUCKET` is unset. **Never a silent no-op** — an upload that
  looked like it worked but stored nothing is the one behaviour to forbid.

**Key scoping — the security core.** Keys are built server-side from the caller's
uid and a whitelisted scope, never from client input:

```
<scope>/<uid>/<uuid><ext>      e.g.  photos/NG1j…/6f3c2a1b.jpg
```

Scopes (ported from the legacy 6 Storage paths, with their size caps):
`resumes` `marksheets` `kyc` `photos` (5 MB), `mis` `clientUploads` (10 MB).
`buildOwnedKey(scope, uid, filename)` sanitises the extension and refuses any
`..`/slash in the client-supplied name. **A client proposes a scope + filename,
never a full key**, so it can only ever write under its own uid.

---

## Endpoints (accountant-scoped; auth required)

| Route                                   | Guard         | Body → returns                                                                                                                                                                                                               |
| --------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/uploads/presign`              | `requireAuth` | `{scope, filename, contentType}` → `{key, uploadUrl, expiresInSeconds}`. Server derives the key from `ctx.uid`; validates scope ∈ whitelist and `contentType`/size cap.                                                      |
| `PATCH /v1/accountants/me` (existing)   | `requireAuth` | now also accepts `photoKey?`, `marksheetKeys?` — **object keys only**, each validated to start with the caller's own `photos/<uid>/` or `marksheets/<uid>/` prefix (a server-owned check, like `assertNoServerOwnedFields`). |
| `GET /v1/accountants/me/uploads/:field` | `requireAuth` | mints a short-lived presigned GET for the owner's stored `photoKey`/a marksheet key.                                                                                                                                         |

The accountant serializer gains a **presigned `photoUrl`** (minted on read from
`photoKey`) in the private/owner view — never the raw key to other viewers, and
the public view gets the photo only if we later decide photos are public (today:
owner-only, matching the legacy `photos/` = any-signed-in read, tightened to owner).

---

## The real consumer (what makes this a slice, not a layer)

`apps/app` onboarding/terminal gains a small **"Add a profile photo"** control on
the verified terminal (and optional marksheet upload): pick file → `POST
/v1/uploads/presign` → `PUT` the file to `uploadUrl` (direct to S3) → `PATCH
/v1/accountants/me {photoKey}` → the terminal re-reads and shows the photo via the
presigned `photoUrl`. That is the end-to-end path watched in the browser.

---

## Env (dummy now; real via AWS Secrets Manager later)

`apps/api/.env(.example)`:

```
AWS_REGION=ap-south-1
S3_BUCKET=bya-uploads-dev            # unset ⇒ unavailableStorage (fail-loud)
AWS_ACCESS_KEY_ID=dummy              # real creds later; on AWS use an IAM role, no keys
AWS_SECRET_ACCESS_KEY=dummy
S3_ENDPOINT=                         # set to http://127.0.0.1:4566 for LocalStack
```

`env.ts` validates: if `S3_BUCKET` is set, `AWS_REGION` must be too. Region default
`ap-south-1` (Mumbai — matches the DPDP residency requirement the rest of the stack honors).

---

## Tasks

1. **`platform/storage.ts` port + `unavailableStorage` + `buildOwnedKey`** (TDD): key
   scoping (uid-prefixed, extension-sanitised, path-traversal-refused, scope-whitelisted,
   size-cap lookup) and the fail-loud fallback. Unit tests — pure logic, no AWS.
2. **`s3Storage` adapter** over `@aws-sdk/client-s3` + presigner; env additions in `env.ts`;
   wire `app.ts` to pick `s3Storage` vs `unavailableStorage` from `S3_BUCKET`. Adapter test
   against a mocked S3 client (presign URL shape, `forcePathStyle` when endpoint set).
3. **`uploads` module** — `POST /v1/uploads/presign` (routes → service), scope/contentType/
   size validation, owner-scoped key from `ctx.uid`. Integration tests via `buildTestApp`
   (a fake `StoragePort` injected) incl. the denial: a client-proposed key/scope can't escape
   its uid; unknown scope → 400.
4. **Accountant photo/marksheet keys** — extend `accountantProfileSchema` + serializer with
   `photoKey`/`marksheetKeys` (server-validated prefix) and a presigned `photoUrl` on the
   owner view; `GET /v1/accountants/me/uploads/:field`. Denial test: can't set a key outside
   your prefix.
5. **SPA upload control** — presign → direct `PUT` → `PATCH me` → show photo. Wire into the
   verified terminal.
6. **Verify + docs** — offline integration green; if Docker/LocalStack is available, a real
   round-trip upload watched in the browser; else verify the presign+scoping E2E and note the
   real-bytes upload awaits creds/LocalStack. Update COVERAGE/OPEN-ITEMS.

**Verification with dummy creds.** Tasks 1–4 are fully testable offline (key logic, the
fail-loud path, the owner-scoping denials, presign-URL shape against a mocked client). A real
byte upload needs LocalStack (`S3_ENDPOINT=http://127.0.0.1:4566`) or real AWS — used if the
sandbox can run it, otherwise deferred to when creds land, with the logic proven either way.
