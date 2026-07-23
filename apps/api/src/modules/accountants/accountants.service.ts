import {
  SERVER_OWNED_ACCOUNTANT_FIELDS,
  type CreateAccountantInput,
  type KycSubmissionInput,
  type UpdateAccountantInput,
} from "@bya/shared";
import type { RequestContext } from "../../platform/auth.js";
import type { Cipher } from "../../platform/crypto.js";
import { maskAccountNumber, maskPan } from "../../platform/crypto.js";
import { conflict, forbidden, notFound } from "../../platform/errors.js";
import { AUDIT_ACTIONS, record, withAudit } from "../audit/audit.service.js";
import * as repository from "./accountants.repository.js";
import type { AccountantDocument } from "./accountants.schema.js";

/**
 * Business rules for accountants.
 *
 * ## The rules being replaced
 *
 * ```
 * allow create: if isOwner(accId) && request.resource.data.uid == accId
 *               && !('verified' in req && req.verified == true)
 *               && (!('examScore' in req) || req.examScore == 0)
 *               && (!('rating' in req) || req.rating == 0);
 * allow update: if isOwner(accId) && req.uid == accId
 *               && !req.diff(resource).affectedKeys()
 *                    .hasAny(['verified','examScore','examTotal','rating','reviewsCount']);
 * match /kyc/{docId} { allow read: if isOwner(accId) || isAdmin(); allow write: if false; }
 * ```
 *
 * Everything there is anti-self-promotion: an accountant must not be able to
 * mark themselves verified, award themselves an exam score, or invent a rating.
 * Verification is what lets them take paid work, so it is the single most
 * valuable field in the system to forge.
 *
 * Guarded three times over, deliberately: the shared schema has no such fields,
 * `assertNoServerOwnedFields` rejects them if a caller bypasses the schema, and
 * the repository sets them from constants rather than merging the payload.
 */

/** Rejects any attempt to set a server-owned field, whatever the route did. */
function assertNoServerOwnedFields(payload: unknown): void {
  if (typeof payload !== "object" || payload === null) return;

  const present = SERVER_OWNED_ACCOUNTANT_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(payload, field),
  );

  if (present.length > 0) {
    throw forbidden(`These fields are not yours to set: ${present.join(", ")}.`);
  }
}

export async function createProfile(
  ctx: RequestContext,
  input: CreateAccountantInput,
  rawBody: unknown,
): Promise<AccountantDocument> {
  // Checked against the RAW body, not the parsed input: the schema strips
  // unknown keys, so by the time it is parsed an attempt is invisible. An
  // attempt to set `verified` should be refused loudly, not silently ignored.
  assertNoServerOwnedFields(rawBody);

  if ((await repository.findByUid(ctx.uid)) !== null) {
    throw conflict("You already have an accountant profile.");
  }

  return repository.insert({ firebaseUid: ctx.uid, ...input });
}

export async function updateOwnProfile(
  ctx: RequestContext,
  changes: UpdateAccountantInput,
  rawBody: unknown,
): Promise<AccountantDocument> {
  assertNoServerOwnedFields(rawBody);

  const updated = await repository.updateProfile(ctx.uid, changes);
  if (updated === null) throw notFound("You do not have an accountant profile yet.");

  return updated;
}

export async function getByUid(firebaseUid: string): Promise<AccountantDocument> {
  const document = await repository.findByUid(firebaseUid);
  if (document === null) throw notFound("No such accountant.");

  return document;
}

export function listVerified(filter: repository.ListFilter): Promise<AccountantDocument[]> {
  return repository.findVerified(filter);
}

/**
 * Stores KYC, encrypted.
 *
 * The plaintext exists only inside this function. What reaches the database is
 * the sealed value plus a mask; nothing else in the module can reproduce the
 * original without going through the audited read path below.
 *
 * In the legacy system this write happens in a Cloud Function precisely so the
 * client never holds the encryption key — `allow write: if false` on the KYC
 * subcollection. Same property here: the route accepts plaintext over TLS and
 * seals it server-side.
 */
export async function submitKyc(
  ctx: RequestContext,
  input: KycSubmissionInput,
  cipher: Cipher,
): Promise<AccountantDocument> {
  if ((await repository.findByUid(ctx.uid)) === null) {
    throw notFound("Create your accountant profile before submitting KYC.");
  }

  const [panSealed, bankAccountSealed] = await Promise.all([
    cipher.seal(input.pan),
    cipher.seal(input.bankAccountNumber),
  ]);

  return withAudit(
    {
      action: AUDIT_ACTIONS.KYC_WRITE,
      actor: ctx,
      subjectType: "accountant",
      subjectId: ctx.uid,
      // The fact of the submission, never the values.
      metadata: { fields: ["pan", "bankAccountNumber"] },
    },
    async (session) => {
      const updated = await repository.setKyc(
        ctx.uid,
        {
          panMasked: maskPan(input.pan),
          panSealed,
          bankAccountMasked: maskAccountNumber(input.bankAccountNumber),
          bankAccountSealed,
          ifsc: input.ifsc,
          bankAccountHolderName: input.bankAccountHolderName,
          submittedAt: new Date(),
        },
        session,
      );

      if (updated === null) throw notFound("You do not have an accountant profile yet.");

      return { result: updated, subjectId: ctx.uid };
    },
  );
}

/**
 * Decrypts KYC. **The only path to plaintext.**
 *
 * Every call is audited before the value is returned, so an unaudited read is
 * impossible without editing this function. §6.7 names "every KYC access" as
 * auditable, and this is where that is enforced rather than requested.
 *
 * Restricted to admins here. The payout job will need the bank account too;
 * when it lands it gets its own action rather than reusing an admin path.
 */
export async function readKycPlaintext(
  ctx: RequestContext,
  subjectUid: string,
  cipher: Cipher,
): Promise<{ pan: string; bankAccountNumber: string }> {
  if (ctx.role !== "admin") {
    throw forbidden("Only an administrator may read full KYC details.");
  }

  const document = await repository.findByUid(subjectUid);
  if (document?.kyc === undefined) throw notFound("No KYC on file for this accountant.");

  // Recorded before the value is handed over, so a crash mid-response still
  // leaves evidence that the read happened.
  await record({
    action: AUDIT_ACTIONS.KYC_READ,
    actor: ctx,
    subjectType: "accountant",
    subjectId: subjectUid,
    metadata: { fields: ["pan", "bankAccountNumber"] },
  });

  const [pan, bankAccountNumber] = await Promise.all([
    cipher.open(document.kyc.panSealed),
    cipher.open(document.kyc.bankAccountSealed),
  ]);

  return { pan, bankAccountNumber };
}

/**
 * Marks an accountant verified — admin only, audited, idempotent.
 *
 * Verification is the gate to paid work, so it is both the most valuable field
 * to forge and the one most worth an immutable record of who granted it.
 */
export async function verifyAccountant(
  ctx: RequestContext,
  subjectUid: string,
  examScore: number,
  examTotal: number,
): Promise<AccountantDocument> {
  if (ctx.role !== "admin") throw forbidden("Only an administrator may verify an accountant.");

  const existing = await repository.findByUid(subjectUid);
  if (existing === null) throw notFound("No such accountant.");
  if (existing.verified) throw conflict("This accountant is already verified.");

  return withAudit(
    {
      action: AUDIT_ACTIONS.ACCOUNTANT_VERIFY,
      actor: ctx,
      subjectType: "accountant",
      subjectId: subjectUid,
      metadata: { examScore, examTotal },
    },
    async (session) => {
      const updated = await repository.markVerified(
        subjectUid,
        ctx.uid,
        examScore,
        examTotal,
        session,
      );

      // Null means another admin verified between the read and the write. The
      // precondition lives in the query, so exactly one of them wins.
      if (updated === null) throw conflict("This accountant is already verified.");

      return { result: updated, subjectId: subjectUid };
    },
  );
}
