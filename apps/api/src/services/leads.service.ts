import type { LeadUpsertInput } from "@bya/shared";
import { notFound } from "../errors/app-error.js";
import * as repository from "../repositories/leads.repository.js";
import type { LeadView } from "../repositories/leads.repository.js";

/**
 * Business rules for leads.
 *
 * Legacy rule being replaced:
 * ```
 * match /leads/{uid} {
 *   allow read:           if isOwner(uid) || isAdmin();
 *   allow create, update: if isOwner(uid);
 *   allow delete:         if isAdmin();
 * }
 * ```
 *
 * Ownership is structural rather than checked: every function below takes the
 * uid from the verified token as its identity argument, and there is no code
 * path that accepts a uid from a caller. A guard you cannot forget to write
 * beats a guard you have to remember to write.
 *
 * There is no delete endpoint. The legacy rules allow admin deletion, but
 * deleting a lead is a DPDP-relevant erasure and belongs with the §6.8
 * user-deletion path, together with an audit-log entry — not bolted onto a
 * capture endpoint.
 */

export function upsertOwnLead(authUid: string, input: LeadUpsertInput): Promise<LeadView> {
  return repository.upsertOwn(authUid, input);
}

export async function getOwnLead(authUid: string): Promise<LeadView> {
  const lead = await repository.findOwn(authUid);

  if (lead === null) {
    throw notFound("No lead captured for this account.");
  }

  return lead;
}

/** Admin-only; the route enforces that with `requireRole("admin")`. */
export function listLeads(): Promise<LeadView[]> {
  return repository.findAll();
}
