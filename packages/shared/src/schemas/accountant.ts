import { z } from "zod";
import { phoneSchema } from "./user.js";

/**
 * Accountant profiles — feature inventory §6, legacy `accountants/{uid}`.
 *
 * Two pieces of schema debt from inventory §17.2 are fixed here rather than
 * carried forward:
 *
 * 1. **`experience` vs `experienceYears`.** Two fields, one meaning, three
 *    readers with inconsistent fallbacks. Collapsed to `experienceYears`.
 * 2. **Two qualification vocabularies** (`constants.js` vs `rateSlab.js`)
 *    written to the same field. One list here.
 */

export const QUALIFICATIONS = [
  "ca",
  "cma",
  "cs",
  "mcom",
  "bcom",
  "mba_finance",
  "ca_inter",
  "cma_inter",
  "cs_inter",
  "other",
] as const;

export type Qualification = (typeof QUALIFICATIONS)[number];

export const LANGUAGES = [
  "english",
  "hindi",
  "marathi",
  "gujarati",
  "tamil",
  "telugu",
  "kannada",
  "malayalam",
  "bengali",
  "punjabi",
  "odia",
  "assamese",
  "other",
] as const;

/** Indian Financial System Code: 4 letters, 0, then 6 alphanumerics. */
export const ifscSchema = z
  .string()
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "IFSC must look like HDFC0001234");

/** Permanent Account Number: 5 letters, 4 digits, 1 letter. */
export const panSchema = z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "PAN must look like ABCDE1234F");

/**
 * What an accountant may set on their own profile.
 *
 * Note what is absent, and deliberately so: `verified`, `examScore`,
 * `examTotal`, `rating` and `reviewsCount`. In the legacy system those were
 * kept out of reach by a `firestore.rules` clause
 * (`!diff.affectedKeys().hasAny([...])`); with the rules layer gone the schema
 * is the first of two guards, and the service is the second.
 */
export const accountantProfileSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.email().optional(),
  phone: phoneSchema.optional(),
  city: z.string().min(1).max(80),
  state: z.string().min(1).max(80),
  bio: z.string().max(2000).optional(),
  qualifications: z.array(z.enum(QUALIFICATIONS)).min(1),
  /** Collapsed from the legacy `experience` / `experienceYears` pair. */
  experienceYears: z.number().int().min(0).max(60),
  /** Service ids from the catalogue. */
  specialties: z.array(z.string()).min(1),
  languages: z.array(z.enum(LANGUAGES)).min(1),
  accountingSoftware: z.array(z.string()).default([]),
  complianceSoftware: z.array(z.string()).default([]),
  /**
   * Object keys into S3 — never URLs, never presigned — set by the client
   * after a direct-to-S3 upload via a presigned PUT (`POST
   * /v1/uploads/presign`, see `docs/specs/2026-07-25-s3-storage-slice.md`).
   * Validated here only for shape; a schema has no notion of "the caller's
   * own uid", so the actual security property — this key names an object
   * the caller owns — is a server-side prefix check
   * (`assertOwnedKeys` in `accountants.service.ts`). Not server-owned: unlike
   * `SERVER_OWNED_ACCOUNTANT_FIELDS` below, the client legitimately sets
   * these once it holds a key from a completed upload.
   */
  photoKey: z.string().max(300).optional(),
  marksheetKeys: z.array(z.string().max(300)).max(10).optional(),
});

export const createAccountantSchema = accountantProfileSchema;
export const updateAccountantSchema = accountantProfileSchema.partial();

/**
 * KYC submission. Never returned by any endpoint in this form — responses
 * carry masked values only, and the full value is decrypted solely where it is
 * genuinely needed, with the access audited (§6.7).
 */
export const kycSubmissionSchema = z.object({
  pan: panSchema,
  bankAccountNumber: z.string().regex(/^\d{9,18}$/, "bank account number must be 9-18 digits"),
  ifsc: ifscSchema,
  bankAccountHolderName: z.string().min(1).max(120),
});

export type AccountantProfileInput = z.infer<typeof accountantProfileSchema>;
export type CreateAccountantInput = z.infer<typeof createAccountantSchema>;
export type UpdateAccountantInput = z.infer<typeof updateAccountantSchema>;
export type KycSubmissionInput = z.infer<typeof kycSubmissionSchema>;

/**
 * Fields the server owns absolutely. Listed once, exported, and asserted by a
 * denial test — so "which fields can a client never set" has exactly one
 * answer that code and tests both read from.
 */
export const SERVER_OWNED_ACCOUNTANT_FIELDS = [
  "verified",
  "examScore",
  "examTotal",
  "rating",
  "reviewsCount",
  "firebaseUid",
  "kyc",
] as const;
