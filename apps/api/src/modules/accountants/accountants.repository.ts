import type { ClientSession } from "mongoose";
import {
  AccountantModel,
  type AccountantDocument,
  type AccountantKyc,
} from "./accountants.schema.js";

/**
 * Data access for accountants. The only file in this module importing Mongoose.
 *
 * Returns raw documents. Deciding what a caller may see is the serialisers'
 * job, and keeping that decision in exactly one place is what makes §6.5
 * enforceable.
 */

export async function findByUid(firebaseUid: string): Promise<AccountantDocument | null> {
  return AccountantModel.findOne({ firebaseUid }).lean<AccountantDocument | null>().exec();
}

export interface ListFilter {
  city?: string | undefined;
  specialty?: string | undefined;
  limit?: number | undefined;
}

/**
 * Verified accountants only.
 *
 * `verified: true` is baked in rather than passed by the caller — the public
 * listing must never be one forgotten parameter away from showing unverified
 * profiles.
 */
export async function findVerified(filter: ListFilter = {}): Promise<AccountantDocument[]> {
  const query: Record<string, unknown> = { verified: true };
  if (filter.city !== undefined) query["city"] = filter.city;
  if (filter.specialty !== undefined) query["specialties"] = filter.specialty;

  return AccountantModel.find(query)
    .sort({ rating: -1, reviewsCount: -1 })
    .limit(Math.min(filter.limit ?? 50, 100))
    .lean<AccountantDocument[]>()
    .exec();
}

/**
 * A new profile, minus everything the server owns.
 *
 * Optional fields are `T | undefined` because that is what Zod infers for
 * `.optional()`, and `exactOptionalPropertyTypes` treats "absent" and "present
 * but undefined" as different types.
 */
export type NewAccountant = Omit<
  AccountantDocument,
  | "verified"
  | "examScore"
  | "examTotal"
  | "rating"
  | "reviewsCount"
  | "createdAt"
  | "updatedAt"
  | "email"
  | "phone"
  | "bio"
  | "kyc"
  | "verifiedAt"
  | "verifiedBy"
  | "legacyId"
> & {
  email?: string | undefined;
  phone?: string | undefined;
  bio?: string | undefined;
};

export async function insert(profile: NewAccountant): Promise<AccountantDocument> {
  // The server-owned fields are set here, from constants — not merged from the
  // caller's payload. A profile cannot be born verified.
  //
  // Optional fields are added only when present rather than spread: passing an
  // explicit `undefined` stores a null, and it also breaks assignability under
  // exactOptionalPropertyTypes.
  const created = await AccountantModel.create({
    firebaseUid: profile.firebaseUid,
    name: profile.name,
    city: profile.city,
    state: profile.state,
    qualifications: profile.qualifications,
    experienceYears: profile.experienceYears,
    specialties: profile.specialties,
    languages: profile.languages,
    accountingSoftware: profile.accountingSoftware,
    complianceSoftware: profile.complianceSoftware,
    ...(profile.email === undefined ? {} : { email: profile.email }),
    ...(profile.phone === undefined ? {} : { phone: profile.phone }),
    ...(profile.bio === undefined ? {} : { bio: profile.bio }),
    verified: false,
    examScore: 0,
    examTotal: 0,
    rating: 0,
    reviewsCount: 0,
  });

  return created.toObject();
}

/** Applies profile changes. Server-owned fields are rejected before this. */
export async function updateProfile(
  firebaseUid: string,
  changes: Record<string, unknown>,
): Promise<AccountantDocument | null> {
  return AccountantModel.findOneAndUpdate({ firebaseUid }, { $set: changes }, { new: true })
    .lean<AccountantDocument | null>()
    .exec();
}

export async function setKyc(
  firebaseUid: string,
  kyc: AccountantKyc,
  session?: ClientSession,
): Promise<AccountantDocument | null> {
  return AccountantModel.findOneAndUpdate(
    { firebaseUid },
    { $set: { kyc } },
    { new: true, ...(session === undefined ? {} : { session }) },
  )
    .lean<AccountantDocument | null>()
    .exec();
}

/**
 * Marks an accountant verified.
 *
 * The `verified: false` precondition is in the query, not in a prior read —
 * so two admins clicking at once produce one verification, and the second gets
 * null rather than a second audit entry for an event that happened once.
 */
export async function markVerified(
  firebaseUid: string,
  adminUid: string,
  examScore: number,
  examTotal: number,
  session?: ClientSession,
): Promise<AccountantDocument | null> {
  return AccountantModel.findOneAndUpdate(
    { firebaseUid, verified: false },
    {
      $set: { verified: true, verifiedAt: new Date(), verifiedBy: adminUid, examScore, examTotal },
    },
    { new: true, ...(session === undefined ? {} : { session }) },
  )
    .lean<AccountantDocument | null>()
    .exec();
}
