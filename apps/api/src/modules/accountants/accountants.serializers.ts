import type { UserRole } from "@bya/shared";
import type { AccountantDocument } from "./accountants.schema.js";

/**
 * Field-level response serialisation by role — spec §6.5.
 *
 * > "Field-level response serialisation per role, so an endpoint physically
 * > cannot return bank details to the wrong audience — rather than relying on
 * > developers to strip them each time."
 *
 * ## The risk this closes
 *
 * Spec §18 records, as an accepted risk on the frozen legacy app: *"`accountants`
 * read rule allows public reads — bank account numbers, IFSC codes, phone and
 * email of every verified accountant are world-readable."* That is live in
 * production today. The rule is `allow read: if isSignedIn() || resource.data.verified == true`,
 * and it returns the **whole document**.
 *
 * The fix is structural rather than diligent. Every view below is built by
 * naming the fields it includes. There is no `{...document}` spread and no
 * delete-the-bad-fields step anywhere in this file, so a field added to the
 * schema is invisible to every response until someone adds it to a view by
 * name — and adding a sensitive one to `publicView` is a visible, reviewable
 * act rather than an omission.
 *
 * Deny-by-default, in the shape of an allowlist. The legacy version was
 * allow-by-default with rules trying to claw it back.
 */

/** Safe for anyone, signed in or not. The marketing showcase. */
export interface PublicAccountantView {
  firebaseUid: string;
  name: string;
  city: string;
  state: string;
  bio?: string;
  qualifications: string[];
  experienceYears: number;
  specialties: string[];
  languages: string[];
  accountingSoftware: string[];
  complianceSoftware: string[];
  verified: boolean;
  rating: number;
  reviewsCount: number;
}

/** The owner's own record, and what an admin sees. Adds contact + masked KYC. */
export interface PrivateAccountantView extends PublicAccountantView {
  email?: string;
  phone?: string;
  examScore: number;
  examTotal: number;
  verifiedAt?: Date;
  createdAt: Date;
  kyc?: {
    panMasked: string;
    bankAccountMasked: string;
    ifsc: string;
    bankAccountHolderName: string;
    submittedAt: Date;
    verifiedAt?: Date;
  };
}

export type AccountantView = PublicAccountantView | PrivateAccountantView;

/**
 * Built field by field, never spread.
 *
 * Contact details are absent on purpose: phone and email being world-readable
 * is half of the accepted risk above. A business that has actually engaged an
 * accountant gets contact details through the assignment, not by browsing.
 */
export function publicView(document: AccountantDocument): PublicAccountantView {
  return {
    firebaseUid: document.firebaseUid,
    name: document.name,
    city: document.city,
    state: document.state,
    ...(document.bio === undefined ? {} : { bio: document.bio }),
    qualifications: document.qualifications,
    experienceYears: document.experienceYears,
    specialties: document.specialties,
    languages: document.languages,
    accountingSoftware: document.accountingSoftware,
    complianceSoftware: document.complianceSoftware,
    verified: document.verified,
    rating: document.rating,
    reviewsCount: document.reviewsCount,
  };
}

/**
 * The owner's own record, or an admin's view of it.
 *
 * KYC appears **masked only**. The sealed fields have no path out of this
 * module: nothing here reads `panSealed` or `bankAccountSealed`, so no response
 * can carry them however the caller is authorised. Decryption lives in the
 * service, is reachable only by the payout job and admin flows, and is audited.
 */
export function privateView(document: AccountantDocument): PrivateAccountantView {
  return {
    ...publicView(document),
    ...(document.email === undefined ? {} : { email: document.email }),
    ...(document.phone === undefined ? {} : { phone: document.phone }),
    examScore: document.examScore,
    examTotal: document.examTotal,
    ...(document.verifiedAt === undefined ? {} : { verifiedAt: document.verifiedAt }),
    createdAt: document.createdAt,
    ...(document.kyc === undefined
      ? {}
      : {
          kyc: {
            panMasked: document.kyc.panMasked,
            bankAccountMasked: document.kyc.bankAccountMasked,
            ifsc: document.kyc.ifsc,
            bankAccountHolderName: document.kyc.bankAccountHolderName,
            submittedAt: document.kyc.submittedAt,
            ...(document.kyc.verifiedAt === undefined
              ? {}
              : { verifiedAt: document.kyc.verifiedAt }),
          },
        }),
  };
}

/**
 * Picks the view for a caller.
 *
 * The single decision point. A route that forgets which view to use cannot
 * accidentally return the private one — it has to pass who is asking, and the
 * default is public.
 */
export function viewFor(
  document: AccountantDocument,
  viewer: { uid: string; role: UserRole } | null,
): AccountantView {
  if (viewer === null) return publicView(document);

  const isOwner = viewer.uid === document.firebaseUid;
  const isAdmin = viewer.role === "admin";

  return isOwner || isAdmin ? privateView(document) : publicView(document);
}
