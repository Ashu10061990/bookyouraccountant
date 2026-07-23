import mongoose, { type ClientSession } from "mongoose";
import type { RequestContext } from "../../platform/auth.js";
import * as repository from "./audit.repository.js";

/**
 * Recording of auditable events — spec §6.7.
 *
 * The vocabulary is closed on purpose. A free-form string would drift into
 * `kyc.read`, `kycRead`, `read_kyc` across modules, and an audit log you cannot
 * query reliably is not an audit log.
 */
export const AUDIT_ACTIONS = {
  KYC_READ: "kyc.read",
  KYC_WRITE: "kyc.write",
  ACCOUNTANT_VERIFY: "accountant.verify",
  ACCOUNTANT_BLOCK: "accountant.block",
  CONFIG_UPDATE: "config.update",
  SERVICE_CREATE: "service.create",
  SERVICE_UPDATE: "service.update",
  USER_ROLE_CHANGE: "user.roleChange",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface RecordInput {
  action: AuditAction;
  actor: Pick<RequestContext, "uid" | "role">;
  subjectType: string;
  subjectId: string;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Records an event, optionally inside a caller's transaction.
 *
 * Pass the session whenever the event accompanies a state change.
 */
export async function record(input: RecordInput, session?: ClientSession): Promise<void> {
  await repository.append(
    {
      action: input.action,
      actorUid: input.actor.uid,
      actorRole: input.actor.role,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      metadata: input.metadata,
    },
    session,
  );
}

/**
 * Runs `work` and its audit entry in one transaction.
 *
 * This is the shape §6.7 asks for, in one place, so no call site has to
 * remember to open a session and no call site can half-remember. Either both
 * the change and its record land, or neither does.
 *
 * The audit entry is written **after** `work` so it can describe the result —
 * a verification that failed its preconditions should not be recorded as
 * having happened.
 */
export async function withAudit<T>(
  input: Omit<RecordInput, "subjectId"> & { subjectId?: string },
  work: (session: ClientSession) => Promise<{ result: T; subjectId: string }>,
): Promise<T> {
  const session = await mongoose.startSession();

  try {
    let outcome!: { result: T; subjectId: string };

    await session.withTransaction(async () => {
      outcome = await work(session);

      await repository.append(
        {
          action: input.action,
          actorUid: input.actor.uid,
          actorRole: input.actor.role,
          subjectType: input.subjectType,
          subjectId: input.subjectId ?? outcome.subjectId,
          metadata: input.metadata,
        },
        session,
      );
    });

    return outcome.result;
  } finally {
    await session.endSession();
  }
}

export const findBySubject = repository.findBySubject;
export const findByActor = repository.findByActor;
