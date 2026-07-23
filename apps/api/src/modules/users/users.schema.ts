import { USER_ROLES, type UserRole } from "@bya/shared";
import mongoose, { type Model } from "mongoose";

/**
 * The `users` collection — "the root of all rule checks" in the legacy system.
 *
 * Every authorization decision in the API loads a row from here, so its shape
 * and its indexes are load-bearing for security, not just for queries.
 */
export interface UserDocument {
  firebaseUid: string;
  role: UserRole;
  phone?: string;
  email?: string;
  blocked: boolean;
  lastLoginAt?: Date;
  legacyId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new mongoose.Schema<UserDocument>(
  {
    // Unique: one user row per Firebase identity. Without the constraint, a
    // retried signup creates a second row, and which one wins an authorization
    // lookup becomes a matter of natural document order.
    firebaseUid: { type: String, required: true, unique: true, index: true },
    role: { type: String, required: true, enum: USER_ROLES },
    phone: { type: String, required: false },
    email: { type: String, required: false },
    // Server-owned. Not settable through any client payload — the create and
    // update schemas in @bya/shared have no such field, and they strip unknown
    // keys.
    blocked: { type: Boolean, required: true, default: false },
    lastLoginAt: { type: Date, required: false },
    legacyId: { type: String, required: false },
  },
  { timestamps: true, collection: "users" },
);

export const UserModel: Model<UserDocument> =
  (mongoose.models["User"] as Model<UserDocument> | undefined) ??
  mongoose.model<UserDocument>("User", schema);
