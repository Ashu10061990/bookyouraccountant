import { SOP_COUNTS } from "@bya/shared";

/**
 * Hand-written SEO copy per service. Statutory statements here are paraphrased
 * from the shared compliance calendar (`OBLIGATIONS`) and SOP templates — the
 * §19 datasets — never invented. Pricing sentences are generated separately
 * from `computeQuote` in `services.ts`.
 */
export interface ServiceCopy {
  slug: string;
  /** Short human name for headings and link text. */
  shortName: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  intro: string;
  detail: string;
  /** Substrings matched against OBLIGATIONS names to pick relevant due dates. */
  complianceKeywords: readonly string[];
  faqs: readonly { q: string; a: string }[];
  /** Cadence used to derive the indicative quote. */
  frequency: "monthly" | "onetime";
  /** One service × city sentence, composed from the city's real profile. */
  cityAngle: (city: { name: string; trait: string }) => string;
}

const sop = SOP_COUNTS;

export const SERVICE_COPY: readonly ServiceCopy[] = [
  {
    slug: "bookkeeping",
    shortName: "Bookkeeping",
    metaTitle: "Bookkeeping & Reconciliation Services",
    metaDescription:
      "Book a CA-verified accountant for bookkeeping by the day: documented entries, monthly bank reconciliations, live dashboard and plain MIS. From ₹1,200/day.",
    h1: "Bookkeeping & reconciliation, done to a published SOP",
    intro:
      "Every bookkeeping engagement on BookYourAccountant runs on a written standard operating procedure: an entry is only posted with a document behind it, every bank account is reconciled every month with each difference explained in writing, and suspense is brought to zero — not carried forward. You see the checklist; the accountant ticks it off task by task.",
    detail: `The bookkeeping SOP has ${String(sop.common)} common tasks across five phases — setup, entries, reconciliations, review and close — plus business-nature checks layered on top: ${String(sop.natureTrading)} for trading (stock registers, e-way bill matching, product-wise margins), ${String(sop.natureManufacturing)} for manufacturing (GRNs, WIP valuation, job-work tracking) and ${String(sop.natureService)} for service businesses (unbilled revenue, GST on advances, TDS receivable). Every visit closes with a dashboard update and a client walkthrough in rupees and decisions, not ledger jargon.`,
    complianceKeywords: ["GSTR-1 (outward", "GSTR-3B (summary", "TDS / TCS deposit", "MSME-1"],
    faqs: [
      {
        q: "What exactly happens in a bookkeeping visit?",
        a: "The accountant works through a published checklist: purchases, sales and expenses posted with a supporting document for each entry, cash book verified never to go negative, every bank account reconciled with a written BRS, statutory dues ledgers matched to paid challans — and the visit closes with your dashboard updated and a plain-language summary signed off on the portal.",
      },
      {
        q: "My books are months behind — can you catch them up?",
        a: "Yes, and the backlog is priced honestly upfront: the pricing engine adds catch-up effort for each pending month (bulk catch-up beyond three months is rated cheaper per month), plus time to sort loose invoices if they aren't filed month-wise. Once current, the engagement settles to the regular monthly cycle.",
      },
    ],
    frequency: "monthly",
    cityAngle: (c) =>
      `In ${c.name}, ${c.trait} share one constraint: transaction volume moves month to month. The quote scales with your actual entries — up to 100, 100–500 or 500+ per month — and with how many bank accounts and cards need reconciling, so a ${c.name} engagement is priced from your workload, not a citywide flat rate.`,
  },
  {
    slug: "gst",
    shortName: "GST returns",
    metaTitle: "GST Return Filing (GSTR-1, GSTR-3B)",
    metaDescription:
      "GSTR-1 by the 11th, GSTR-3B by the 20th — filed by a CA-verified accountant who matches GSTR-2B to your purchase register before claiming ITC. From ₹1,800/day.",
    h1: "GST return filing, with ITC checked before anything is filed",
    intro:
      "For monthly filers, GSTR-1 falls due on the 11th and GSTR-3B on the 20th of the following month; QRMP filers upload B2B invoices by the 13th and pay monthly tax by the 25th via PMT-06. A verified accountant keeps every one of those dates, working to a GST SOP that matches sales in your books against the e-invoice portal and GSTR-1 filings — so what is filed is what the books say.",
    detail:
      "Input tax credit is where GST filing goes wrong quietly: the SOP requires GSTR-2B to be matched against your purchase register before any credit is claimed, and requires your approval on the portal before filing — with the ARN saved to your workspace afterwards. Composition dealers are covered too (CMP-08 quarterly, GSTR-4 annually), as are the annual GSTR-9/9C consolidations where turnover requires them.",
    complianceKeywords: ["GSTR-1", "GSTR-3B", "GST PMT-06", "CMP-08", "GSTR-4", "GSTR-9"],
    faqs: [
      {
        q: "Which GST returns can the accountant handle?",
        a: "Regular monthly filings (GSTR-1 and GSTR-3B), the QRMP scheme for turnover up to ₹5 crore (IFF invoice upload, PMT-06 monthly payments, quarterly GSTR-3B), the composition scheme (CMP-08 quarterly and GSTR-4 annually), and annual returns (GSTR-9, with GSTR-9C reconciliation above ₹5 crore turnover).",
      },
      {
        q: "Do you verify input tax credit before filing?",
        a: "Yes — it is a mandatory SOP step: GSTR-2B is matched with the purchase register before ITC is claimed, sales in the books are matched with GSTR-1 and the e-invoice portal, and nothing is filed without your approval recorded on the portal.",
      },
    ],
    frequency: "monthly",
    cityAngle: (c) =>
      `${c.name}'s ${c.trait} file on both cadences — regular monthly GSTR-1/3B and QRMP where turnover allows. Whichever applies to you, the accountant matches your books to the e-invoice portal before anything is filed for a ${c.name} GSTIN.`,
  },
  {
    slug: "tax",
    shortName: "TDS & income tax",
    metaTitle: "TDS, Advance Tax & ITR Filing",
    metaDescription:
      "TDS computed section-wise and deposited by the 7th, quarterly statements checked with TRACES, advance-tax instalments on time, ITRs filed. From ₹1,800/day.",
    h1: "TDS, advance tax and ITRs — computed, cross-checked, filed",
    intro:
      "TDS is a monthly discipline: deduction computed section-wise at current rates, deposited by challan by the 7th of the following month (March deductions get time till 30 April), and quarterly statements filed on the new Form 138/140 series — where the late fee runs ₹200 per day. A verified accountant carries that discipline for you, with every filing acknowledged and archived on the portal.",
    detail:
      "Beyond TDS, the engagement covers advance income tax — the cumulative instalments of 15% by 15 June, 45% by 15 September, 75% by 15 December and 100% by 15 March, with a single 15 March instalment for presumptive taxpayers — and income-tax returns across the staggered calendar: salaried by 31 July, non-audit business by 31 August, audited entities by 31 October. Everything is cross-checked against 26AS, AIS and paid challans before filing.",
    complianceKeywords: [
      "TDS / TCS deposit",
      "TDS statements",
      "Advance income tax",
      "ITR —",
      "Form 130",
    ],
    faqs: [
      {
        q: "What does TDS compliance include month to month?",
        a: "Section-wise computation at current rates and limits, deposit by challan by the 7th of the following month (30 April for March), quarterly deductee-wise statements, cross-checks against 26AS / AIS / TRACES and paid challans, and the annual salary TDS certificate to every employee by 15 June.",
      },
      {
        q: "Do you handle advance tax instalments?",
        a: "Yes — the four cumulative instalments (15% by 15 June, 45% by 15 September, 75% by 15 December, 100% by 15 March) are computed from your live books and flagged ahead of each date; presumptive taxpayers pay a single instalment by 15 March. Shortfalls attract interest, so the dashboard tracks what has been provided for.",
      },
    ],
    frequency: "monthly",
    cityAngle: (c) =>
      `For ${c.trait} in ${c.name}, TDS is usually the recurring load: section-wise computation, deposit by the 7th of the following month, and quarterly statements reconciled against TRACES and paid challans before they are filed.`,
  },
  {
    slug: "payroll",
    shortName: "Payroll",
    metaTitle: "Payroll Processing (EPF, ESI, TDS)",
    metaDescription:
      "Salary registers and statutory deductions, EPF and ESI deposited by the 15th and matched with EPFO/ESIC portals — run by a verified accountant. From ₹1,200/day.",
    h1: "Payroll processed with EPF, ESI and salary TDS handled",
    intro:
      "Payroll compliance runs on the 15th: both EPF (employers with 20+ employees, or voluntarily registered) and ESI (10+ employees, wage limit applies) must be deposited for the previous month by then. The payroll SOP starts by verifying applicability and wage definitions for your headcount — the step most penalty notices trace back to — before the first salary register is processed.",
    detail:
      "Each cycle covers the salary register with statutory deductions, deposit challans saved to your portal workspace, and reconciliations that go beyond bookkeeping: payroll in the books is matched against the EPFO and ESIC portals and against actual bank payments. Salary TDS rides along — deducted monthly, deposited by the 7th, and certificates issued to every employee by 15 June each year.",
    complianceKeywords: ["PF (EPF)", "ESI contribution", "Form 130", "TDS / TCS deposit"],
    faqs: [
      {
        q: "When are EPF and ESI actually due?",
        a: "Both are monthly deposits due by the 15th of the following month. EPF applies to employers with 20 or more employees (or those voluntarily registered); ESI applies from 10 employees, subject to the wage limit. The engagement tracks both dates on your dashboard with reminders before each.",
      },
      {
        q: "What does a payroll engagement include?",
        a: "Salary register and statutory deductions processed each cycle, EPF/ESI deposited within due dates with challans saved, payroll matched against the EPFO and ESIC portals and bank payments, and salary TDS handled through to the annual certificate for every employee.",
      },
    ],
    frequency: "monthly",
    cityAngle: (c) =>
      `${c.name} employers among ${c.trait} cross the EPF and ESI headcount thresholds quickly — both deposits fall due on the 15th of the following month, and the SOP verifies applicability and wage definitions before the first ${c.name} salary register is run.`,
  },
  {
    slug: "statements",
    shortName: "Financial statements",
    metaTitle: "Schedule III Financial Statements",
    metaDescription:
      "Schedule III financial statements from a verified trial balance — debtors and creditors confirmed, no negative cash — prepared by a senior verified accountant.",
    h1: "Financial statements a bank or investor can rely on",
    intro:
      "Statements are only as good as the trial balance under them. The statements SOP verifies the trial balance ties to the ledgers and that cash never goes negative on any date, confirms debtors and creditors with party statements, and only then prepares Schedule III financial statements — finishing with a walkthrough in plain language, not accounting jargon.",
    detail:
      "For companies, the statements feed statutory deadlines that arrive in a cluster after the AGM: AOC-4 filing of financials with the ROC within 30 days, the MGT-7/7A annual return within 60 days, and DPT-3 by 30 June for companies with loans or advances outstanding. Getting statements finalised early is what makes that season uneventful — and it is senior, CA-level work priced on the top rate slab.",
    complianceKeywords: ["AOC-4", "MGT-7", "DPT-3", "ITR — business"],
    faqs: [
      {
        q: "What do I receive at the end of a statements engagement?",
        a: "Schedule III financial statements prepared from a verified trial balance — with debtors/creditors confirmed against party statements and every ledger scrutinised — plus a sit-down walkthrough of what the numbers mean for your business, and the working papers archived to your portal workspace.",
      },
      {
        q: "When do companies have to file their financials?",
        a: "AOC-4 (financial statements) goes to the ROC within 30 days of the AGM and MGT-7/7A (annual return) within 60 days; companies with loans or advances outstanding also file DPT-3 by 30 June. The compliance calendar on your dashboard tracks each of these.",
      },
    ],
    frequency: "onetime",
    cityAngle: (c) =>
      `When ${c.trait} in ${c.name} need statements — for a bank limit, a tender or an investor — the accountant confirms debtors and creditors with party statements first, then prepares Schedule III financials and walks you through them in plain language.`,
  },
  {
    slug: "advisory",
    shortName: "Advisory & cash flow",
    metaTitle: "Business Advisory & Cash Flow Services",
    metaDescription:
      "A rolling cash-flow view, receivables ageing, the next 45 days of due dates with amounts, and three clear actions in writing — senior CA advisory by the day.",
    h1: "Advisory that ends in three written actions, not a report",
    intro:
      "The advisory SOP is deliberately concrete: prepare a rolling cash-flow view of inflows against outflows ahead, flag receivables ageing before it hardens into bad debt, list every due date for the next 45 days with the amounts — and give the owner three clear actions in writing. It is the difference between having numbers and using them.",
    detail:
      "Advisory pairs naturally with the live dashboard: advance-tax instalments, GST and large supplier payments are visible weeks ahead, so money is set aside calmly instead of borrowed at the last minute. It is senior CA-level work on the top rate slab — and when combined with bookkeeping or GST in one engagement, the pricing engine charges additional services at 70% of their base effort because context is shared.",
    complianceKeywords: ["Advance income tax", "MSME-1", "DPT-3"],
    faqs: [
      {
        q: "What does an advisory cycle actually deliver?",
        a: "Four things, every cycle: a rolling cash-flow view (inflows vs outflows ahead), receivables ageing with the risky balances flagged, the next 45 days of statutory and supplier due dates listed with amounts, and three clear recommended actions in writing.",
      },
      {
        q: "Can I combine advisory with bookkeeping or GST work?",
        a: "Yes, and it is cheaper together: the pricing engine prices your largest scope at full effort and each additional service at 70% of its base days, because the accountant already has your context. One engagement, one accountant, one dashboard.",
      },
    ],
    frequency: "monthly",
    cityAngle: (c) =>
      `For ${c.trait} in ${c.name}, the advisory cycle stays practical: a rolling cash-flow view, receivables ageing flagged early, and the next 45 days of due dates listed with amounts — three written actions at the end of every cycle.`,
  },
  {
    slug: "audit",
    shortName: "Audit support",
    metaTitle: "Audit Support & Tax Audit Readiness",
    metaDescription:
      "Audit-ready working papers, books reconciled with filed GST and TDS returns, queries resolved in writing — be ready before the 30 September tax audit deadline.",
    h1: "Audit support: ready before the auditor asks",
    intro:
      "Tax audit season has fixed geometry: the audit report is due 30 September — one month before the audited ITR on 31 October — and DIR-3 KYC for every director lands on the same 30 September date. Audit support means arriving at that season with working papers and schedules already prepared, not reconstructing a year in three weeks.",
    detail:
      "The audit SOP reconciles the books with what was actually filed — GST ledgers against the GST portal, TDS against 26AS and challans — resolves audit queries with documents in writing, and archives all workings to your portal workspace. To be clear about roles: platform accountants prepare and support; your statutory auditor signs, and stays independent.",
    complianceKeywords: ["Tax audit report", "ITR — audit cases", "AOC-4", "DIR-3 KYC"],
    faqs: [
      {
        q: "Is this an audit? Who signs the report?",
        a: "No — this is preparation and support. The platform accountant makes your books audit-ready: working papers and schedules prepared, books reconciled with filed GST and TDS returns, queries resolved with documents in writing. Your appointed statutory auditor examines and signs, staying fully independent.",
      },
      {
        q: "When should audit preparation start?",
        a: "Well before September. The tax audit report is due 30 September and the audited ITR follows on 31 October; preparation that starts with the financial year's books already reconciled month-by-month turns audit season into a review, not a reconstruction.",
      },
    ],
    frequency: "onetime",
    cityAngle: (c) =>
      `Audit season in ${c.name} rewards preparation: for ${c.trait}, the accountant reconciles books with filed GST and TDS returns and keeps working papers audit-ready long before the tax audit report falls due on 30 September.`,
  },
];
