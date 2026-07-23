import {
  SERVER_OWNED_BUSINESS_FIELDS,
  type CreateBusinessInput,
  type OrgPanSubmissionInput,
  type UpdateBusinessInput,
} from "@bya/shared";
import type { RequestContext } from "../../platform/auth.js";
import { type Cipher, maskPan } from "../../platform/crypto.js";
import { conflict, forbidden, notFound } from "../../platform/errors.js";
import { AUDIT_ACTIONS, record, withAudit } from "../audit/audit.service.js";
import * as repository from "./businesses.repository.js";
import type { BusinessDocument } from "./businesses.schema.js";

/**
 * Business rules for organisations.
 *
 * Legacy rules being replaced:
 * ```
 * allow read:   if isOwner(bizId) || isAdmin();
 * allow create: if isOwner(bizId) && request.resource.data.uid == bizId;
 * allow update: if isOwner(bizId) && request.resource.data.uid == bizId
 *               && !('orgPanEncrypted' in request.resource.data.diff(resource).affectedKeys());
 * ```
 *
 * The legacy comment on that update rule is worth keeping in mind: it admits
 * the `orgPanEncrypted` guard is fragile ("on re-submits that field may be
 * absent/!present on one side and trip the comparison") and leans on the fact
 * that the client form never sends it. Here the field is simply unreachable
 * from the profile path — it has its own endpoint — so the guarantee does not
 * depend on what a form happens to submit.
 */

function assertNoServerOwnedFields(payload: unknown): void {
  if (typeof payload !== "object" || payload === null) return;

  const present = SERVER_OWNED_BUSINESS_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(payload, field),
  );

  if (present.length > 0) {
    throw forbidden(`These fields are not yours to set: ${present.join(", ")}.`);
  }
}

export async function createProfile(
  ctx: RequestContext,
  input: CreateBusinessInput,
  rawBody: unknown,
): Promise<BusinessDocument> {
  // Against the raw body: the schema strips unknown keys, so by parse time an
  // attempt to set freeDayCouponUsed would be invisible rather than refused.
  assertNoServerOwnedFields(rawBody);

  if ((await repository.findByUid(ctx.uid)) !== null) {
    throw conflict("You already have a business profile.");
  }

  return repository.insert({ firebaseUid: ctx.uid, ...input });
}

export async function updateOwnProfile(
  ctx: RequestContext,
  changes: UpdateBusinessInput,
  rawBody: unknown,
): Promise<BusinessDocument> {
  assertNoServerOwnedFields(rawBody);

  const updated = await repository.updateProfile(ctx.uid, changes);
  if (updated === null) throw notFound("You do not have a business profile yet.");

  return updated;
}

/**
 * Reads a business profile.
 *
 * Owner or admin only — a business is not a marketplace listing, and no other
 * role has a reason to read one. An accountant learns a client's details
 * through the assignment that connects them, not by fetching a profile.
 */
export async function getForViewer(
  ctx: RequestContext,
  subjectUid: string,
): Promise<BusinessDocument> {
  if (ctx.uid !== subjectUid && ctx.role !== "admin") {
    throw forbidden("You do not have access to this business.");
  }

  const document = await repository.findByUid(subjectUid);
  if (document === null) throw notFound("No such business.");

  return document;
}

export async function submitOrgPan(
  ctx: RequestContext,
  input: OrgPanSubmissionInput,
  cipher: Cipher,
): Promise<BusinessDocument> {
  if ((await repository.findByUid(ctx.uid)) === null) {
    throw notFound("Create your business profile before submitting the organisation PAN.");
  }

  const sealed = await cipher.seal(input.orgPan);

  return withAudit(
    {
      action: AUDIT_ACTIONS.KYC_WRITE,
      actor: ctx,
      subjectType: "business",
      subjectId: ctx.uid,
      metadata: { fields: ["orgPan"] },
    },
    async (session) => {
      const updated = await repository.setOrgPan(ctx.uid, maskPan(input.orgPan), sealed, session);
      if (updated === null) throw notFound("You do not have a business profile yet.");

      return { result: updated, subjectId: ctx.uid };
    },
  );
}

/** The only path to the organisation's PAN in plaintext. Admin only, audited. */
export async function readOrgPanPlaintext(
  ctx: RequestContext,
  subjectUid: string,
  cipher: Cipher,
): Promise<{ orgPan: string }> {
  if (ctx.role !== "admin") {
    throw forbidden("Only an administrator may read the organisation PAN.");
  }

  const document = await repository.findByUid(subjectUid);
  if (document?.orgPanSealed === undefined) {
    throw notFound("No organisation PAN on file for this business.");
  }

  await record({
    action: AUDIT_ACTIONS.KYC_READ,
    actor: ctx,
    subjectType: "business",
    subjectId: subjectUid,
    metadata: { fields: ["orgPan"] },
  });

  return { orgPan: await cipher.open(document.orgPanSealed) };
}
