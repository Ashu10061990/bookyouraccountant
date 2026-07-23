import type { ClientSession } from "mongoose";
import { AuditModel, type AuditDocument } from "./audit.schema.js";

/**
 * Data access for the audit log.
 *
 * **This module deliberately exports no update and no delete function.** Spec
 * §6.7: "No update or delete path exists in code." That is the entire
 * enforcement mechanism — a Mongoose schema cannot stop a caller who holds the
 * model, so the guarantee is that no such caller can be written without adding
 * a function here, which a reviewer would see. `audit.test.ts` asserts this
 * module's exported surface, so adding one breaks the build.
 */

export interface AppendAuditEntry {
  action: string;
  actorUid: string;
  actorRole: AuditDocument["actorRole"];
  subjectType: string;
  subjectId: string;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Appends one entry.
 *
 * `session` is not optional by accident — callers recording a state change pass
 * the same session as that change, so the two commit together or not at all.
 * Without it, a crash between the action and its record leaves either an
 * unrecorded admin override or an audit entry for something that never
 * happened. For statutory records both are unacceptable.
 */
export async function append(
  entry: AppendAuditEntry,
  session?: ClientSession,
): Promise<AuditDocument> {
  const [created] = await AuditModel.create(
    [
      {
        action: entry.action,
        actorUid: entry.actorUid,
        actorRole: entry.actorRole,
        subjectType: entry.subjectType,
        subjectId: entry.subjectId,
        ...(entry.metadata === undefined ? {} : { metadata: entry.metadata }),
        at: new Date(),
      },
    ],
    session === undefined ? {} : { session },
  );

  // create() with an array always returns one document per input.
  if (created === undefined) throw new Error("audit append returned no document");

  return created.toObject();
}

/** Everything recorded about one subject, newest first. */
export async function findBySubject(
  subjectType: string,
  subjectId: string,
): Promise<AuditDocument[]> {
  return AuditModel.find({ subjectType, subjectId })
    .sort({ at: -1 })
    .lean<AuditDocument[]>()
    .exec();
}

/** Everything one actor did, newest first. */
export async function findByActor(actorUid: string): Promise<AuditDocument[]> {
  return AuditModel.find({ actorUid }).sort({ at: -1 }).lean<AuditDocument[]>().exec();
}

export async function count(): Promise<number> {
  return AuditModel.countDocuments().exec();
}
