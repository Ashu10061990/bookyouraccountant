import type { LeadUpsertInput } from "@bya/shared";
import { LeadModel, type LeadDocument } from "../models/lead.model.js";

/** Data access for leads. The only file in this module importing Mongoose. */

export interface LeadView {
  authUid: string;
  phone?: string;
  role?: "business" | "accountant";
  mode: string;
  completed: boolean;
  createdAt: Date;
  lastSeenAt: Date;
}

function toView(document: LeadDocument): LeadView {
  return {
    authUid: document.authUid,
    ...(document.phone === undefined ? {} : { phone: document.phone }),
    ...(document.role === undefined ? {} : { role: document.role }),
    mode: document.mode,
    completed: document.completed,
    createdAt: document.createdAt,
    lastSeenAt: document.lastSeenAt,
  };
}

/**
 * Creates or updates the caller's own lead.
 *
 * Upsert rather than insert, matching the legacy `setDoc(..., { merge: true })`:
 * a user who re-enters the funnel updates their lead instead of colliding
 * with it.
 */
export async function upsertOwn(authUid: string, input: LeadUpsertInput): Promise<LeadView> {
  const updated = await LeadModel.findOneAndUpdate(
    { authUid },
    { $set: { ...input, lastSeenAt: new Date() }, $setOnInsert: { authUid } },
    { new: true, upsert: true },
  )
    .lean<LeadDocument>()
    .exec();

  return toView(updated);
}

export async function findOwn(authUid: string): Promise<LeadView | null> {
  const document = await LeadModel.findOne({ authUid }).lean<LeadDocument | null>().exec();
  return document === null ? null : toView(document);
}

export async function findAll(): Promise<LeadView[]> {
  const documents = await LeadModel.find().sort({ createdAt: -1 }).lean<LeadDocument[]>().exec();
  return documents.map(toView);
}
