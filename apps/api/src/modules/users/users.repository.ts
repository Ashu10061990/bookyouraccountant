import type { UserRole } from "@bya/shared";
import type { AuthUser } from "../../platform/auth.js";
import { UserModel, type UserDocument } from "./users.schema.js";

/**
 * Data access for users. The only file in this module importing Mongoose.
 */

/** What the API returns for a user. Never the raw document. */
export interface UserView {
  firebaseUid: string;
  role: UserRole;
  phone?: string;
  email?: string;
  blocked: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
}

function toView(document: UserDocument): UserView {
  return {
    firebaseUid: document.firebaseUid,
    role: document.role,
    ...(document.phone === undefined ? {} : { phone: document.phone }),
    ...(document.email === undefined ? {} : { email: document.email }),
    blocked: document.blocked,
    createdAt: document.createdAt,
    ...(document.lastLoginAt === undefined ? {} : { lastLoginAt: document.lastLoginAt }),
  };
}

export async function findByFirebaseUid(firebaseUid: string): Promise<UserView | null> {
  const document = await UserModel.findOne({ firebaseUid }).lean<UserDocument | null>().exec();
  return document === null ? null : toView(document);
}

/**
 * The `UserLookup` the auth layer depends on.
 *
 * Deliberately narrow: it returns only role and blocked, so no amount of later
 * change to the user shape can widen what the authentication path reads.
 */
export async function findAuthUser(firebaseUid: string): Promise<AuthUser | null> {
  const document = await UserModel.findOne({ firebaseUid })
    .select({ role: 1, blocked: 1 })
    .lean<Pick<UserDocument, "role" | "blocked"> | null>()
    .exec();

  return document === null ? null : { role: document.role, blocked: document.blocked };
}

/**
 * Optional fields are `T | undefined` rather than `T`, because that is what
 * Zod infers for `.optional()` and `exactOptionalPropertyTypes` treats the two
 * as distinct. Widening here keeps the coercion in one place instead of at
 * every call site.
 */
export async function insert(input: {
  firebaseUid: string;
  role: UserRole;
  phone?: string | undefined;
  email?: string | undefined;
}): Promise<UserView> {
  // Built explicitly rather than spread: omitting the undefined keys keeps
  // Mongoose from storing explicit nulls, and keeps the object assignable
  // under exactOptionalPropertyTypes.
  const created = await UserModel.create({
    firebaseUid: input.firebaseUid,
    role: input.role,
    blocked: false,
    ...(input.phone === undefined ? {} : { phone: input.phone }),
    ...(input.email === undefined ? {} : { email: input.email }),
  });

  return toView(created.toObject());
}

export async function updateByFirebaseUid(
  firebaseUid: string,
  changes: {
    role?: UserRole | undefined;
    phone?: string | undefined;
    email?: string | undefined;
  },
): Promise<UserView | null> {
  const updated = await UserModel.findOneAndUpdate(
    { firebaseUid },
    { $set: changes },
    { new: true },
  )
    .lean<UserDocument | null>()
    .exec();

  return updated === null ? null : toView(updated);
}

export async function touchLastLogin(firebaseUid: string): Promise<void> {
  await UserModel.updateOne({ firebaseUid }, { $set: { lastLoginAt: new Date() } }).exec();
}
