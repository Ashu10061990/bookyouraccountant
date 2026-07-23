import type { BizNature } from "./pricing-options.js";

/**
 * SOP checklist generation — feature inventory §19, ported verbatim from the
 * frozen legacy `buildSopTasks` and its templates in `src/lib/assignments.js`.
 *
 * This is hand-curated domain knowledge — a chartered accountant wrote every
 * Do / Don't / Reconcile line — and it is exactly the kind of asset §19 warns
 * costs a domain expert to recreate. It is carried across word-for-word, and
 * the golden-vector test proves it: every COMMON, nature-specific and
 * per-service entry appears in at least one captured case, so a single altered
 * or dropped line diverges the fixture.
 *
 * The generated checklist is what the assigned accountant ticks through, and
 * whose completion `firestore.rules` gated the "mark completed" transition on.
 */

export interface SopTask {
  id: string;
  group: string;
  label: string;
  /**
   * The Do / Don't / Reconcile guidance. Present (possibly null) on tasks from
   * the detailed bookkeeping SOP; **absent** on the four-line per-service tasks,
   * which carry only a label. This asymmetry is the legacy shape exactly — a
   * per-service task object has no such keys — and the golden test enforces it,
   * because a stored assignment's `tasks` array must migrate byte-identically.
   */
  doTxt?: string | null;
  dont?: string | null;
  reconcile?: string | null;
  done: boolean;
  doneAt: string | null;
}

interface SopTemplate {
  group: string;
  label: string;
  doTxt?: string;
  dont?: string;
  reconcile?: string;
}

/**
 * The detailed Bookkeeping & Accounting SOP — 22 common tasks across five
 * phases (setup → entries → reconciliations → review → close). With a
 * business-nature block inserted, this becomes the "28-point bookkeeping SOP"
 * the inventory names (22 common + 6 for trading).
 */
const COMMON_SOP: SopTemplate[] = [
  // ---- Getting set up ----
  {
    group: "start",
    label: "Confirm access the right way",
    doTxt:
      "Get a separate user ID on Tally/Zoho. Note what access was given, by whom, on what date.",
    dont: "Never take passwords on WhatsApp or personal chat.",
  },
  {
    group: "start",
    label: "Day-1 health check before any entry",
    doTxt:
      "Check opening balances against the last closed year. List pending months of bank reco and unfiled returns.",
    dont: "Do not start entries before this check — old errors will look like yours.",
  },
  {
    group: "start",
    label: "Collect and file source documents",
    doTxt: "Get purchase invoices, sales invoices, bank statements and expense bills, month-wise.",
    reconcile: "Documents received ↔ the papers list the client confirmed on the portal",
  },

  // ---- Entries ----
  {
    group: "entries",
    label: "Post purchases",
    doTxt: "Enter every purchase from the vendor bill — correct ledger, correct GST treatment.",
    dont: "No entry without a bill. Never dump items into 'Miscellaneous'.",
  },
  {
    group: "entries",
    label: "Post sales with invoice serial control",
    doTxt:
      "Enter sales serial-wise from the invoice register. Flag missing or duplicate invoice numbers to the client.",
    reconcile: "Sales in books ↔ e-invoice portal / GSTR-1 filings, and bank credits",
  },
  {
    group: "entries",
    label: "Post expenses & payments",
    doTxt: "Book expenses with supporting bills. Move personal spends to drawings/capital.",
    dont: "Do not guess a ledger — park unclear items in a numbered query list and ask in one batch.",
  },
  {
    group: "entries",
    label: "Record cash transactions",
    doTxt: "Update the cash book date-wise. Verify cash never goes negative on any date.",
    reconcile: "Cash book ↔ physical cash count, same day",
  },
  {
    group: "entries",
    label: "Month-end adjustment entries",
    doTxt:
      "Book prepaid expenses, outstanding expenses, accrued income and depreciation for the month.",
    dont: "Do not leave adjustments for year-end — monthly books must stand on their own.",
  },

  // ---- Reconciliations ----
  {
    group: "reco",
    label: "Bank reconciliation — every account, every month",
    doTxt: "Match every bank line. Prepare BRS with each difference explained in writing.",
    dont: "Do not carry unexplained differences forward.",
    reconcile: "Bank book ↔ bank statement — no gap months",
  },
  {
    group: "reco",
    label: "Debtors (receivables) reconciliation",
    doTxt: "Match customer ledgers. Prepare ageing; list disputed and very old balances.",
    reconcile: "Debtor ledger ↔ customer's statement or written confirmation",
  },
  {
    group: "reco",
    label: "Creditors (payables) reconciliation",
    doTxt: "Match supplier ledgers and hold-backs. Note debit notes and rate differences.",
    reconcile: "Creditor ledger ↔ supplier statement; purchases ↔ GSTR-2B if GST-registered",
  },
  {
    group: "reco",
    label: "Loans, EMI & interest",
    doTxt: "Match every loan balance. Split EMI into interest and principal correctly.",
    reconcile: "Loan ledger ↔ lender statement / sanction letter",
  },
  {
    group: "reco",
    label: "Statutory dues ledgers",
    doTxt:
      "Verify GST payable, TDS payable, PF/ESI payable balances against what was actually deposited.",
    reconcile: "Dues ledgers ↔ paid challans and portal balances",
  },
  {
    group: "reco",
    label: "Related-party & inter-branch balances",
    doTxt:
      "Match balances with sister concerns, directors and branches; document the nature of each balance.",
    dont: "Do not net off related-party balances without written confirmation from both sides.",
  },

  // ---- Review & clean-up ----
  {
    group: "review",
    label: "Ledger scrutiny",
    doTxt: "Scan each ledger for wrong postings, duplicates and round-off differences.",
    dont: "Do not leave suspense — bring it to zero or explain every item in writing.",
  },
  {
    group: "review",
    label: "Fixed asset register & depreciation",
    doTxt:
      "Update the FA register for additions/deletions; check depreciation rates and put-to-use dates.",
    dont: "Do not expense capital items — repairs vs capitalisation must be judged item by item.",
  },
  {
    group: "review",
    label: "Tax ledgers match filed returns",
    doTxt: "Ensure GST and TDS ledgers in books agree with what was actually filed and paid.",
    reconcile: "TDS ledger ↔ 26AS and challans; GST ledgers ↔ GST portal",
  },
  {
    group: "review",
    label: "Revenue & expense cut-off",
    doTxt:
      "Check the last few invoices/bills of the month and the first few of the next — right period, right month.",
    dont: "Do not book next month's invoices this month to inflate sales.",
  },
  {
    group: "review",
    label: "Trial balance & the five key numbers",
    doTxt:
      "Tally the trial balance. Re-check sales, profit, cash, receivables and payables against last month and know why each moved.",
  },

  // ---- Closing the visit ----
  {
    group: "close",
    label: "Self-check with the checklist before the client sees anything",
    doTxt: "Run this list top to bottom. Fix what you find now, silently and completely.",
  },
  {
    group: "close",
    label: "Update dashboard & upload plain-language MIS",
    doTxt: "Update revenue, expenses, cash, receivables ageing and coming due dates.",
    dont: "Do not leave unverified numbers on the dashboard — a wrong number is worse than none.",
  },
  {
    group: "close",
    label: "Client walkthrough & sign-off on the portal",
    doTxt:
      "Explain in rupees and decisions, not ledgers. Get the visit summary accepted with open items listed.",
  },
];

/** Nature-specific checks inserted into the bookkeeping SOP — 19 in all. */
const NATURE_SOP: Record<BizNature, SopTemplate[]> = {
  trading: [
    {
      group: "trading",
      label: "Stock register up to date",
      doTxt:
        "Post every purchase into stock (with GRN where used) and every sale out of stock, item-wise.",
      reconcile: "Purchases ↔ goods inward ↔ stock register",
    },
    {
      group: "trading",
      label: "Physical stock verification",
      doTxt:
        "Match book stock with physical count for key items; record shortages/excess with reasons.",
      reconcile: "Stock register ↔ physical count sheet, signed by the client",
    },
    {
      group: "trading",
      label: "Stock valuation — consistent method",
      doTxt:
        "Value closing stock at cost or NRV, lower of the two; keep FIFO/weighted-average consistent.",
      dont: "Do not change the valuation method between months to manage profit.",
    },
    {
      group: "trading",
      label: "Goods movement vs e-way bills",
      doTxt: "Check sales and stock transfers against e-way bills raised.",
      reconcile: "Stock out ↔ sales invoices ↔ e-way bill portal",
    },
    {
      group: "trading",
      label: "Purchase returns & debit notes",
      doTxt: "Record returns, rate differences and scheme credits with proper debit/credit notes.",
      dont: "Do not adjust returns directly in purchase entries without a document.",
    },
    {
      group: "trading",
      label: "Product-wise margin summary",
      doTxt:
        "Prepare a simple item/category-wise gross margin view for the MIS — owners decide from this.",
    },
  ],
  manufacturing: [
    {
      group: "manufacturing",
      label: "Raw material consumption",
      doTxt:
        "Match material issued to production with production records; investigate abnormal consumption.",
      reconcile: "Stores issue register ↔ production report",
    },
    {
      group: "manufacturing",
      label: "Stores & GRN entries",
      doTxt: "Post goods received via GRN; match GRN with supplier bills before booking purchases.",
      reconcile: "GRN ↔ supplier invoice ↔ purchase entry",
    },
    {
      group: "manufacturing",
      label: "WIP & finished goods valuation",
      doTxt:
        "Value WIP and finished goods with material + labour + overheads on a consistent basis.",
      dont: "Do not value finished goods at selling price.",
    },
    {
      group: "manufacturing",
      label: "Wastage, scrap & by-products",
      doTxt: "Record normal/abnormal wastage; account scrap sales with GST.",
      reconcile: "Scrap sales in books ↔ weighbridge/gate records and invoices",
    },
    {
      group: "manufacturing",
      label: "Job work tracking",
      doTxt:
        "Track material sent to and received from job workers with delivery challans; monitor return timelines.",
      reconcile: "Job work challans ↔ material register (ITC-04 discipline)",
    },
    {
      group: "manufacturing",
      label: "Repairs vs capitalisation on plant & machinery",
      doTxt:
        "Judge each major spend: repair (expense) or improvement (capitalise); document the basis.",
      dont: "Do not expense machinery overhauls that extend life or capacity.",
    },
    {
      group: "manufacturing",
      label: "Power, fuel & production overheads mapping",
      doTxt:
        "Map power/fuel and factory overheads to production cost, separate from office expenses.",
    },
  ],
  service: [
    {
      group: "service",
      label: "Unbilled revenue / work-in-progress",
      doTxt: "List work completed but not yet invoiced; book unbilled revenue for the month.",
      reconcile: "Work/timesheet records ↔ invoices raised",
    },
    {
      group: "service",
      label: "Advances received & GST on advances",
      doTxt: "Track client advances; apply GST on advances where applicable for services.",
      dont: "Do not sit on advances unadjusted — knock them off against invoices promptly.",
    },
    {
      group: "service",
      label: "TDS deducted by clients",
      doTxt: "Track TDS deducted on your client's receipts; ensure it reflects for credit.",
      reconcile: "TDS receivable ledger ↔ 26AS / AIS",
    },
    {
      group: "service",
      label: "Client / project-wise profitability",
      doTxt: "Map revenue and direct costs client-wise or project-wise for the MIS.",
    },
    {
      group: "service",
      label: "Reimbursable expenses billed",
      doTxt: "Check out-of-pocket expenses incurred for clients are billed with proper support.",
      dont: "Do not mix reimbursables into your own expense ledgers.",
    },
    {
      group: "service",
      label: "Contract / PO vs billing milestones",
      doTxt: "Match invoicing against contract terms and milestones; flag unbilled milestones.",
      reconcile: "Invoices raised ↔ contract / purchase order terms",
    },
  ],
};

/**
 * Per-service SOPs for the non-bookkeeping scopes — six services × four tasks.
 *
 * `bookkeeping` is present too (kept verbatim from the legacy), but
 * `buildSopTasks` uses the detailed `COMMON_SOP` for bookkeeping instead, so
 * this entry is never emitted. Carried forward under the keep-everything
 * policy rather than pruned.
 */
const SOP_BY_SERVICE: Record<string, string[]> = {
  bookkeeping: [
    "Enter all transactions with a document behind each entry",
    "Bank reconciliation — every month, difference explained",
    "Map every ledger to the correct head; suspense to zero",
    "Park unclear items in a query list; clear queries in one batch",
  ],
  gst: [
    "Match sales in books with GSTR-1 and e-invoice portal",
    "Match GSTR-2B with purchase register before claiming ITC",
    "Get client approval on the portal before filing",
    "File GSTR-1 / 3B and save ARN on the portal",
  ],
  tax: [
    "Compute TDS section-wise with current rates and limits",
    "Cross-check with 26AS / AIS / TRACES and paid challans",
    "Get client approval on the portal before filing",
    "File the return and save the acknowledgement",
  ],
  payroll: [
    "Verify EPF / ESI applicability and wage definitions",
    "Match payroll with EPFO / ESIC portal and bank payments",
    "Process salary register and statutory deductions",
    "File EPF / ESI within due dates; save challans",
  ],
  statements: [
    "Verify trial balance ties to ledgers; no negative cash",
    "Confirm debtors / creditors with party statements",
    "Prepare Schedule III financial statements",
    "Walk the client through the statements in plain language",
  ],
  advisory: [
    "Prepare rolling cash-flow view — inflows vs outflows ahead",
    "Flag receivables ageing and upcoming large outflows",
    "List due dates for the next 45 days with amounts",
    "Give the owner 3 clear actions in writing",
  ],
  audit: [
    "Prepare audit-ready working papers and schedules",
    "Reconcile books with filed returns (GST, TDS)",
    "Resolve audit queries with documents, in writing",
    "Archive all workings to the portal workspace",
  ],
};

/**
 * Builds the SOP task list for a scope, grouped so each service stays separate.
 *
 * For a bookkeeping engagement the order is deliberate: setup → entries →
 * reconciliations → the business-nature block → review → close. Other services
 * append their four-task checklist. With no recognised service, the full common
 * SOP is returned as a floor rather than an empty list.
 */
export function buildSopTasks(serviceIds: string[], bizNature?: string): SopTask[] {
  const out: SopTask[] = [];
  let i = 0;

  const push = (t: SopTemplate): void => {
    out.push({
      id: "t" + String(i++),
      group: t.group,
      label: t.label,
      doTxt: t.doTxt ?? null,
      dont: t.dont ?? null,
      reconcile: t.reconcile ?? null,
      done: false,
      doneAt: null,
    });
  };

  if (serviceIds.includes("bookkeeping")) {
    COMMON_SOP.filter((t) => ["start", "entries", "reco"].includes(t.group)).forEach(push);
    (NATURE_SOP[bizNature as BizNature] ?? []).forEach(push);
    COMMON_SOP.filter((t) => ["review", "close"].includes(t.group)).forEach(push);
  }

  serviceIds
    .filter((sid) => sid !== "bookkeeping")
    .forEach((sid) => {
      // No doTxt/dont/reconcile keys — matching the legacy per-service task
      // shape exactly. These carry a label only.
      (SOP_BY_SERVICE[sid] ?? []).forEach((label) => {
        out.push({ id: "t" + String(i++), group: sid, label, done: false, doneAt: null });
      });
    });

  if (out.length === 0) {
    COMMON_SOP.forEach(push);
  }

  return out;
}

/** Counts, exported so the parity test can assert the inventory's §19 figures. */
export const SOP_COUNTS = {
  common: COMMON_SOP.length,
  natureTrading: NATURE_SOP.trading.length,
  natureManufacturing: NATURE_SOP.manufacturing.length,
  natureService: NATURE_SOP.service.length,
  perService: SOP_BY_SERVICE,
} as const;
