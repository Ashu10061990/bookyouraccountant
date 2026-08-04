import type { BusinessDocument } from "../models/business.model.js";

/**
 * Response shaping for businesses — spec §6.5.
 *
 * There is only one view, because there is only one audience: the owner and an
 * admin. It is still built field by field rather than spread, for the same
 * reason as the accountant serialisers — a sealed field added to the schema
 * later must not become visible by default.
 */
export interface BusinessView {
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
  orgPanMasked?: string;
  freeDayCouponUsed: boolean;
  createdAt: Date;
}

export function businessView(document: BusinessDocument): BusinessView {
  return {
    authUid: document.authUid,
    fullName: document.fullName,
    signatoryRole: document.signatoryRole,
    ...(document.email === undefined ? {} : { email: document.email }),
    ...(document.phone === undefined ? {} : { phone: document.phone }),
    orgName: document.orgName,
    orgType: document.orgType,
    ...(document.gstin === undefined ? {} : { gstin: document.gstin }),
    address: {
      line: document.address.line,
      city: document.address.city,
      state: document.address.state,
      pincode: document.address.pincode,
    },
    ...(document.industry === undefined ? {} : { industry: document.industry }),
    ...(document.employees === undefined ? {} : { employees: document.employees }),
    // Masked only. `orgPanSealed` is deliberately not read anywhere in this
    // file, so no response can carry it.
    ...(document.orgPanMasked === undefined ? {} : { orgPanMasked: document.orgPanMasked }),
    freeDayCouponUsed: document.freeDayCouponUsed,
    createdAt: document.createdAt,
  };
}
