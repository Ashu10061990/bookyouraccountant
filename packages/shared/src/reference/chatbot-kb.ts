// GENERATED from the frozen legacy src/components/KeiriChat.jsx — do not hand-edit.
// Regenerate: node packages/shared/scripts/gen-marketing.mjs
// Feature inventory §19: the Keiri chatbot knowledge base.
//
// The scripted KB is retained per architecture decision D15 as the fallback the
// Claude-backed chatbot degrades to. Keyword-matched entries with quick-reply chips.

export interface ChatbotEntry {
  readonly id: string;
  readonly keywords: readonly string[];
  readonly a: string;
  readonly chips?: readonly string[];
}

export const CHATBOT_KB: readonly ChatbotEntry[] = [
  {
    id: "what",
    keywords: ["what is", "about", "bookyouraccountant", "keiri", "what do you do", "platform"],
    a: "BookYourAccountant connects Indian small businesses with Keiri-verified accountants you can book by the day — no full-time salary, no long retainer. When your books are done, you also get a live MIS dashboard showing sales, dues, expenses, GST and compliance.",
    chips: ["How does it work?", "What does it cost?", "Are accountants verified?"],
  },
  {
    id: "how",
    keywords: ["how does it work", "how it works", "process", "steps", "get started", "start"],
    a: "Three steps: 1) Tell us the work you need and book a verified accountant for the days you need. 2) They do your accounting and compliance. 3) You see everything live on your dashboard — revenue, receivables, expenses, GST and due dates.",
    chips: ["What does it cost?", "What is the dashboard?"],
  },
  {
    id: "pricing",
    keywords: [
      "cost",
      "price",
      "pricing",
      "charge",
      "fee",
      "rate",
      "how much",
      "per day",
      "expensive",
    ],
    a: "You pay only for the days you book — no full-time salary or fixed retainer. Accountants set a daily rate within a band based on their qualification and experience, so pricing stays fair. Your first month's dashboard is free so you can see the value first.",
    chips: ["How does booking work?", "Why a daily rate?"],
  },
  {
    id: "verified",
    keywords: ["verified", "verify", "trust", "qualified", "background", "exam", "vetted", "safe"],
    a: "Every accountant is Keiri-verified: KYC checked, qualifications and marksheets reviewed, and they must clear a rigorous qualifying exam (drawn from a 293-question bank across accounting, GST, TDS, income tax, audit and more) before they can take clients.",
    chips: ["What does it cost?", "How do I book?"],
  },
  {
    id: "dashboard",
    keywords: ["dashboard", "mis", "reports", "see my business", "numbers", "analytics"],
    a: "Your financial dashboard shows monthly sales vs payments pending, top outstanding invoices, expense breakdown, bank balances, GST liability and a compliance tracker — with filters and tap-to-drill-down into invoices. Your accountant updates it from your books.",
    chips: ["How do I get it?", "Is the first month free?"],
  },
  {
    id: "book",
    keywords: [
      "book",
      "booking",
      "hire",
      "find accountant",
      "find an accountant",
      "register",
      "sign up",
    ],
    a: "Sign in, choose 'Business', and you can browse verified accountants and book one for the days you need — directly through the portal. No contracts, cancel anytime.",
    chips: ["Are accountants verified?", "What does it cost?"],
  },
  {
    id: "accountant_join",
    keywords: [
      "become accountant",
      "join as accountant",
      "work",
      "i am a ca",
      "i am an accountant",
      "earn",
      "as an accountant",
    ],
    a: "Accountants can register, complete KYC, upload qualifications, and clear the qualifying exam to get verified. Once approved, you set your daily rate (within your experience band) and start receiving bookings.",
    chips: ["What is the exam?", "How is the rate set?"],
  },
  {
    id: "gst",
    keywords: ["gst", "gstr", "gst return", "gstr-1", "gstr-3b", "input tax", "itc"],
    a: "GST returns most small businesses deal with: GSTR-1 (outward sales, monthly/quarterly) and GSTR-3B (summary + tax payment, monthly). Input Tax Credit (ITC) lets you offset GST paid on purchases against GST on sales. Your accountant files these and the dashboard tracks the due dates.",
    chips: ["What are GST due dates?", "Talk to an accountant"],
  },
  {
    id: "gst_due",
    keywords: ["gst due", "gstr-1 due", "gstr-3b due", "gst date", "filing date", "due date"],
    a: "As a general guide: GSTR-1 is usually due by the 11th of the next month (monthly filers), and GSTR-3B by the 20th (dates vary by turnover and QRMP scheme). Exact dates depend on your registration — your accountant and the compliance tracker keep you on schedule.",
    chips: ["What is GSTR-3B?", "Talk to an accountant"],
  },
  {
    id: "tds",
    keywords: ["tds", "tax deducted", "194", "tds rate", "form 16", "26q", "24q"],
    a: "TDS (Tax Deducted at Source) is tax you deduct when making certain payments (salary, rent, commission, professional fees) and deposit with the government. Rates differ by payment type and section. Your accountant handles deduction, deposit and quarterly TDS returns.",
    chips: ["What is GST?", "Talk to an accountant"],
  },
  {
    id: "itr",
    keywords: ["itr", "income tax", "income tax return", "tax return", "filing", "tax slab"],
    a: "An Income Tax Return (ITR) reports your income and tax for the financial year. Businesses also reconcile TDS, advance tax and books before filing. The right ITR form and deadline depend on your entity type — your accountant determines and files the correct one.",
    chips: ["What is TDS?", "Talk to an accountant"],
  },
  {
    id: "compliance",
    keywords: ["compliance", "due dates", "roc", "pf", "esi", "deadline", "reminder"],
    a: "The platform tracks your recurring compliance — GST (GSTR-1/3B), TDS, PF/ESI, ITR and ROC/MCA filings — with due-date flags on your dashboard, so nothing slips. Your accountant handles the actual filings.",
    chips: ["What is GST?", "How do I book?"],
  },
];

export const CHATBOT_GREETING = {
  a: "Hi! I'm Keiri 👋 — I can help with how the platform works, pricing, verification, and general GST / TDS / income-tax questions. What would you like to know?",
  chips: ["What is BookYourAccountant?", "How does it work?", "What does it cost?", "GST help"],
} as const;
