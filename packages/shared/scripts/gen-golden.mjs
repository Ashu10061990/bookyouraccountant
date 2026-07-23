/**
 * Regenerates the pricing / SOP / coupon golden fixture from the FROZEN legacy
 * source. Run when the legacy `computeQuote` / `buildSopTasks` / `computePayable`
 * are (re-)confirmed, never to "fix" a diverging test — a divergence means the
 * TS port drifted from the legacy engine, which is the bug the fixture exists
 * to catch.
 *
 *   node packages/shared/scripts/gen-golden.mjs
 *
 * The legacy module's top imports Firebase, so its pure region is sliced out to
 * a temp ESM and imported on its own — the three functions below touch neither
 * Firebase nor the DOM.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const LEGACY =
  "/Users/shubhamverma/Documents/Personal/GARP-Associates/BYA& Keiri/bya-new/src/lib/assignments.js";
const OUT =
  "/Users/shubhamverma/Documents/Personal/GARP-Associates/bookyouraccountant/packages/shared/src/domain/__fixtures__/legacy-golden.json";

const source = readFileSync(LEGACY, "utf8");

// The pure region: from the first exported constant to the end of
// computePayable. Everything after that touches window / firebase.
const start = source.indexOf("export const TX_BANDS");
const anchor = source.indexOf("export function computePayable");
const end = source.indexOf("\n}", anchor) + 2;
if (start < 0 || anchor < 0 || end < 2) {
  throw new Error("Could not locate the pure region in the legacy source — did it move?");
}
const pure = source.slice(start, end);

const dir = mkdtempSync(join(tmpdir(), "bya-golden-"));
const tempModule = join(dir, "legacy-pure.mjs");
writeFileSync(tempModule, pure);
const L = await import(pathToFileURL(tempModule).href);

const QUOTE_CASES = [
  [
    "bookkeeping-monthly-uptodate-low",
    {
      serviceIds: ["bookkeeping"],
      frequency: "monthly",
      txBand: "low",
      backlog: "0",
      invoiceFiling: "filed",
      bankAccounts: "one",
      entityType: "prop",
      expTier: "standard",
      mode: "online",
      bizNature: "service",
    },
  ],
  [
    "bookkeeping-onetime-6plus-high-loose",
    {
      serviceIds: ["bookkeeping"],
      frequency: "onetime",
      txBand: "high",
      backlog: "6plus",
      invoiceFiling: "loose",
      bankAccounts: "many",
      entityType: "company",
      expTier: "expert",
      mode: "visit",
      bizNature: "manufacturing",
      arapScope: ["ar", "ap"],
    },
  ],
  [
    "gst-monthly-mid",
    {
      serviceIds: ["gst"],
      frequency: "monthly",
      gstReturns: ["gstr1", "gstr3b"],
      gstInvoices: "mid",
      backlog: "2",
      mode: "online",
      expTier: "senior",
      bizNature: "trading",
    },
  ],
  [
    "bookkeeping+gst-monthly",
    {
      serviceIds: ["bookkeeping", "gst"],
      frequency: "monthly",
      txBand: "mid",
      backlog: "3",
      gstReturns: ["gstr1", "gstr3b", "einvoice"],
      gstInvoices: "high",
      invoiceFiling: "partly",
      bankAccounts: "few",
      entityType: "partnership",
      expTier: "standard",
      mode: "online",
      bizNature: "trading",
    },
  ],
  [
    "tax-tds-monthly",
    {
      serviceIds: ["tax"],
      frequency: "monthly",
      taxScope: ["tds"],
      taxVolume: "mid",
      backlog: "0",
      mode: "online",
      expTier: "standard",
      bizNature: "service",
    },
  ],
  [
    "tax-full-onetime",
    {
      serviceIds: ["tax"],
      frequency: "onetime",
      taxScope: ["tds", "itr", "advance"],
      taxVolume: "high",
      mode: "online",
      expTier: "expert",
      bizNature: "service",
    },
  ],
  [
    "payroll-high",
    {
      serviceIds: ["payroll"],
      frequency: "monthly",
      payEmployees: "high",
      backlog: "0",
      mode: "online",
      expTier: "senior",
      bizNature: "service",
    },
  ],
  [
    "all-seven-onetime",
    {
      serviceIds: ["bookkeeping", "gst", "tax", "payroll", "statements", "advisory", "audit"],
      frequency: "onetime",
      txBand: "high",
      backlog: "6plus",
      gstReturns: ["gstr1", "gstr3b", "gstr9"],
      gstInvoices: "high",
      taxScope: ["tds", "itr"],
      taxVolume: "high",
      payEmployees: "high",
      invoiceFiling: "loose",
      bankAccounts: "many",
      entityType: "company",
      expTier: "expert",
      mode: "visit",
      bizNature: "manufacturing",
      arapScope: ["ar", "ap"],
    },
  ],
  [
    "statements-only-onetime",
    {
      serviceIds: ["statements"],
      frequency: "onetime",
      mode: "online",
      expTier: "standard",
      bizNature: "service",
    },
  ],
  [
    "advisory-monthly",
    {
      serviceIds: ["advisory"],
      frequency: "monthly",
      mode: "online",
      expTier: "senior",
      bizNature: "trading",
    },
  ],
  ["empty-services", { serviceIds: [] }],
];

const quotes = QUOTE_CASES.map(([name, answers]) => ({
  name,
  answers,
  quote: L.computeQuote(answers),
}));

const coupons = quotes
  .filter((q) => q.quote !== null)
  .slice(0, 4)
  .flatMap((q) => [
    {
      name: `${q.name}/coupon`,
      quote: q.quote,
      applyCoupon: true,
      result: L.computePayable(q.quote, true),
    },
    {
      name: `${q.name}/no-coupon`,
      quote: q.quote,
      applyCoupon: false,
      result: L.computePayable(q.quote, false),
    },
  ]);

const SOP_CASES = [
  ["bookkeeping-trading", ["bookkeeping"], "trading"],
  ["bookkeeping-manufacturing", ["bookkeeping"], "manufacturing"],
  ["bookkeeping-service", ["bookkeeping"], "service"],
  ["gst-only", ["gst"], "service"],
  ["bookkeeping+gst+tax", ["bookkeeping", "gst", "tax"], "trading"],
  [
    "all-services",
    ["bookkeeping", "gst", "tax", "payroll", "statements", "advisory", "audit"],
    "manufacturing",
  ],
  ["unknown-service-fallback", ["mystery"], "service"],
];
const sops = SOP_CASES.map(([name, serviceIds, bizNature]) => ({
  name,
  serviceIds,
  bizNature,
  tasks: L.buildSopTasks(serviceIds, bizNature),
}));

writeFileSync(OUT, JSON.stringify({ quotes, coupons, sops }, null, 2) + "\n");
console.log(`golden: ${quotes.length} quotes, ${coupons.length} coupons, ${sops.length} sop sets`);
