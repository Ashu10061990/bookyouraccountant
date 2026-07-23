import type { ClientSession } from "mongoose";
import type { SealedField } from "../accountants/accountants.schema.js";
import { BusinessModel, type BusinessDocument } from "./businesses.schema.js";

/** Data access for businesses. The only file in this module importing Mongoose. */

export type NewBusiness = Pick<
  BusinessDocument,
  "firebaseUid" | "fullName" | "signatoryRole" | "orgName" | "orgType" | "address"
> & {
  email?: string | undefined;
  phone?: string | undefined;
  gstin?: string | undefined;
  industry?: string | undefined;
  employees?: string | undefined;
};

export async function findByUid(firebaseUid: string): Promise<BusinessDocument | null> {
  return BusinessModel.findOne({ firebaseUid }).lean<BusinessDocument | null>().exec();
}

export async function insert(profile: NewBusiness): Promise<BusinessDocument> {
  const optional = {
    ...(profile.email === undefined ? {} : { email: profile.email }),
    ...(profile.phone === undefined ? {} : { phone: profile.phone }),
    ...(profile.gstin === undefined ? {} : { gstin: profile.gstin }),
    ...(profile.industry === undefined ? {} : { industry: profile.industry }),
    ...(profile.employees === undefined ? {} : { employees: profile.employees }),
  };

  const created = await BusinessModel.create({
    firebaseUid: profile.firebaseUid,
    fullName: profile.fullName,
    signatoryRole: profile.signatoryRole,
    orgName: profile.orgName,
    orgType: profile.orgType,
    address: profile.address,
    ...optional,
    // Server-owned, set from a constant rather than merged from the payload.
    freeDayCouponUsed: false,
  });

  return created.toObject();
}

export async function updateProfile(
  firebaseUid: string,
  changes: Record<string, unknown>,
): Promise<BusinessDocument | null> {
  return BusinessModel.findOneAndUpdate({ firebaseUid }, { $set: changes }, { new: true })
    .lean<BusinessDocument | null>()
    .exec();
}

export async function setOrgPan(
  firebaseUid: string,
  orgPanMasked: string,
  orgPanSealed: SealedField,
  session?: ClientSession,
): Promise<BusinessDocument | null> {
  return BusinessModel.findOneAndUpdate(
    { firebaseUid },
    { $set: { orgPanMasked, orgPanSealed } },
    { new: true, ...(session === undefined ? {} : { session }) },
  )
    .lean<BusinessDocument | null>()
    .exec();
}
