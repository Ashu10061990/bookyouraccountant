/**
 * Generates the marketing copy and chatbot knowledge base into shared, from the
 * frozen legacy source. §19 hand-curated content — benefits, FAQs, pricing
 * tiers, testimonials, and the 12-entry chatbot KB — carried verbatim so the
 * marketing site and the Keiri chatbot render the same words the live app does.
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const LEGACY = "/Users/shubhamverma/Documents/Personal/GARP-Associates/BYA& Keiri/bya-new";
const OUT =
  "/Users/shubhamverma/Documents/Personal/GARP-Associates/bookyouraccountant/packages/shared/src/reference";

// --- marketing/data.js is pure ESM already ---
const mk = await import(pathToFileURL(join(LEGACY, "src/marketing/data.js")).href);
const j = (v) => JSON.stringify(v, null, 2);

writeFileSync(
  join(OUT, "marketing.ts"),
  `// GENERATED from the frozen legacy src/marketing/data.js — do not hand-edit.
// Regenerate: node packages/shared/scripts/gen-marketing.mjs
// Feature inventory §19: marketing copy (benefits, FAQs, tiers, testimonials).

export const ECONOMICS = ${j(mk.ECONOMICS)} as const;
export const BENEFIT_GROUPS = ${j(mk.BENEFIT_GROUPS)} as const;
export const MIS_VIEWS = ${j(mk.MIS_VIEWS)} as const;
export const FAQS = ${j(mk.FAQS)} as const;
export const PRICING_TIERS = ${j(mk.PRICING_TIERS)} as const;
export const SAMPLE_ACCOUNTANTS = ${j(mk.SAMPLE_ACCOUNTANTS)} as const;
export const TESTIMONIALS = ${j(mk.TESTIMONIALS)} as const;
`,
);

// --- chatbot KB: slice the KB + GREETING out of KeiriChat.jsx (the rest is React) ---
const chat = readFileSync(join(LEGACY, "src/components/KeiriChat.jsx"), "utf8");
const kbStart = chat.indexOf("const KB =");
const kbEnd = chat.indexOf("];", kbStart) + 2;
const grStart = chat.indexOf("const GREETING");
const grEnd = chat.indexOf("};", grStart) + 2;
const pure =
  chat.slice(kbStart, kbEnd) +
  "\n" +
  (grStart >= 0 ? chat.slice(grStart, grEnd) + "\n" : "const GREETING = null;\n") +
  "export { KB" +
  (grStart >= 0 ? ", GREETING" : "") +
  " };\n";
const dir = mkdtempSync(join(tmpdir(), "bya-kb-"));
const kbMod = join(dir, "kb.mjs");
writeFileSync(kbMod, pure);
const { KB, GREETING } = await import(pathToFileURL(kbMod).href);

writeFileSync(
  join(OUT, "chatbot-kb.ts"),
  `// GENERATED from the frozen legacy src/components/KeiriChat.jsx — do not hand-edit.
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

export const CHATBOT_KB: readonly ChatbotEntry[] = ${j(KB)};

export const CHATBOT_GREETING = ${j(GREETING)} as const;
`,
);

console.log(
  `marketing: ${mk.BENEFIT_GROUPS.length} benefit groups, ${mk.FAQS.length} FAQs, ${mk.PRICING_TIERS.length} tiers, ${mk.TESTIMONIALS.length} testimonials`,
);
console.log(`chatbot: ${KB.length} KB entries`);
