import { LANGUAGES, QUALIFICATIONS, type Qualification } from "@bya/shared";
import mongoose, { type Model } from "mongoose";

/** A value sealed by `helpers/crypto.helper.ts`. Stored, never returned. */
export interface SealedField {
  ciphertext: string;
  iv: string;
  tag: string;
  wrappedKey: string;
  keyId: string;
}

const sealedSchema = new mongoose.Schema<SealedField>(
  {
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    tag: { type: String, required: true },
    wrappedKey: { type: String, required: true },
    keyId: { type: String, required: true },
  },
  { _id: false },
);

/**
 * KYC, embedded rather than a subcollection.
 *
 * The legacy layout puts it in `accountants/{uid}/kyc/private` specifically so
 * it is "never accidentally read in a list query". Embedding would undo that —
 * except that here, no query returns a raw document to a caller. Every response
 * goes through `accountants.serializers.ts`, which builds the response shape
 * per role and has no path that emits these fields. Embedding then buys
 * transactional consistency between profile and KYC without giving anything up.
 */
export interface AccountantKyc {
  panMasked: string;
  panSealed: SealedField;
  bankAccountMasked: string;
  bankAccountSealed: SealedField;
  ifsc: string;
  bankAccountHolderName: string;
  submittedAt: Date;
  verifiedAt?: Date;
  verifiedBy?: string;
}

export interface AccountantDocument {
  authUid: string;
  name: string;
  email?: string;
  phone?: string;
  city: string;
  state: string;
  bio?: string;
  qualifications: Qualification[];
  experienceYears: number;
  specialties: string[];
  languages: string[];
  accountingSoftware: string[];
  complianceSoftware: string[];
  /**
   * Object keys into S3, never URLs. Client-set (after a direct-to-S3
   * upload), but owner-prefix-guarded — see `assertOwnedKeys` in
   * `accountants.service.ts`.
   */
  photoKey?: string;
  marksheetKeys?: string[];

  // ---- server-owned: no client payload can reach these ----
  verified: boolean;
  examScore: number;
  examTotal: number;
  rating: number;
  reviewsCount: number;
  verifiedAt?: Date;
  verifiedBy?: string;

  kyc?: AccountantKyc;
  legacyId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const kycSchema = new mongoose.Schema<AccountantKyc>(
  {
    panMasked: { type: String, required: true },
    panSealed: { type: sealedSchema, required: true },
    bankAccountMasked: { type: String, required: true },
    bankAccountSealed: { type: sealedSchema, required: true },
    ifsc: { type: String, required: true },
    bankAccountHolderName: { type: String, required: true },
    submittedAt: { type: Date, required: true },
    verifiedAt: { type: Date, required: false },
    verifiedBy: { type: String, required: false },
  },
  { _id: false },
);

const schema = new mongoose.Schema<AccountantDocument>(
  {
    authUid: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    email: { type: String, required: false },
    phone: { type: String, required: false },
    city: { type: String, required: true },
    state: { type: String, required: true },
    bio: { type: String, required: false },
    qualifications: { type: [String], required: true, enum: QUALIFICATIONS },
    experienceYears: { type: Number, required: true, min: 0 },
    specialties: { type: [String], required: true },
    languages: { type: [String], required: true, enum: LANGUAGES },
    accountingSoftware: { type: [String], required: true, default: [] },
    complianceSoftware: { type: [String], required: true, default: [] },
    photoKey: { type: String, required: false },
    // `default: undefined` looks redundant but is not: Mongoose implicitly
    // defaults EVERY array-typed path to `[]` unless told otherwise, so
    // without this an accountant who never uploaded a marksheet would still
    // get `marksheetKeys: []` (not absent) — silently defeating the
    // `document.marksheetKeys === undefined` check in `privateView` and
    // showing an empty list to every accountant, forever, on a field the
    // shared schema deliberately models as optional (no `.default([])`,
    // unlike `accountingSoftware`/`complianceSoftware` above).
    marksheetKeys: { type: [String], required: false, default: undefined },

    verified: { type: Boolean, required: true, default: false },
    examScore: { type: Number, required: true, default: 0 },
    examTotal: { type: Number, required: true, default: 0 },
    rating: { type: Number, required: true, default: 0 },
    reviewsCount: { type: Number, required: true, default: 0 },
    verifiedAt: { type: Date, required: false },
    verifiedBy: { type: String, required: false },

    kyc: { type: kycSchema, required: false },
    legacyId: { type: String, required: false },
  },
  { timestamps: true, collection: "accountants" },
);

// The marketplace query: verified accountants, by city, matching a specialty.
schema.index({ verified: 1, city: 1, specialties: 1 });

export const AccountantModel: Model<AccountantDocument> =
  (mongoose.models["Accountant"] as Model<AccountantDocument> | undefined) ??
  mongoose.model<AccountantDocument>("Accountant", schema);
