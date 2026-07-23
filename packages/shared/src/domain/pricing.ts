import {
  ARAP_SCOPE,
  BACKLOGS,
  BANK_ACCOUNTS,
  BIZ_NATURES,
  ASSIGNMENT_ENTITY_TYPES,
  EXPERIENCE_TIERS,
  GST_INVOICES,
  GST_RETURNS,
  INVOICE_FILING,
  MODES,
  PAY_EMPLOYEES,
  TAX_SCOPE,
  TAX_VOLUME,
  TX_BANDS,
} from "./pricing-options.js";

/**
 * The pricing engine — feature inventory §19, ported from the frozen legacy
 * `computeQuote` in `src/lib/assignments.js`.
 *
 * Deterministic: the same answers always yield the same quote, which is what
 * lets a business be shown a price before an accountant is involved, and lets
 * `firestore.rules` (and now the service layer) verify `total === days × rate`
 * on a client-created assignment.
 *
 * ## Money representation
 *
 * The legacy engine computes in rupees; this port preserves that computation
 * exactly — the rate is rounded to the nearest ₹50, which is meaningful in
 * rupees, not paise — and exposes the money fields as integer **paise**
 * (`× 100`) so nothing downstream does float arithmetic on money. `days`,
 * `cycleDays`, `setupDays` and `catchupDays` are fractional day counts, not
 * money; `discountPct` is a ratio. The rate-derivation floats
 * (`baseRate × (1 − discount)`) collapse to a clean integer via `round50`
 * before any paise value is produced.
 *
 * Because `days` is always a multiple of 0.5 and `rate` a multiple of ₹50,
 * `days × rate` is always a whole number of rupees — the legacy `Math.round`
 * on the total is a no-op that the port keeps for exactness.
 */

/** Per-service base effort (days for one cycle) and rate slab (₹/day). */
const SERVICE_META: Record<string, { mDays: number; oneDays: number; slab: number }> = {
  bookkeeping: { mDays: 3, oneDays: 3, slab: 1200 },
  gst: { mDays: 2, oneDays: 2, slab: 1800 },
  tax: { mDays: 0.5, oneDays: 1.5, slab: 1800 },
  payroll: { mDays: 1, oneDays: 1, slab: 1200 },
  statements: { mDays: 0.5, oneDays: 3, slab: 3500 },
  advisory: { mDays: 1, oneDays: 2, slab: 3500 },
  audit: { mDays: 0.5, oneDays: 3, slab: 3500 },
};

/* Pricing dials — tune these, everything recomputes. */
const SYNERGY = 0.7; // 2nd+ service costs 70% of its base days (shared context)
const CATCHUP_NEAR = 0.5; // months 1-3 behind: 50% of a cycle each
const CATCHUP_FAR = 0.35; // months 4+: bulk work is faster
const DAY_CAP = 26;
const DISCOUNT_TIERS = [
  { min: 21, pct: 0.2 },
  { min: 16, pct: 0.15 },
  { min: 11, pct: 0.1 },
  { min: 6, pct: 0.05 },
  { min: 1, pct: 0 },
] as const;

const round50 = (n: number): number => Math.round(n / 50) * 50;

/**
 * The questionnaire answers. Every field is optional because the wizard is
 * adaptive — service-specific questions only appear for the services chosen —
 * and `computeQuote` falls back exactly as the legacy engine did for anything
 * absent.
 */
export interface QuoteAnswers {
  serviceIds?: string[];
  frequency?: string;
  txBand?: string;
  backlog?: string;
  invoiceFiling?: string;
  bankAccounts?: string;
  entityType?: string;
  expTier?: string;
  mode?: string;
  bizNature?: string;
  arapScope?: string[];
  gstReturns?: string[];
  gstInvoices?: string;
  taxScope?: string[];
  taxVolume?: string;
  payEmployees?: string;
}

export interface Quote {
  /** Billable days for the first engagement, capped at 26. Multiple of 0.5. */
  days: number;
  /** Recurring per-cycle days for a monthly engagement; null for one-time. */
  monthlyDays: number | null;
  cycleDays: number;
  setupDays: number;
  catchupDays: number;
  /** Volume discount applied to the rate, as a ratio (0–0.2). */
  discountPct: number;

  ratePaise: number;
  baseRatePaise: number;
  totalPaise: number;
  monthlyTotalPaise: number | null;
}

/** Option lookups, matching the legacy helpers exactly. */
type Opt = { readonly id: string } & Record<string, unknown>;

function pick<T = number>(
  opts: readonly Opt[],
  id: string | undefined,
  key: string,
): T | undefined {
  const found = opts.find((o) => o.id === id);
  return found === undefined ? undefined : (found[key] as T);
}

/** `X(opts, id, key)` in the legacy: the multiplier, defaulting to 1. */
function factor(opts: readonly Opt[], id: string | undefined, key = "x"): number {
  return pick<number>(opts, id, key) ?? 1;
}

const half = (x: number): number => Math.max(0, Math.round(x * 2) / 2);

/**
 * Computes a quote, or `null` when no service is selected.
 *
 * Translated line-for-line from the legacy engine; the fixture test proves the
 * translation is faithful across every dial.
 */
export function computeQuote(answers: QuoteAnswers): Quote | null {
  const svc = answers.serviceIds ?? [];
  if (svc.length === 0) return null;

  const monthly = answers.frequency !== "onetime";
  const has = (id: string): boolean => svc.includes(id);
  const backlog = BACKLOGS.find((b) => b.id === answers.backlog) ?? BACKLOGS[0];
  const filing = INVOICE_FILING.find((i) => i.id === answers.invoiceFiling) ?? INVOICE_FILING[0];
  const mode = MODES.find((m) => m.id === answers.mode) ?? MODES[0];
  const dKey = monthly ? "mDays" : "oneDays";

  const sum = (opts: readonly Opt[], ids: string[] | undefined, dflt: string[]): number =>
    (ids && ids.length ? ids : dflt).reduce((t, id) => t + (pick<number>(opts, id, dKey) ?? 0), 0);

  // Each service's effort from its own questions, at the right cadence.
  // `c: true` marks compliance work that has month-wise catch-up when behind.
  const parts: { d: number; c: boolean }[] = [];
  const bankExtra = pick<number>(BANK_ACCOUNTS, answers.bankAccounts, "extraDays") ?? 0;

  if (has("bookkeeping")) {
    parts.push({
      d: SERVICE_META["bookkeeping"]![dKey] * factor(TX_BANDS, answers.txBand, "daysX") + bankExtra,
      c: true,
    });
  }
  if (has("gst")) {
    parts.push({
      d:
        Math.max(monthly ? 0.5 : 1, sum(GST_RETURNS, answers.gstReturns, ["gstr1", "gstr3b"])) *
        factor(GST_INVOICES, answers.gstInvoices),
      c: true,
    });
  }
  if (has("tax")) {
    const scope = answers.taxScope && answers.taxScope.length ? answers.taxScope : ["tds"];
    const g = (id: string): number => pick<number>(TAX_SCOPE, id, dKey) ?? 0;
    const tdsPart = scope.includes("tds") ? g("tds") * factor(TAX_VOLUME, answers.taxVolume) : 0;
    const restPart = scope.filter((id) => id !== "tds").reduce((t, id) => t + g(id), 0);
    parts.push({ d: Math.max(monthly ? 0.2 : 0.5, tdsPart + restPart), c: scope.includes("tds") });
  }
  if (has("payroll")) {
    parts.push({
      d: SERVICE_META["payroll"]![dKey] * factor(PAY_EMPLOYEES, answers.payEmployees),
      c: true,
    });
  }
  if (has("statements")) parts.push({ d: SERVICE_META["statements"]![dKey], c: false });
  if (has("advisory")) parts.push({ d: SERVICE_META["advisory"]![dKey], c: false });
  if (has("audit")) parts.push({ d: SERVICE_META["audit"]![dKey], c: false });

  const nature = BIZ_NATURES.find((n) => n.id === answers.bizNature) ?? BIZ_NATURES[2];

  // Biggest scope at full effort; the rest share context (synergy).
  parts.sort((a, b) => b.d - a.d);
  const entityExtra = pick<number>(ASSIGNMENT_ENTITY_TYPES, answers.entityType, "extraDays") ?? 0;
  const arapExtra = (answers.arapScope ?? []).reduce(
    (t, id) => t + (pick<number>(ARAP_SCOPE, id, "extraDays") ?? 0),
    0,
  );
  const cycleDays = Math.max(
    1,
    half(
      parts.reduce((t, p, i) => t + (i === 0 ? p.d : p.d * SYNERGY), 0) +
        nature.extraDays +
        entityExtra +
        arapExtra,
    ),
  );

  // One-time setup: catch-up of pending months (compliance work only, faster
  // in bulk after 3 months) + putting loose invoices in order.
  const complianceCycle = half(
    parts
      .filter((p) => p.c)
      .sort((a, b) => b.d - a.d)
      .reduce((t, p, i) => t + (i === 0 ? p.d : p.d * SYNERGY), 0),
  );
  const near = Math.min(backlog.months, 3);
  const far = Math.max(backlog.months - 3, 0);
  const catchupDays = half(complianceCycle * (near * CATCHUP_NEAR + far * CATCHUP_FAR));
  const filingDays = has("bookkeeping") || has("gst") ? filing.extraDays : 0;
  const setupDays = catchupDays + filingDays;

  // First engagement = one cycle + setup (capped). Ongoing months = cycle only.
  let days = Math.min(cycleDays + setupDays, DAY_CAP);
  days = Math.max(0.5, days);

  // Rate: highest slab × experience + site premium; volume discount from the
  // first-engagement size.
  const slab = svc.reduce((r, id) => Math.max(r, SERVICE_META[id]?.slab ?? 1200), 0);
  const expX = pick<number>(EXPERIENCE_TIERS, answers.expTier, "x") ?? 1;
  const baseRate = slab * expX + mode.rateAdd;
  const discountPct = DISCOUNT_TIERS.find((t) => days >= t.min)?.pct ?? 0;
  const rate = round50(baseRate * (1 - discountPct));

  const total = Math.round(days * rate);
  const monthlyDays = monthly ? cycleDays : null;
  const monthlyTotal = monthly ? Math.round(cycleDays * rate) : null;

  return {
    days,
    monthlyDays,
    cycleDays,
    setupDays,
    catchupDays,
    discountPct,
    ratePaise: rate * 100,
    baseRatePaise: baseRate * 100,
    totalPaise: total * 100,
    monthlyTotalPaise: monthlyTotal === null ? null : monthlyTotal * 100,
  };
}
