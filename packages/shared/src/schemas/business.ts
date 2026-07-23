import { z } from "zod";
import { panSchema } from "./accountant.js";
import { phoneSchema } from "./user.js";

/**
 * Business profiles — feature inventory §5, legacy `businesses/{uid}`.
 *
 * Strictly owner-and-admin, unlike accountants: there is no public view of a
 * business and no marketplace listing of one. The legacy rule was already
 * `allow read: if isOwner(bizId) || isAdmin()`, and nothing here loosens it.
 */

export const ENTITY_TYPES = [
  "proprietorship",
  "partnership",
  "llp",
  "pvt_ltd",
  "public_ltd",
  "opc",
  "huf",
  "trust_society",
  "other",
] as const;

/** The signer's relationship to the organisation. */
export const SIGNATORY_ROLES = [
  "proprietor",
  "director",
  "partner",
  "owner",
  "authorised_signatory",
  "other",
] as const;

/** GSTIN: 2-digit state code, PAN, entity digit, Z, checksum. */
export const gstinSchema = z
  .string()
  .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z0-9]$/, "GSTIN must look like 27ABCDE1234F1Z5");

export const addressSchema = z.object({
  line: z.string().min(1).max(240),
  city: z.string().min(1).max(80),
  state: z.string().min(1).max(80),
  pincode: z.string().regex(/^[1-9]\d{5}$/, "pincode must be 6 digits and not start with 0"),
});

export const businessProfileSchema = z.object({
  fullName: z.string().min(1).max(120),
  signatoryRole: z.enum(SIGNATORY_ROLES),
  email: z.email().optional(),
  phone: phoneSchema.optional(),
  orgName: z.string().min(1).max(200),
  orgType: z.enum(ENTITY_TYPES),
  gstin: gstinSchema.optional(),
  address: addressSchema,
  industry: z.string().max(120).optional(),
  employees: z.string().max(40).optional(),
});

export const createBusinessSchema = businessProfileSchema;
export const updateBusinessSchema = businessProfileSchema.partial();

/**
 * The organisation's PAN, submitted separately and sealed server-side.
 *
 * Its own endpoint rather than a profile field, for the same reason the
 * accountant's is: the legacy rule makes `orgPanEncrypted` immutable through
 * the profile update path (`!('orgPanEncrypted' in diff.affectedKeys())`), and
 * a separate route makes that structural instead of a check to remember.
 */
export const orgPanSubmissionSchema = z.object({ orgPan: panSchema });

/** Fields no client payload may ever set. Asserted by a denial test. */
export const SERVER_OWNED_BUSINESS_FIELDS = [
  "firebaseUid",
  "orgPanSealed",
  "orgPanMasked",
  "freeDayCouponUsed",
] as const;

export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
export type OrgPanSubmissionInput = z.infer<typeof orgPanSubmissionSchema>;
