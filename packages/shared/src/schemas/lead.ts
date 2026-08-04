import { z } from "zod";
import { SELF_ASSIGNABLE_ROLES, phoneSchema } from "./user.js";

/**
 * How the lead was captured. The legacy app records only "register" — the
 * capture happens the moment OTP succeeds, before the user finishes signing up
 * — but the field exists so later entry points are distinguishable.
 */
export const LEAD_MODES = ["register", "signin"] as const;

export type LeadMode = (typeof LEAD_MODES)[number];

/**
 * What a client may send for its own lead.
 *
 * `role` is optional because the legacy capture writes `role || intent || ""`
 * — at OTP time the user may not have chosen a side yet. Modelled as optional
 * rather than as an empty string, so "not chosen" is representable without a
 * sentinel value.
 */
export const leadUpsertSchema = z.object({
  phone: phoneSchema.optional(),
  role: z.enum(SELF_ASSIGNABLE_ROLES).optional(),
  mode: z.enum(LEAD_MODES).default("register"),
  completed: z.boolean().default(false),
});

export const leadSchema = z.object({
  authUid: z.string().min(1),
  phone: phoneSchema.optional(),
  role: z.enum(SELF_ASSIGNABLE_ROLES).optional(),
  mode: z.enum(LEAD_MODES),
  /** True once the user finished registering. Drives the admin funnel view. */
  completed: z.boolean(),
  createdAt: z.date(),
  lastSeenAt: z.date(),
  legacyId: z.string().optional(),
});

export type LeadUpsertInput = z.infer<typeof leadUpsertSchema>;
export type Lead = z.infer<typeof leadSchema>;
