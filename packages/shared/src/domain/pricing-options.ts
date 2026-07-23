/**
 * Questionnaire vocabulary for the pricing engine — feature inventory §19.
 *
 * Ported verbatim from the frozen legacy `src/lib/assignments.js`. Every
 * numeric field here is a pricing dial that `computeQuote` reads by id, so the
 * ids and the numbers are load-bearing, not display strings — a wrong `daysX`
 * or `extraDays` silently misprices real work.
 *
 * Parity is proven by the golden-vector test in `pricing.test.ts`: eleven
 * questionnaire cases spanning every option below are run through the port and
 * asserted byte-for-byte against outputs captured from the legacy source. A
 * transcription slip in any constant diverges at least one vector.
 */

export interface Option {
  readonly id: string;
  readonly label: string;
}

/** Monthly transaction volume — multiplies bookkeeping effort. */
export const TX_BANDS = [
  { id: "low", label: "Up to 100 entries / month", daysX: 1 },
  { id: "mid", label: "100 – 500 entries / month", daysX: 1.5 },
  { id: "high", label: "More than 500 entries / month", daysX: 2 },
] as const;

/** How many months of books are pending — drives one-time catch-up. */
export const BACKLOGS = [
  { id: "0", label: "Up to date", months: 0 },
  { id: "1", label: "1 month behind", months: 1 },
  { id: "2", label: "2 months behind", months: 2 },
  { id: "3", label: "3 months behind", months: 3 },
  { id: "4", label: "4 months behind", months: 4 },
  { id: "5", label: "5 months behind", months: 5 },
  { id: "6", label: "6 months behind", months: 6 },
  { id: "6plus", label: "More than 6 months", months: 8 },
] as const;

export const SOFTWARES = [
  { id: "tally", label: "Tally" },
  { id: "zoho", label: "Zoho Books" },
  { id: "busy", label: "Busy" },
  { id: "marg", label: "Marg" },
  { id: "quickbooks", label: "QuickBooks" },
  { id: "excel", label: "Excel only" },
  { id: "none", label: "No software yet" },
  { id: "other", label: "Other" },
] as const;

/** Delivery mode — a site visit adds a flat rate premium. */
export const MODES = [
  { id: "online", label: "Online / remote", rateAdd: 0 },
  { id: "visit", label: "Site visit — accountant comes to you", rateAdd: 300 },
] as const;

/** How organised the invoices are — loose invoices add setup days. */
export const INVOICE_FILING = [
  { id: "filed", label: "Yes — filed month-wise", extraDays: 0 },
  { id: "partly", label: "Partly organised", extraDays: 1 },
  { id: "loose", label: "No — loose / unsorted", extraDays: 2 },
] as const;

export const BANK_ACCOUNTS = [
  { id: "one", label: "1 bank account", extraDays: 0 },
  { id: "few", label: "2 – 3 accounts / cards", extraDays: 0.5 },
  { id: "many", label: "4 or more accounts / cards", extraDays: 1 },
] as const;

export const ENTITY_TYPES = [
  { id: "prop", label: "Proprietorship / Individual", extraDays: 0 },
  { id: "partnership", label: "Partnership firm", extraDays: 0 },
  { id: "company", label: "LLP / Private Limited", extraDays: 0.5 },
] as const;

/** Accountant seniority — multiplies the base rate. `minYears` gates claims. */
export const EXPERIENCE_TIERS = [
  { id: "standard", label: "Standard — any verified accountant", x: 1.0, minYears: 0 },
  { id: "senior", label: "Senior — 3+ years experience", x: 1.2, minYears: 3 },
  { id: "expert", label: "Expert — 7+ years experience", x: 1.4, minYears: 7 },
] as const;

export const ARAP_SCOPE = [
  { id: "ar", label: "Also raise sales invoices (AR)", extraDays: 0.5 },
  { id: "ap", label: "Also process vendor payments (AP)", extraDays: 0.5 },
] as const;

export const GST_RETURNS = [
  { id: "gstr1", label: "GSTR-1 (sales return)", mDays: 1, oneDays: 1 },
  { id: "gstr3b", label: "GSTR-3B (summary & tax payment)", mDays: 1, oneDays: 1 },
  { id: "gstr9", label: "GSTR-9 (annual return)", mDays: 0.1, oneDays: 1 },
  { id: "einvoice", label: "e-Invoicing / e-Way bill support", mDays: 0.5, oneDays: 1 },
] as const;

export const GST_INVOICES = [
  { id: "low", label: "Up to 100 invoices / month", x: 1 },
  { id: "mid", label: "100 – 500 invoices / month", x: 1.5 },
  { id: "high", label: "More than 500 invoices / month", x: 2 },
] as const;

export const TAX_SCOPE = [
  { id: "tds", label: "TDS returns (24Q / 26Q)", mDays: 0.5, oneDays: 1.5 },
  { id: "itr", label: "Income tax return filing", mDays: 0.1, oneDays: 1 },
  { id: "advance", label: "Advance tax computation", mDays: 0.2, oneDays: 0.5 },
] as const;

export const TAX_VOLUME = [
  { id: "low", label: "Up to 20 deductees / payments", x: 1 },
  { id: "mid", label: "21 – 100 deductees / payments", x: 1.5 },
  { id: "high", label: "More than 100 deductees / payments", x: 2 },
] as const;

export const PAY_EMPLOYEES = [
  { id: "low", label: "Up to 10 employees", x: 1 },
  { id: "mid", label: "11 – 50 employees", x: 1.5 },
  { id: "high", label: "More than 50 employees", x: 2 },
] as const;

/** Business nature — adds days and selects the nature-specific SOP block. */
export const BIZ_NATURES = [
  { id: "trading", label: "Trading / Distribution", extraDays: 0.5 },
  { id: "manufacturing", label: "Manufacturing", extraDays: 1 },
  { id: "service", label: "Services", extraDays: 0 },
] as const;

export const FREQUENCIES = [
  { id: "monthly", label: "Every month (recurring)" },
  { id: "onetime", label: "One-time assignment" },
] as const;

export type BizNature = (typeof BIZ_NATURES)[number]["id"];
