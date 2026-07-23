/**
 * Golden vectors for the compliance calendar. Slices the pure obligation data
 * and occurrence builders out of the frozen ComplianceChart.jsx (the React
 * component below them references colors/hooks; ITEMS and its `occ` functions do
 * not) and captures every occurrence for three financial years. The TS port
 * asserts it reproduces these dates exactly — the whole value of the asset is
 * that the statutory dates are right.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const LEGACY =
  "/Users/shubhamverma/Documents/Personal/GARP-Associates/BYA& Keiri/bya-new/src/components/ComplianceChart.jsx";
const OUT =
  "/Users/shubhamverma/Documents/Personal/GARP-Associates/bookyouraccountant/packages/shared/src/domain/__fixtures__/legacy-compliance-golden.json";

const source = readFileSync(LEGACY, "utf8");
const start = source.indexOf("const MONTHS =");
const end = source.indexOf("const startOfDay");
if (start < 0 || end < 2) throw new Error("Could not locate the ITEMS region");

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const pure = source.slice(start, end) + "\nexport { ITEMS };\n";

const dir = mkdtempSync(join(tmpdir(), "bya-compliance-"));
const mod = join(dir, "items.mjs");
writeFileSync(mod, pure);
const { ITEMS } = await import(pathToFileURL(mod).href);

const items = ITEMS.map((it) => ({
  name: it.name,
  appliesTo: it.appliesTo,
  desc: it.desc,
  occurrences: Object.fromEntries(
    [2025, 2026, 2027].map((fy) => [
      fy,
      it.occ(fy).map((o) => ({ dateIso: iso(o.date), period: o.period })),
    ]),
  ),
}));

writeFileSync(OUT, JSON.stringify({ items }, null, 2) + "\n");
const totalOccurrences = items.reduce(
  (t, it) => t + Object.values(it.occurrences).flat().length,
  0,
);
console.log(
  `compliance: ${items.length} obligations, ${totalOccurrences} occurrences across 3 FYs`,
);
