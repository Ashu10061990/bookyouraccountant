import { ENTITY_TYPES, SIGNATORY_ROLES } from "@bya/shared";
import mongoose, { type Model } from "mongoose";
import type { SealedField } from "./accountant.model.js";

/**
 * The `businesses` collection.
 *
 * Owner-and-admin only. Unlike accountants there is no public view, so there is
 * no serialiser choosing between audiences — but the org PAN still never leaves
 * the server in plaintext, and the masked form is what responses carry.
 */
export interface BusinessDocument {
  authUid: string;
  fullName: string;
  signatoryRole: string;
  email?: string;
  phone?: string;
  orgName: string;
  orgType: string;
  gstin?: string;
  address: { line: string; city: string; state: string; pincode: string };
  industry?: string;
  employees?: string;

  // ---- server-owned ----
  orgPanMasked?: string;
  orgPanSealed?: SealedField;
  /** Whether the first-day-free coupon has been used (§12.2). */
  freeDayCouponUsed: boolean;

  legacyId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const sealedSchema = new mongoose.Schema(
  {
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    tag: { type: String, required: true },
    wrappedKey: { type: String, required: true },
    keyId: { type: String, required: true },
  },
  { _id: false },
);

const schema = new mongoose.Schema<BusinessDocument>(
  {
    authUid: { type: String, required: true, unique: true, index: true },
    fullName: { type: String, required: true },
    signatoryRole: { type: String, required: true, enum: SIGNATORY_ROLES },
    email: { type: String, required: false },
    phone: { type: String, required: false },
    orgName: { type: String, required: true },
    orgType: { type: String, required: true, enum: ENTITY_TYPES },
    gstin: { type: String, required: false },
    address: {
      line: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
    },
    industry: { type: String, required: false },
    employees: { type: String, required: false },

    orgPanMasked: { type: String, required: false },
    orgPanSealed: { type: sealedSchema, required: false },
    // Server-owned: a business setting this itself would be claiming a free
    // day it has already spent. §12.2.
    freeDayCouponUsed: { type: Boolean, required: true, default: false },

    legacyId: { type: String, required: false },
  },
  { timestamps: true, collection: "businesses" },
);

export const BusinessModel: Model<BusinessDocument> =
  (mongoose.models["Business"] as Model<BusinessDocument> | undefined) ??
  mongoose.model<BusinessDocument>("Business", schema);
