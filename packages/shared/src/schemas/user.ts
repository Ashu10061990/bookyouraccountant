import { z } from "zod";

/** Every role the platform recognises. */
export const USER_ROLES = ["business", "accountant", "admin"] as const;

/**
 * The roles a user may give themselves.
 *
 * `admin` is deliberately absent. In the legacy system this was enforced by a
 * `firestore.rules` clause — `request.resource.data.role in ['business',
 * 'accountant']` — and by nothing else. The Node API removes that layer, so the
 * restriction has to live here and be asserted by a denial test.
 *
 * Admin is granted out of band, by an operator, never through the API.
 */
export const SELF_ASSIGNABLE_ROLES = ["business", "accountant"] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type SelfAssignableRole = (typeof SELF_ASSIGNABLE_ROLES)[number];

/** E.164, as Firebase Auth issues it. */
export const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, "phone must be in E.164 format, e.g. +919876543210");

const emailSchema = z.email("must be a valid email address");

/**
 * What a client may send when creating its own user document.
 *
 * There is no `firebaseUid` field on purpose: identity comes from the verified
 * bearer token, never from the body. A uid in the body is ignored, and a
 * denial test asserts that.
 */
export const createUserSchema = z.object({
  role: z.enum(SELF_ASSIGNABLE_ROLES),
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
});

/** What a client may change about itself afterwards. */
export const updateUserSchema = z.object({
  role: z.enum(SELF_ASSIGNABLE_ROLES).optional(),
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
});

/** The stored document. `blocked` and `role: admin` are server-owned. */
export const userSchema = z.object({
  firebaseUid: z.string().min(1),
  role: z.enum(USER_ROLES),
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
  blocked: z.boolean().default(false),
  createdAt: z.date(),
  lastLoginAt: z.date().optional(),
  // Its Firestore document id, kept for traceability and rollback through the
  // §14 migration. Absent on records created natively in Mongo.
  legacyId: z.string().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type User = z.infer<typeof userSchema>;
