import type { Service } from "../schemas/service.js";

/**
 * The service catalogue — feature inventory §19.
 *
 * Ported verbatim from the frozen legacy `functions/seed.js`, which is the
 * script that populates the Firestore `services` collection.
 *
 * ## Why all seven are here
 *
 * Inventory §17.2 records this as schema debt: the legacy client ships a
 * `FALLBACK_SERVICES` constant containing **one** service (bookkeeping), while
 * the pricing engine, SOP templates, booking validator and this seed script all
 * define **seven**. So unless `seed.js` was actually run against production, six
 * services are invisible in the live app while every downstream engine believes
 * they exist.
 *
 * Keeping the seven in the shared contract means both frontends and the API now
 * read one list. The discrepancy cannot silently reappear.
 *
 * ## Not the same list as PROFILE_SERVICES
 *
 * `reference/profile-options.ts` exports a *different* ten-entry service
 * vocabulary used on profiles for matching (`tds`, `itr`, `roc`, `einvoicing`,
 * `other` — and no `tax` or `statements`). The two disagree. Both are carried
 * forward unreconciled: choosing between them is a product decision (spec §18
 * Q3, "seed the six missing services or become bookkeeping-only"), not a
 * porting decision.
 */
export const SERVICES: readonly Service[] = [
  { id: "bookkeeping", name: "Bookkeeping & Reconciliation", active: true },
  { id: "tax", name: "Tax Preparation & Filing", active: true },
  { id: "payroll", name: "Payroll Processing", active: true },
  { id: "gst", name: "GST / VAT Returns", active: true },
  { id: "statements", name: "Financial Statements", active: true },
  { id: "advisory", name: "Advisory & Cash Flow", active: true },
  { id: "audit", name: "Audit Support", active: true },
];

/**
 * Physical exam centres — feature inventory §19, legacy `functions/seed.js`.
 *
 * Retained under the keep-everything policy. The online test replaced physical
 * centres, which makes `AppointmentStep` and `FALLBACK_CENTERS` inventory §20
 * dead code — but the restore/rebuild decision is not yet made, and the data
 * costs nothing to carry.
 */
export const EXAM_CENTERS = [
  { id: "c1", name: "Nariman Point Centre", city: "Mumbai" },
  { id: "c2", name: "Koramangala Centre", city: "Bengaluru" },
  { id: "c3", name: "Connaught Place Centre", city: "Delhi" },
  { id: "c4", name: "Banjara Hills Centre", city: "Hyderabad" },
  { id: "c5", name: "Shivajinagar Centre", city: "Pune" },
  { id: "c6", name: "T. Nagar Centre", city: "Chennai" },
] as const;
