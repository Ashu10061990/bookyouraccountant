import { z } from "zod";

/**
 * The config documents the platform reads at runtime.
 *
 * Mirrors the legacy `config/{doc}` collection: admin-writable, readable by any
 * signed-in user. The names are load-bearing — the payout engine looks up
 * `platformFees` by this exact string.
 */
export const CONFIG_DOCS = ["platformFees", "complianceOverrides"] as const;

export type ConfigDoc = (typeof CONFIG_DOCS)[number];

/** A proportion of a total, 0–1. Not a percentage — 0.12 means 12%. */
const rateSchema = z.number().min(0).max(1);

/**
 * Statutory and commercial rates for the payout engine.
 *
 * Tunable without a deploy, which is the point: when a rate changes by
 * notification, the platform must follow within hours, not within a release.
 * The defaults live in `reference/payout-rates.ts`; this schema only says what
 * a valid override looks like.
 */
export const platformFeesSchema = z.object({
  takeRate: rateSchema,
  gstOnFeeRate: rateSchema,
  tdsRate: rateSchema,
  gstTcsRate: rateSchema,
  /** Fee floor per engagement, in paise. */
  minFeePaise: z.number().int().min(0),
  /** Annual gross above which TDS applies, in paise. */
  tdsThresholdPaise: z.number().int().min(0),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date, YYYY-MM-DD");

/**
 * A single extended due date.
 *
 * `match` is a keyword matched against the compliance calendar's obligation
 * titles, so one notification can move an obligation without redeploying the
 * calendar itself.
 */
export const complianceExtensionSchema = z.object({
  match: z.string().min(1),
  from: isoDate,
  to: isoDate,
  note: z.string().default(""),
});

export const complianceOverridesSchema = z.object({
  extensions: z.array(complianceExtensionSchema).default([]),
  /**
   * The date an operator last confirmed the calendar against the notified
   * position. Shown to users so they can judge how fresh the dates are — a
   * compliance calendar with no freshness stamp is worse than none.
   */
  verifiedOn: isoDate,
});

/** Maps each config document name to the schema its body must satisfy. */
export const CONFIG_SCHEMAS = {
  platformFees: platformFeesSchema,
  complianceOverrides: complianceOverridesSchema,
} as const satisfies Record<ConfigDoc, z.ZodType>;

export type PlatformFees = z.infer<typeof platformFeesSchema>;
export type ComplianceExtension = z.infer<typeof complianceExtensionSchema>;
export type ComplianceOverrides = z.infer<typeof complianceOverridesSchema>;
