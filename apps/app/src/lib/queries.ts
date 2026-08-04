import type {
  CreateAccountantInput,
  ExamPaper,
  ExamResult,
  ExamSubmission,
  UpdateAccountantInput,
} from "@bya/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api, ApiError } from "./api.js";

interface AccountantView {
  authUid: string;
  name: string;
  city: string;
  state: string;
  qualifications: string[];
  specialties: string[];
  languages: string[];
  experienceYears: number;
  verified: boolean;
  examScore?: number;
  examTotal?: number;
  /** Object key into S3, never a URL — see `getMyPhotoUrl` for the presigned
   * read. Present only once a photo has been uploaded and PATCHed onto the
   * profile (`docs/specs/2026-07-25-s3-storage-slice.md`). */
  photoKey?: string;
  marksheetKeys?: string[];
}

/** Bootstraps the caller's user record. A 409 means it already exists — which
 * is success for our purposes (the identity is set up). */
export async function bootstrapUser(phone?: string): Promise<void> {
  try {
    await api.post("/v1/users", { role: "accountant", ...(phone === undefined ? {} : { phone }) });
  } catch (error) {
    if (error instanceof ApiError && error.code === "CONFLICT") return;
    throw error;
  }
}

export const startExam = (): Promise<ExamPaper> =>
  api.post<{ exam: ExamPaper }>("/v1/exam/start").then((r) => r.exam);

export const submitExam = (submission: ExamSubmission): Promise<ExamResult> =>
  api.post<{ result: ExamResult }>("/v1/exam/submit", submission).then((r) => r.result);

export const createProfile = (input: CreateAccountantInput): Promise<AccountantView> =>
  api.post<{ accountant: AccountantView }>("/v1/accountants", input).then((r) => r.accountant);

/** The current accountant's own profile, or null if none exists yet (404). */
export function useAccountant(uid: string | undefined): UseQueryResult<AccountantView | null> {
  return useQuery({
    queryKey: ["accountant", uid],
    enabled: uid !== undefined,
    queryFn: async (): Promise<AccountantView | null> => {
      try {
        const r = await api.get<{ accountant: AccountantView }>(`/v1/accountants/${uid ?? ""}`);
        return r.accountant;
      } catch (error) {
        if (error instanceof ApiError && error.code === "NOT_FOUND") return null;
        throw error;
      }
    },
  });
}

/** What a caller may request a presigned upload for — mirrors the API's
 * `presignRequestSchema` (`apps/api/src/modules/uploads/uploads.schema.ts`). */
export interface PresignUploadInput {
  scope: string;
  filename: string;
  contentType: string;
}

/** Where to PUT the file and how long the URL stays valid — mirrors the
 * API's `UploadTarget` (`apps/api/src/platform/storage.ts`). */
export interface UploadTarget {
  key: string;
  uploadUrl: string;
  expiresInSeconds: number;
}

/** Mints an owner-scoped presigned S3 PUT URL. The server derives the actual
 * key from the caller's own verified uid — `scope`/`filename` here are only
 * ever a request, never an address the client controls. */
export const presignUpload = (input: PresignUploadInput): Promise<UploadTarget> =>
  api.post<UploadTarget>("/v1/uploads/presign", input);

/** Patches the signed-in accountant's own profile — e.g. attaching a
 * `photoKey` once a direct-to-S3 upload has actually succeeded. */
export const updateMyAccountant = (changes: UpdateAccountantInput): Promise<AccountantView> =>
  api
    .patch<{ accountant: AccountantView }>("/v1/accountants/me", changes)
    .then((r) => r.accountant);

/** The current accountant's own photo, presigned + short-lived; null if none
 * has been uploaded yet (API 404s NOT_FOUND) — same "absence is not an
 * error" shape as `useAccountant`. */
export async function getMyPhotoUrl(): Promise<string | null> {
  try {
    const r = await api.get<{ url: string }>("/v1/accountants/me/uploads/photo");
    return r.url;
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") return null;
    throw error;
  }
}

/** Wraps `getMyPhotoUrl` in a query, enabled only once the profile actually
 * has a `photoKey` — otherwise there is nothing to fetch and every mount
 * would just mint a guaranteed 404. */
export function useMyPhotoUrl(hasPhoto: boolean): UseQueryResult<string | null> {
  return useQuery({
    queryKey: ["accountantPhotoUrl"],
    enabled: hasPhoto,
    queryFn: getMyPhotoUrl,
  });
}

/** Upload scope + size cap for profile photos — mirrors
 * `STORAGE_SCOPES.photos` in `apps/api/src/platform/storage.ts`. Not shared
 * across the API/SPA boundary today, so kept in sync by hand; the client
 * check here is a UX nicety, not the security boundary (the API validates
 * the cap itself when minting the presigned URL). */
export const PHOTO_UPLOAD_SCOPE = "photos";
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Uploads a profile photo end to end: presign → direct PUT to S3 → PATCH the
 * profile with the resulting key. Each step runs only after the previous one
 * succeeds, and the profile is updated only once the bytes are actually in
 * the bucket — never a half-saved state where `photoKey` names an object
 * that was never written.
 */
export async function uploadPhoto(file: File): Promise<void> {
  const target = await presignUpload({
    scope: PHOTO_UPLOAD_SCOPE,
    filename: file.name,
    contentType: file.type,
  });

  // Direct to S3 — a different host with its own self-authenticating
  // presigned URL, not our API origin — so this deliberately bypasses `api`
  // (which would attach our bearer access token S3 neither wants nor accepts).
  let putResponse: Response;
  try {
    putResponse = await fetch(target.uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "content-type": file.type },
    });
  } catch {
    throw new Error("Could not reach file storage. Check your connection and try again.");
  }
  if (!putResponse.ok) {
    throw new Error(`Upload failed (${String(putResponse.status)}). Try again.`);
  }

  await updateMyAccountant({ photoKey: target.key });
}

export type { AccountantView };
