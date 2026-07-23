import type { ComplianceExtension } from "../schemas/config.js";

/**
 * The statutory compliance calendar — feature inventory §19, ported from the
 * frozen legacy `ComplianceChart.jsx`. Twenty-three obligations written against
 * the IT Act 2025 and IT Rules 2026, each generating its due dates for a given
 * financial year.
 *
 * Hand-curated by a domain expert and dated to specific sections of the new
 * Act — a §19 asset the inventory flags as expensive to recreate. The golden
 * test proves the port reproduces every date the legacy engine produced.
 *
 * ## Dates as ISO strings, not `Date`
 *
 * The legacy built `Date` objects and compared them via an ISO formatter. This
 * port works in ISO `YYYY-MM-DD` strings throughout — the same format the
 * `config/complianceOverrides` extensions use for `from`/`to`. That avoids the
 * timezone hazard of `new Date(y, m, d)` (which is local-time) crossing a
 * server in one zone and a browser in another, and it keeps the module pure:
 * no clock is read here; the caller passes the financial year.
 */

/** An obligation's occurrence: a due date and what period it covers. */
export interface Occurrence {
  /** Due date, `YYYY-MM-DD`. */
  dateIso: string;
  /** Human label — "for April 26", "Q1 (Apr–Jun)", etc. */
  period: string;
}

/** A statutory obligation and its occurrence generator. */
export interface Obligation {
  name: string;
  appliesTo: string;
  desc: string;
  /** Occurrences for the financial year starting in April of `fy`. */
  occ: (fy: number) => Occurrence[];
}

/** An occurrence with any extension applied, ready to render. */
export interface CalendarEntry {
  name: string;
  appliesTo: string;
  desc: string;
  period: string;
  /** The effective due date, after any notified extension. */
  dateIso: string;
  /** The extension note if this date was shifted, else null. */
  extended: string | null;
}

const MNAME = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** `YYYY-MM-DD` from year/month(1-12)/day, without ever touching `Date`. */
const iso = (y: number, m: number, d: number): string =>
  `${String(y)}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** "for <prev month> <yy>" — the period label for a monthly filing. */
function prevMonthName(m: number, y: number): string {
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return `for ${MNAME[pm - 1]} ${String(py).slice(2)}`;
}

/** A monthly obligation on `day`, Apr(fy)…Mar(fy+1). */
function everyMonth(
  day: number,
  periodFn: (m: number, y: number) => string,
): (fy: number) => Occurrence[] {
  return (fy) => {
    const out: Occurrence[] = [];
    for (let i = 0; i < 12; i++) {
      const m = ((3 + i) % 12) + 1; // Apr..Dec, Jan..Mar
      const y = m >= 4 ? fy : fy + 1;
      out.push({ dateIso: iso(y, m, day), period: periodFn(m, y) });
    }
    return out;
  };
}

const fyTail = (fy: number): string => `${String(fy - 1)}-${String(fy).slice(2)}`;

/**
 * The 23 obligations. Ordered as the legacy had them: monthly, then quarterly,
 * then annual/ROC. The `desc` and `appliesTo` strings, and every date, are
 * verbatim from the frozen source.
 */
export const OBLIGATIONS: readonly Obligation[] = [
  // ---- Every month ----
  {
    name: "TDS / TCS deposit",
    appliesTo: "Anyone deducting TDS (Sections 392/393, IT Act 2025)",
    desc: "Deposit last month's TDS by challan — Rule 218, IT Rules 2026. March TDS gets time till 30 April.",
    occ: (fy) => {
      const out: Occurrence[] = [
        {
          dateIso: iso(fy, 4, 30),
          period: `for March ${String(fy).slice(2)} (year-end exception)`,
        },
      ];
      for (let m = 5; m <= 12; m++)
        out.push({ dateIso: iso(fy, m, 7), period: prevMonthName(m, fy) });
      for (let m = 1; m <= 3; m++)
        out.push({ dateIso: iso(fy + 1, m, 7), period: prevMonthName(m, fy + 1) });
      return out;
    },
  },
  {
    name: "GSTR-1 (outward supplies)",
    appliesTo: "GST-registered, monthly filers",
    desc: "Report all sales invoices of the previous month.",
    occ: everyMonth(11, prevMonthName),
  },
  {
    name: "GSTR-1 IFF (QRMP)",
    appliesTo: "QRMP scheme filers (turnover ≤ ₹5 Cr)",
    desc: "Optional monthly invoice upload for B2B buyers' ITC.",
    occ: everyMonth(13, prevMonthName),
  },
  {
    name: "PF (EPF) contribution",
    appliesTo: "Employers with 20+ employees (or voluntarily registered)",
    desc: "Deposit employee + employer PF for last month.",
    occ: everyMonth(15, prevMonthName),
  },
  {
    name: "ESI contribution",
    appliesTo: "Employers with 10+ employees (wage limit applies)",
    desc: "Deposit ESI for last month.",
    occ: everyMonth(15, prevMonthName),
  },
  {
    name: "GSTR-3B (summary & tax payment)",
    appliesTo: "GST-registered, monthly filers",
    desc: "Summary return with tax payment for the previous month.",
    occ: everyMonth(20, prevMonthName),
  },
  {
    name: "GST PMT-06 (QRMP tax payment)",
    appliesTo: "QRMP filers — months 1 & 2 of each quarter",
    desc: "Pay monthly GST by challan while filing quarterly.",
    occ: everyMonth(25, prevMonthName),
  },

  // ---- Quarterly ----
  {
    name: "Advance income tax",
    appliesTo: "Tax after TDS > ₹10,000/yr — Sections 403–408, IT Act 2025",
    desc: "Cumulative instalments; interest u/s 424/425 for shortfall. Presumptive taxpayers: single instalment by 15 Mar.",
    occ: (fy) => [
      { dateIso: iso(fy, 6, 15), period: "1st instalment — 15% of the year" },
      { dateIso: iso(fy, 9, 15), period: "2nd instalment — 45% cumulative" },
      { dateIso: iso(fy, 12, 15), period: "3rd instalment — 75% cumulative" },
      { dateIso: iso(fy + 1, 3, 15), period: "4th instalment — 100%" },
    ],
  },
  {
    name: "TDS statements (Form 138 salary / Form 140 others)",
    appliesTo: "All TDS deductors — replaces 24Q/26Q from TY 2026-27",
    desc: "Quarterly deductee-wise statement; late fee ₹200/day u/s 427. Q4 of the old FY files on the old forms.",
    occ: (fy) => [
      { dateIso: iso(fy, 5, 31), period: `Q4 of FY ${fyTail(fy)} (Jan–Mar, old-Act forms)` },
      { dateIso: iso(fy, 7, 31), period: "Q1 (Apr–Jun)" },
      { dateIso: iso(fy, 10, 31), period: "Q2 (Jul–Sep)" },
      { dateIso: iso(fy + 1, 1, 31), period: "Q3 (Oct–Dec)" },
    ],
  },
  {
    name: "GSTR-3B (QRMP quarterly)",
    appliesTo: "QRMP scheme filers (22nd/24th by state)",
    desc: "Quarterly summary return.",
    occ: (fy) => [
      { dateIso: iso(fy, 4, 22), period: `Q4 of FY ${fyTail(fy)}` },
      { dateIso: iso(fy, 7, 22), period: "Q1 (Apr–Jun)" },
      { dateIso: iso(fy, 10, 22), period: "Q2 (Jul–Sep)" },
      { dateIso: iso(fy + 1, 1, 22), period: "Q3 (Oct–Dec)" },
    ],
  },
  {
    name: "CMP-08 (composition scheme)",
    appliesTo: "GST composition dealers",
    desc: "Quarterly statement-cum-challan.",
    occ: (fy) => [
      { dateIso: iso(fy, 4, 18), period: `Q4 of FY ${fyTail(fy)}` },
      { dateIso: iso(fy, 7, 18), period: "Q1 (Apr–Jun)" },
      { dateIso: iso(fy, 10, 18), period: "Q2 (Jul–Sep)" },
      { dateIso: iso(fy + 1, 1, 18), period: "Q3 (Oct–Dec)" },
    ],
  },

  // ---- Annual & ROC ----
  {
    name: "GSTR-4 (composition annual return)",
    appliesTo: "GST composition dealers",
    desc: "Annual return for the previous financial year.",
    occ: (fy) => [{ dateIso: iso(fy, 6, 30), period: `for FY ${fyTail(fy)}` }],
  },
  {
    name: "Form 130 — salary TDS certificate",
    appliesTo: "All employers (replaces Form 16 from TY 2026-27)",
    desc: "Annual TDS certificate to every employee.",
    occ: (fy) => [
      {
        dateIso: iso(fy, 6, 15),
        period: `for FY ${fyTail(fy)}${fy <= 2026 ? " (Form 16, old Act)" : ""}`,
      },
    ],
  },
  {
    name: "DPT-3 (return of deposits)",
    appliesTo: "Companies with loans/advances outstanding",
    desc: "Annual return of deposits & exempted borrowings.",
    occ: (fy) => [{ dateIso: iso(fy, 6, 30), period: `for FY ${fyTail(fy)}` }],
  },
  {
    name: "ITR — salaried (ITR-1 / ITR-2)",
    appliesTo: "Salaried individuals without tax audit",
    desc: "Income tax return for the last financial year.",
    occ: (fy) => [
      {
        dateIso: iso(fy, 7, 31),
        period: `for FY ${fyTail(fy)}${fy === 2026 ? " (AY 2026-27, old Act — last old-Act season)" : ""}`,
      },
    ],
  },
  {
    name: "ITR — business/professional, non-audit (ITR-3 / ITR-4)",
    appliesTo: "Business & professional income without tax audit",
    desc: "Extra month over salaried filers under the staggered calendar.",
    occ: (fy) => [{ dateIso: iso(fy, 8, 31), period: `for FY ${fyTail(fy)}` }],
  },
  {
    name: "Tax audit report",
    appliesTo: "Turnover above audit limits (Form 26 replaces 3CD for new-Act years)",
    desc: "Audit report upload — one month before the audited ITR.",
    occ: (fy) => [{ dateIso: iso(fy, 9, 30), period: `for FY ${fyTail(fy)}` }],
  },
  {
    name: "DIR-3 KYC",
    appliesTo: "Every director with a DIN",
    desc: "Annual director KYC — DIN deactivates if missed.",
    occ: (fy) => [{ dateIso: iso(fy, 9, 30), period: "annual KYC" }],
  },
  {
    name: "ITR — audit cases",
    appliesTo: "Businesses under tax audit",
    desc: "Return filing for audited entities.",
    occ: (fy) => [{ dateIso: iso(fy, 10, 31), period: `for FY ${fyTail(fy)}` }],
  },
  {
    name: "AOC-4 (financial statements)",
    appliesTo: "All companies",
    desc: "File financials with ROC within 30 days of AGM.",
    occ: (fy) => [
      { dateIso: iso(fy, 10, 29), period: `FY ${fyTail(fy)} accounts (30 days from AGM)` },
    ],
  },
  {
    name: "MGT-7 / 7A (annual return)",
    appliesTo: "All companies (7A for OPC & small companies)",
    desc: "ROC annual return within 60 days of AGM.",
    occ: (fy) => [{ dateIso: iso(fy, 11, 28), period: `FY ${fyTail(fy)} (60 days from AGM)` }],
  },
  {
    name: "GSTR-9 / 9C (annual return)",
    appliesTo: "GST-registered, turnover > ₹2 Cr (9C > ₹5 Cr)",
    desc: "Annual consolidation of the year's GST returns.",
    occ: (fy) => [{ dateIso: iso(fy, 12, 31), period: `for FY ${fyTail(fy)}` }],
  },
  {
    name: "MSME-1 (half-yearly)",
    appliesTo: "Companies with dues to MSME suppliers > 45 days",
    desc: "Report outstanding MSME payments.",
    occ: (fy) => [
      { dateIso: iso(fy, 4, 30), period: "Oct–Mar half-year" },
      { dateIso: iso(fy, 10, 31), period: "Apr–Sep half-year" },
    ],
  },
];

/** The financial year (start year) a date falls in — April starts the FY. */
export function complianceFy(dateIso: string): number {
  const [y, m] = dateIso.split("-").map(Number) as [number, number, number];
  return m >= 4 ? y : y - 1;
}

/**
 * Applies notified extensions to a single occurrence.
 *
 * An extension matches when its `from` equals the occurrence's date AND the
 * obligation name contains its `match` keyword (case-insensitive) — the exact
 * rule the legacy `ComplianceOverridesEditor` writes and the calendar reads. A
 * matched occurrence moves to the extension's `to` date and carries its note.
 */
function applyExtensions(
  obligation: Obligation,
  occurrence: Occurrence,
  extensions: readonly ComplianceExtension[],
): CalendarEntry {
  for (const ex of extensions) {
    const matches =
      ex.from === occurrence.dateIso &&
      obligation.name.toLowerCase().includes(ex.match.toLowerCase());
    if (matches) {
      return {
        name: obligation.name,
        appliesTo: obligation.appliesTo,
        desc: obligation.desc,
        period: occurrence.period,
        dateIso: ex.to,
        extended: ex.note.length > 0 ? ex.note : "Extended by notification",
      };
    }
  }

  return {
    name: obligation.name,
    appliesTo: obligation.appliesTo,
    desc: obligation.desc,
    period: occurrence.period,
    dateIso: occurrence.dateIso,
    extended: null,
  };
}

/**
 * Builds the full calendar for a financial year, with any extensions applied,
 * sorted by effective due date.
 *
 * The overrides are exactly the `config/complianceOverrides` document shape, so
 * a caller passes what that endpoint returns.
 */
export function buildComplianceCalendar(
  fy: number,
  extensions: readonly ComplianceExtension[] = [],
): CalendarEntry[] {
  const entries: CalendarEntry[] = [];

  for (const obligation of OBLIGATIONS) {
    for (const occurrence of obligation.occ(fy)) {
      entries.push(applyExtensions(obligation, occurrence, extensions));
    }
  }

  entries.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  return entries;
}

/**
 * The obligations due on or after `fromIso`, within the financial year that
 * date falls in, soonest first — what a "what's coming up" view renders.
 */
export function upcomingObligations(
  fromIso: string,
  extensions: readonly ComplianceExtension[] = [],
  limit = 5,
): CalendarEntry[] {
  return buildComplianceCalendar(complianceFy(fromIso), extensions)
    .filter((entry) => entry.dateIso >= fromIso)
    .slice(0, limit);
}
