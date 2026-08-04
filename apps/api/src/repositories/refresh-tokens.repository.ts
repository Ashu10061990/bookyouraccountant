import { RefreshTokenModel, type RefreshTokenDocument } from "../models/refresh-token.model.js";

/**
 * Data access for refresh tokens. Hashes in, hashes stored — the opaque
 * token itself never reaches this module (see `helpers/otp.helper.ts`).
 *
 * There is deliberately no delete function: a revoked or rotated token row
 * is evidence (it is what reuse detection reads), and Mongo's TTL index
 * disposes of rows once they expire.
 */

export interface RefreshTokenRecord {
  tokenHash: string;
  familyId: string;
  authUid: string;
  phone: string;
  rotatedAt?: Date;
  revokedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
}

function toRecord(document: RefreshTokenDocument): RefreshTokenRecord {
  return {
    tokenHash: document.tokenHash,
    familyId: document.familyId,
    authUid: document.authUid,
    phone: document.phone,
    ...(document.rotatedAt === undefined ? {} : { rotatedAt: document.rotatedAt }),
    ...(document.revokedAt === undefined ? {} : { revokedAt: document.revokedAt }),
    expiresAt: document.expiresAt,
    createdAt: document.createdAt,
  };
}

export async function insertRefreshToken(input: {
  tokenHash: string;
  familyId: string;
  authUid: string;
  phone: string;
  expiresAt: Date;
  createdAt: Date;
}): Promise<void> {
  await RefreshTokenModel.create(input);
}

export async function findByTokenHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
  const document = await RefreshTokenModel.findOne({ tokenHash })
    .lean<RefreshTokenDocument | null>()
    .exec();

  return document === null ? null : toRecord(document);
}

/**
 * One-way rotation marker. Guarded (`rotatedAt` must be unset) so two
 * concurrent refreshes with the same token cannot both "win" — the second
 * caller sees `false` and is treated as reuse.
 */
export async function markRotated(tokenHash: string, now: Date): Promise<boolean> {
  const result = await RefreshTokenModel.updateOne(
    { tokenHash, rotatedAt: { $exists: false }, revokedAt: { $exists: false } },
    { $set: { rotatedAt: now } },
  ).exec();

  return result.modifiedCount === 1;
}

/** Kills every token in a family — logout, or the reuse theft signal. */
export async function revokeFamily(familyId: string, now: Date): Promise<void> {
  await RefreshTokenModel.updateMany(
    { familyId, revokedAt: { $exists: false } },
    { $set: { revokedAt: now } },
  ).exec();
}
