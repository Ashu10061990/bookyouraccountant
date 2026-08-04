import { describe, expect, it } from "vitest";
import type { AccountantDocument } from "../models/accountant.model.js";
import { privateView, publicView, viewFor } from "./accountants.serializer.js";

const PAN = "ABCDE1234F";
const ACCOUNT_NUMBER = "50100123456789";
const PHONE = "+919876543210";
const EMAIL = "accountant@example.com";

const sealed = {
  ciphertext: "Y2lwaGVydGV4dA==",
  iv: "aXZpdml2aXZpdg==",
  tag: "dGFndGFndGFndGFn",
  wrappedKey: "d3JhcHBlZGtleQ==",
  keyId: "local-dev",
};

const DOCUMENT: AccountantDocument = {
  authUid: "uid-accountant",
  name: "Asha Menon",
  email: EMAIL,
  phone: PHONE,
  city: "Kochi",
  state: "Kerala",
  bio: "Twelve years in GST and statutory audit.",
  qualifications: ["ca"],
  experienceYears: 12,
  specialties: ["bookkeeping", "gst"],
  languages: ["english", "malayalam"],
  accountingSoftware: ["tally"],
  complianceSoftware: ["clear"],
  verified: true,
  examScore: 82,
  examTotal: 100,
  rating: 4.6,
  reviewsCount: 23,
  verifiedAt: new Date("2026-02-01"),
  verifiedBy: "uid-admin",
  kyc: {
    panMasked: "XXXXX1234F",
    panSealed: sealed,
    bankAccountMasked: "XXXXXXXXXX6789",
    bankAccountSealed: sealed,
    ifsc: "HDFC0001234",
    bankAccountHolderName: "Asha Menon",
    submittedAt: new Date("2026-01-15"),
  },
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-02-01"),
};

/**
 * Spec §18 records this as a live accepted risk on the frozen legacy app:
 * "accountants read rule allows public reads — bank account numbers, IFSC
 * codes, phone and email of every verified accountant are world-readable."
 *
 * These assertions are what stops the rebuild reproducing it.
 */
describe("publicView never leaks what the legacy rule leaked", () => {
  const serialised = JSON.stringify(publicView(DOCUMENT));

  it.each([
    ["bank account number", ACCOUNT_NUMBER],
    ["masked bank account", "XXXXXXXXXX6789"],
    ["IFSC", "HDFC0001234"],
    ["phone", PHONE],
    ["email", EMAIL],
    ["PAN", PAN],
    ["masked PAN", "XXXXX1234F"],
    ["sealed ciphertext", sealed.ciphertext],
    ["wrapped key", sealed.wrappedKey],
  ])("omits the %s", (_label, secret) => {
    expect(serialised).not.toContain(secret);
  });

  it("omits the kyc block entirely, not just its contents", () => {
    expect(publicView(DOCUMENT)).not.toHaveProperty("kyc");
    expect(publicView(DOCUMENT)).not.toHaveProperty("email");
    expect(publicView(DOCUMENT)).not.toHaveProperty("phone");
  });

  it("still carries what a marketplace listing needs", () => {
    const view = publicView(DOCUMENT);

    expect(view).toMatchObject({
      name: "Asha Menon",
      city: "Kochi",
      verified: true,
      rating: 4.6,
      experienceYears: 12,
      specialties: ["bookkeeping", "gst"],
    });
  });

  // The property that makes this structural rather than diligent. The view is
  // built by naming fields, so a sensitive field added to the schema later is
  // invisible here until someone adds it by name — a reviewable act, not an
  // omission.
  it("returns only known-safe keys, so a new schema field cannot leak by default", () => {
    const allowed = [
      "authUid",
      "name",
      "city",
      "state",
      "bio",
      "qualifications",
      "experienceYears",
      "specialties",
      "languages",
      "accountingSoftware",
      "complianceSoftware",
      "verified",
      "rating",
      "reviewsCount",
    ].sort();

    expect(Object.keys(publicView(DOCUMENT)).sort()).toEqual(allowed);
  });

  it("leaks nothing extra when the document gains an unexpected field", () => {
    const withExtra = {
      ...DOCUMENT,
      secretInternalNote: "do not show anyone",
    } as unknown as AccountantDocument;

    expect(JSON.stringify(publicView(withExtra))).not.toContain("do not show anyone");
  });
});

describe("privateView", () => {
  it("adds contact details and the exam result for the owner", () => {
    const view = privateView(DOCUMENT);

    expect(view).toMatchObject({ email: EMAIL, phone: PHONE, examScore: 82, examTotal: 100 });
  });

  // The owner may see *that* their PAN is on file, and enough of it to confirm
  // the right one — never the value. Decryption is a separate, audited path.
  it("shows KYC masked and never the sealed values", () => {
    const view = privateView(DOCUMENT);
    const serialised = JSON.stringify(view);

    expect(view.kyc?.panMasked).toBe("XXXXX1234F");
    expect(view.kyc?.bankAccountMasked).toBe("XXXXXXXXXX6789");

    expect(serialised).not.toContain(PAN);
    expect(serialised).not.toContain(ACCOUNT_NUMBER);
    expect(serialised).not.toContain(sealed.ciphertext);
    expect(serialised).not.toContain(sealed.wrappedKey);
    expect(serialised).not.toContain("panSealed");
    expect(serialised).not.toContain("bankAccountSealed");
  });

  it("omits kyc when none has been submitted", () => {
    const { kyc: _kyc, ...withoutKyc } = DOCUMENT;
    expect(privateView(withoutKyc as AccountantDocument)).not.toHaveProperty("kyc");
  });

  it("never exposes verifiedBy, which names an internal admin account", () => {
    expect(JSON.stringify(privateView(DOCUMENT))).not.toContain("uid-admin");
  });
});

describe("viewFor picks by who is asking", () => {
  it("gives a signed-out caller the public view", () => {
    expect(viewFor(DOCUMENT, null)).not.toHaveProperty("email");
  });

  // The half the legacy rule got wrong: signed in is not the same as
  // entitled. Any signed-in user could read the whole document.
  it("gives another signed-in user the public view, not the private one", () => {
    const view = viewFor(DOCUMENT, { uid: "uid-someone-else", role: "business" });

    expect(view).not.toHaveProperty("email");
    expect(view).not.toHaveProperty("kyc");
    expect(JSON.stringify(view)).not.toContain("HDFC0001234");
  });

  it("gives another accountant the public view", () => {
    expect(viewFor(DOCUMENT, { uid: "uid-rival", role: "accountant" })).not.toHaveProperty("kyc");
  });

  it("gives the owner the private view", () => {
    expect(viewFor(DOCUMENT, { uid: "uid-accountant", role: "accountant" })).toHaveProperty(
      "email",
    );
  });

  it("gives an admin the private view", () => {
    expect(viewFor(DOCUMENT, { uid: "uid-admin", role: "admin" })).toHaveProperty("kyc");
  });

  // Ownership is uid equality, not role. An accountant is not entitled to
  // another accountant's record merely by sharing a role.
  it("does not treat a matching role as ownership", () => {
    const view = viewFor(DOCUMENT, { uid: "not-the-owner", role: "accountant" });
    expect(view).not.toHaveProperty("email");
  });
});
