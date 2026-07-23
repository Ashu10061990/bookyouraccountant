/**
 * Generates packages/shared/src/reference/* from the FROZEN legacy source.
 * Reads the legacy modules and serialises their exports, so nothing is retyped
 * and a transcription slip is structurally impossible.
 */
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const LEGACY = "/Users/shubhamverma/Documents/Personal/GARP-Associates/BYA& Keiri/bya-new";
const OUT =
  "/Users/shubhamverma/Documents/Personal/GARP-Associates/bookyouraccountant/packages/shared/src/reference";

const india = await import(pathToFileURL(path.join(LEGACY, "src/lib/india.js")).href);
const profile = await import(pathToFileURL(path.join(LEGACY, "src/lib/profileOptions.js")).href);

const j = (v) => JSON.stringify(v, null, 2);

const header = (what, source) => `// GENERATED from the frozen legacy source — do not hand-edit.
// Source: ../BYA& Keiri/bya-new/${source}
// ${what}
// Regenerate rather than retype: transcription is how hand-curated data is lost.
`;

// ---- india.ts ----
await writeFile(
  path.join(OUT, "india.ts"),
  `${header("Feature inventory §19: India states/UTs and their major cities.", "src/lib/india.js")}
/**
 * All 36 states and union territories.
 *
 * Used for registration dropdowns and, later, for accountant/business matching
 * by location.
 */
export const INDIA_STATES = ${j(india.INDIA_STATES)} as const;

/**
 * Major cities per state/UT — suggestions, not a closed set.
 *
 * The legacy UI renders these in a datalist, so a user may type any city. That
 * is deliberate: India has thousands of towns and a closed list would block
 * real businesses from registering.
 */
export const CITIES_BY_STATE: Readonly<Record<string, readonly string[]>> = ${j(india.CITIES_BY_STATE)};

export type IndiaState = (typeof INDIA_STATES)[number];
`,
);

// ---- profile-options.ts ----
const parts = [];
const emit = (name, value, doc) => {
  parts.push(`${doc}\nexport const ${name} = ${j(value)} as const;\n`);
};

emit(
  "ACCOUNTING_SOFTWARE",
  profile.ACCOUNTING_SOFTWARE,
  `/**
 * Accounting packages a business might already run.
 *
 * The SAME vocabulary is offered to businesses and accountants — that shared
 * vocabulary is what makes software-based matching possible at all.
 */`,
);
emit(
  "COMPLIANCE_SOFTWARE",
  profile.COMPLIANCE_SOFTWARE,
  `/** Compliance/filing tools, shared vocabulary as above. */`,
);
emit(
  "BOOKS_LOCATION",
  profile.BOOKS_LOCATION,
  `/** Where the books physically live — drives on-site vs off-site matching. */`,
);
emit(
  "ENTITY_TYPE",
  profile.ENTITY_TYPE,
  `/** Legal constitution of the business. Determines which filings apply. */`,
);
emit(
  "TURNOVER_BAND",
  profile.TURNOVER_BAND,
  `/** Annual turnover band. Feeds the pricing engine's service slabs. */`,
);
emit("GST_STATUS", profile.GST_STATUS, `/** GST registration status. */`);
emit(
  "TXN_VOLUME",
  profile.TXN_VOLUME,
  `/** Monthly transaction volume band — the primary pricing input. */`,
);
emit(
  "PROFILE_SERVICES",
  profile.SERVICES,
  `/**
 * The service vocabulary used on PROFILES, for matching.
 *
 * NOT the same set as the seeded \`services\` catalogue in ./services.ts. The
 * two lists disagree on ids — this one has tds/itr/roc/einvoicing/other, the
 * catalogue has tax/statements. Both are carried forward verbatim rather than
 * reconciled, because reconciling them is a product decision (spec §18 Q3),
 * not a porting decision. See PARITY-CHECKLIST.md.
 */`,
);
emit("WORK_MODE", profile.WORK_MODE, `/** Remote / on-site / hybrid working preference. */`);

await writeFile(
  path.join(OUT, "profile-options.ts"),
  `${header("Feature inventory §19: profile vocabularies (11 accounting + 11 compliance tools, and the profile field options).", "src/lib/profileOptions.js")}
/** A selectable option. \`other\` entries pair with a free-text box in the UI. */
export interface ProfileOption {
  readonly value: string;
  readonly label: string;
}

${parts.join("\n")}`,
);

console.log(
  "india:",
  india.INDIA_STATES.length,
  "states,",
  Object.values(india.CITIES_BY_STATE).flat().length,
  "cities",
);
console.log(
  "software:",
  profile.ACCOUNTING_SOFTWARE.length,
  "accounting,",
  profile.COMPLIANCE_SOFTWARE.length,
  "compliance",
);
console.log("profile services:", profile.SERVICES.length);
