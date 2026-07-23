// GENERATED from the frozen legacy src/marketing/data.js — do not hand-edit.
// Regenerate: node packages/shared/scripts/gen-marketing.mjs
// Feature inventory §19: marketing copy (benefits, FAQs, tiers, testimonials).

export const ECONOMICS = {
  defaultSalary: 45000,
  loadingFactor: 1.18,
  defaultDays: 10,
  perDayRate: 1200,
  monthsPerYear: 12,
  minDays: 1,
  maxDays: 30,
  minSalary: 15000,
  maxSalary: 200000,
} as const;
export const BENEFIT_GROUPS = [
  {
    theme: "Growth & winning work",
    ic: "↗",
    items: [
      {
        t: "Quote tenders with confidence",
        d: "Up-to-date P&L, turnover and net-worth figures let you price tenders and bids accurately — and produce the financial statements buyers ask for, on the spot.",
      },
      {
        t: "Bank & investor ready, always",
        d: "Live books mean loan, OD-limit and investor requests are answered in days, not weeks. No scramble to reconstruct a year of entries.",
      },
      {
        t: "Know which products & clients actually pay",
        d: "See margin by product, service or client so you double down on what's profitable and quietly drop what bleeds you.",
      },
    ],
  },
  {
    theme: "Cash & risk",
    ic: "◔",
    items: [
      {
        t: "Rolling forecast prevents cash crunch",
        d: "A forward view of inflows vs outflows warns you weeks ahead of a shortfall — so you arrange funds calmly instead of firefighting.",
      },
      {
        t: "Chase receivables before they age",
        d: "Receivables-ageing on the dashboard flags who owes you and for how long, so you collect faster and protect working capital.",
      },
      {
        t: "Plan for taxes & big outflows",
        d: "See advance-tax, GST and large supplier payments coming, and set money aside in advance — no last-minute borrowing at high cost.",
      },
    ],
  },
  {
    theme: "Cost saving",
    ic: "₹",
    items: [
      {
        t: "Pay for days, not a full-time salary",
        d: "Skip the ₹4–7 lakh/year loaded cost of an in-house accountant (salary + PF + ESI + bonus). Book a verified CA only on the days you need.",
      },
      {
        t: "Catch leakage & duplicate spend",
        d: "Expense trends surface duplicate subscriptions, creeping vendor costs and wasteful spend you'd otherwise never notice.",
      },
      {
        t: "Avoid penalties & interest",
        d: "Due-date tracking on GST, TDS and ROC means no late fees, no interest, no notice — money saved every single month.",
      },
    ],
  },
  {
    theme: "Compliance & control",
    ic: "✓",
    items: [
      {
        t: "Every filing tracked in one place",
        d: "GST, TDS, advance tax, ROC — status and deadlines on one screen, with reminders before each due date.",
      },
      {
        t: "Audit-ready books, year round",
        d: "Clean, current records mean statutory audit and assessments are smooth, not a panic — and queries get answered fast.",
      },
      {
        t: "One source of truth",
        d: "Owner, accountant and dashboard all see the same live numbers — no version confusion, no 'which file is latest?'.",
      },
    ],
  },
] as const;
export const MIS_VIEWS = [
  {
    img: "/dash-overview.png",
    t: "Business Overview",
    d: "Revenue, net profit, GST liability and filing status — the whole business on one screen, live.",
  },
  {
    img: "/dash-cash.png",
    t: "Cash Flow & Receivables",
    d: "Cash position, receivables ageing and bank balances, auto-synced so you always know what's collectible.",
  },
  {
    img: "/dash-pl.png",
    t: "Profit & Loss MIS",
    d: "Monthly P&L with month-on-month comparison — see exactly what changed and why.",
  },
  {
    img: "/dash-gst.png",
    t: "GST & Compliance",
    d: "GST liability, input credit and every due date tracked, with reminders before you'd ever be late.",
  },
  {
    img: "/dash-expenses.png",
    t: "Expense Analysis",
    d: "Expense trends by category to surface leakage, duplicate spend and creeping vendor costs.",
  },
] as const;
export const FAQS = [
  {
    q: "Are these accountants qualified?",
    a: "Every accountant on the platform passes a qualifying exam before their profile goes live, and holds a recognised commerce qualification (B.Com, M.Com, MBA Finance or CA-Inter). The CA-verified badge means we've checked it.",
  },
  {
    q: "What if I need help only a few days a month?",
    a: "That's exactly the point. Most small businesses need an accountant about 10 days a month but pay a full-time salary for all 30. You book only the days you use, at a fixed day-rate.",
  },
  {
    q: "What about urgent or daily issues?",
    a: "You can book the same accountant on a recurring basis, or reach them for follow-ups. For businesses that genuinely need daily on-site work, a full-time hire may still make sense — the calculator helps you see where the line is.",
  },
  {
    q: "Do I get a proper invoice?",
    a: "Yes. Every booking generates a GST-compliant invoice, so the spend is fully accounted for in your books.",
  },
  {
    q: "Which cities do you cover?",
    a: "We're rolling out across major Indian metros first. Sign in to see verified accountants available in your city.",
  },
] as const;
export const PRICING_TIERS = [
  {
    name: "Bookkeeping & Data",
    from: 1200,
    unit: "portal-priced",
    desc: "Day-to-day books, ledger entry, bank reconciliation, invoice management.",
    points: [
      "Books updated on your software or ours",
      "Bank & ledger reconciliation",
      "GST-compliant invoice each visit",
    ],
  },
  {
    name: "Compliance & Filings",
    from: 1800,
    unit: "portal-priced",
    featured: true,
    desc: "GST, TDS and payroll compliance handled by a verified professional.",
    points: [
      "GST returns (GSTR-1, 3B)",
      "TDS computation & returns",
      "EPF / ESI compliance support",
    ],
  },
  {
    name: "Senior CA / Advisory",
    from: 3500,
    unit: "portal-priced",
    desc: "Chartered Accountant-level review, finalisation and business advisory.",
    points: [
      "Finalisation & statements",
      "Tax planning & assessments",
      "MIS review with you, monthly",
    ],
  },
] as const;
export const SAMPLE_ACCOUNTANTS = [
  {
    initials: "PS",
    city: "Greater Noida",
    exp: "8 yrs",
    rating: 4.9,
    jobs: 120,
    skills: ["GST", "TDS", "Tally"],
    rate: 1500,
  },
  {
    initials: "RK",
    city: "New Delhi",
    exp: "12 yrs",
    rating: 4.8,
    jobs: 210,
    skills: ["Payroll", "EPF/ESI", "Books"],
    rate: 1800,
  },
  {
    initials: "AM",
    city: "Pune",
    exp: "6 yrs",
    rating: 4.9,
    jobs: 95,
    skills: ["GST", "MIS", "Zoho"],
    rate: 1400,
  },
] as const;
export const TESTIMONIALS = [
  {
    quote:
      "We replaced a ₹40,000 salary with 8 booked days a month. Books are cleaner than before and I finally see my numbers.",
    who: "Owner, trading firm",
    where: "Greater Noida",
  },
  {
    quote: "The qualifying exam matters — the accountant we got knew GST inside out from day one.",
    who: "Founder, D2C brand",
    where: "New Delhi",
  },
  {
    quote:
      "The monthly MIS is what keeps us. My CA and I look at the same dashboard and decide in minutes.",
    who: "Director, manufacturing MSME",
    where: "Agra",
  },
] as const;
