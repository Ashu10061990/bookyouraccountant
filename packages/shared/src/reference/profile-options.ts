// GENERATED from the frozen legacy source — do not hand-edit.
// Source: ../BYA& Keiri/bya-new/src/lib/profileOptions.js
// Feature inventory §19: profile vocabularies (11 accounting + 11 compliance tools, and the profile field options).
// Regenerate rather than retype: transcription is how hand-curated data is lost.

/** A selectable option. `other` entries pair with a free-text box in the UI. */
export interface ProfileOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Accounting packages a business might already run.
 *
 * The SAME vocabulary is offered to businesses and accountants — that shared
 * vocabulary is what makes software-based matching possible at all.
 */
export const ACCOUNTING_SOFTWARE = [
  {
    value: "tally",
    label: "Tally Prime / Tally ERP 9",
  },
  {
    value: "zoho",
    label: "Zoho Books",
  },
  {
    value: "busy",
    label: "Busy",
  },
  {
    value: "marg",
    label: "Marg ERP",
  },
  {
    value: "vyapar",
    label: "Vyapar",
  },
  {
    value: "quickbooks",
    label: "QuickBooks",
  },
  {
    value: "sap",
    label: "SAP",
  },
  {
    value: "ms_dynamics",
    label: "Microsoft Dynamics",
  },
  {
    value: "excel",
    label: "Excel / Google Sheets only",
  },
  {
    value: "manual",
    label: "Manual / paper books",
  },
  {
    value: "other",
    label: "Other",
  },
] as const;

/** Compliance/filing tools, shared vocabulary as above. */
export const COMPLIANCE_SOFTWARE = [
  {
    value: "gst_portal",
    label: "GST portal (govt.)",
  },
  {
    value: "clear",
    label: "ClearTax / Clear",
  },
  {
    value: "winman",
    label: "Winman",
  },
  {
    value: "computax",
    label: "CompuTax",
  },
  {
    value: "genius",
    label: "Genius / SAG Infotech",
  },
  {
    value: "saral",
    label: "Saral (TDS/Tax)",
  },
  {
    value: "irisgst",
    label: "IRIS GST",
  },
  {
    value: "zoho_books_gst",
    label: "Zoho Books (GST)",
  },
  {
    value: "tally_gst",
    label: "Tally (GST/e-invoice)",
  },
  {
    value: "einvoice_portal",
    label: "e-Invoice / e-Way bill portal",
  },
  {
    value: "other",
    label: "Other",
  },
] as const;

/** Where the books physically live — drives on-site vs off-site matching. */
export const BOOKS_LOCATION = [
  {
    value: "own_premises",
    label: "At our own premises (accountant works on-site / visits us)",
  },
  {
    value: "keiri_offsite",
    label: "Off-site — Keiri/accountant maintains our books at their place (we share data)",
  },
  {
    value: "hybrid",
    label: "A mix of both",
  },
  {
    value: "not_sure",
    label: "Not sure yet — need guidance",
  },
] as const;

/** Legal constitution of the business. Determines which filings apply. */
export const ENTITY_TYPE = [
  {
    value: "proprietorship",
    label: "Proprietorship",
  },
  {
    value: "partnership",
    label: "Partnership firm",
  },
  {
    value: "llp",
    label: "LLP",
  },
  {
    value: "pvt_ltd",
    label: "Private Limited",
  },
  {
    value: "public_ltd",
    label: "Public Limited",
  },
  {
    value: "opc",
    label: "One Person Company (OPC)",
  },
  {
    value: "huf",
    label: "HUF",
  },
  {
    value: "trust_society",
    label: "Trust / Society / Section 8",
  },
  {
    value: "other",
    label: "Other",
  },
] as const;

/** Annual turnover band. Feeds the pricing engine's service slabs. */
export const TURNOVER_BAND = [
  {
    value: "lt_40l",
    label: "Under ₹40 lakh",
  },
  {
    value: "40l_1cr",
    label: "₹40 lakh – ₹1 crore",
  },
  {
    value: "1cr_5cr",
    label: "₹1 – 5 crore",
  },
  {
    value: "5cr_20cr",
    label: "₹5 – 20 crore",
  },
  {
    value: "gt_20cr",
    label: "Over ₹20 crore",
  },
] as const;

/** GST registration status. */
export const GST_STATUS = [
  {
    value: "registered_regular",
    label: "Registered — regular",
  },
  {
    value: "registered_composition",
    label: "Registered — composition",
  },
  {
    value: "not_registered",
    label: "Not registered",
  },
  {
    value: "need_registration",
    label: "Need to register",
  },
] as const;

/** Monthly transaction volume band — the primary pricing input. */
export const TXN_VOLUME = [
  {
    value: "lt_100",
    label: "Up to 100 / month",
  },
  {
    value: "100_300",
    label: "100 – 300 / month",
  },
  {
    value: "300_600",
    label: "300 – 600 / month",
  },
  {
    value: "600_1200",
    label: "600 – 1,200 / month",
  },
  {
    value: "gt_1200",
    label: "Over 1,200 / month",
  },
] as const;

/**
 * The service vocabulary used on PROFILES, for matching.
 *
 * NOT the same set as the seeded `services` catalogue in ./services.ts. The
 * two lists disagree on ids — this one has tds/itr/roc/einvoicing/other, the
 * catalogue has tax/statements. Both are carried forward verbatim rather than
 * reconciled, because reconciling them is a product decision (spec §18 Q3),
 * not a porting decision. See PARITY-CHECKLIST.md.
 */
export const PROFILE_SERVICES = [
  {
    value: "bookkeeping",
    label: "Bookkeeping & accounting",
  },
  {
    value: "gst",
    label: "GST returns & reconciliation",
  },
  {
    value: "tds",
    label: "TDS / TCS",
  },
  {
    value: "itr",
    label: "Income-tax filing",
  },
  {
    value: "payroll",
    label: "Payroll & PF/ESI",
  },
  {
    value: "roc",
    label: "ROC / MCA filings",
  },
  {
    value: "audit",
    label: "Audit & assurance",
  },
  {
    value: "advisory",
    label: "Advisory / virtual CFO",
  },
  {
    value: "einvoicing",
    label: "e-Invoicing & e-Way bills",
  },
  {
    value: "other",
    label: "Other",
  },
] as const;

/** Remote / on-site / hybrid working preference. */
export const WORK_MODE = [
  {
    value: "onsite",
    label: "On-site (visit client premises)",
  },
  {
    value: "remote",
    label: "Remote (work from my place)",
  },
  {
    value: "both",
    label: "Both on-site and remote",
  },
] as const;
