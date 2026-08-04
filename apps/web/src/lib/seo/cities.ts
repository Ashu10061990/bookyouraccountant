import { CITIES_BY_STATE } from "@bya/shared";

/**
 * The curated city set for the programmatic service × city pages.
 *
 * Seven major metros, each verified at module load against the shared India
 * dataset (`CITIES_BY_STATE`, feature inventory §19) — a typo here fails the
 * build instead of shipping a landing page for a city the platform's own
 * reference data does not know.
 *
 * `trait` and the paragraphs are the city-specific copy blocks; each city's
 * prose is written individually so no two city pages share body text.
 */
export interface CitySeo {
  slug: string;
  name: string;
  state: string;
  /** Short noun phrase for composing service × city sentences. */
  trait: string;
  intro: string;
  businessProfile: string;
}

export const CITY_PAGES: readonly CitySeo[] = [
  {
    slug: "mumbai",
    name: "Mumbai",
    state: "Maharashtra",
    trait: "trading houses, brokers and D2C brands",
    intro:
      "Mumbai runs on volume — brokerages, import–export houses, textile traders and a fast-growing D2C scene, all generating more ledger entries in a week than many businesses see in a quarter. That volume is exactly what an on-demand accountant is built for: you book the days the work actually takes, instead of carrying a full-time salary through the quiet weeks.",
    businessProfile:
      "Maharashtra is consistently among India's largest GST-collecting states, and Mumbai businesses feel it in filing discipline: monthly GSTR-1 and GSTR-3B cycles, e-invoice serial control, and banks that expect current books before extending working capital. A verified accountant who works to a published SOP keeps all three in order.",
  },
  {
    slug: "delhi",
    name: "Delhi",
    state: "Delhi",
    trait: "wholesale traders and distributors",
    intro:
      "Delhi's wholesale markets — from Chandni Chowk to Karol Bagh — move goods on thin margins where an unclaimed input credit or a late-fee notice eats the month's profit. BookYourAccountant's own branch office sits in Karol Bagh, and Delhi is one of the first metros the platform serves.",
    businessProfile:
      "Distribution businesses in Delhi typically juggle multiple bank accounts, e-way bills and a stack of purchase returns and rate-difference debit notes. The platform's bookkeeping SOP has explicit checks for exactly these: stock register discipline, goods movement against e-way bills, and purchase returns recorded with proper documents.",
  },
  {
    slug: "bengaluru",
    name: "Bengaluru",
    state: "Karnataka",
    trait: "startups, SaaS firms and service exporters",
    intro:
      "Bengaluru's startups and services firms rarely need a full-time accountant — they need clean monthly books, TDS handled section-wise, and investor-ready numbers on demand. Booking a verified accountant by the day fits that shape: a few days a month, with a live dashboard the founder can open before a board call.",
    businessProfile:
      "Service businesses have their own bookkeeping traps — unbilled revenue, GST on advances, TDS deducted by clients that must reconcile with 26AS/AIS. The platform's service-business SOP block covers each of these explicitly, so a Bengaluru engagement starts from a checklist written for exactly this economy.",
  },
  {
    slug: "hyderabad",
    name: "Hyderabad",
    state: "Telangana",
    trait: "pharma units, IT services firms and GCC vendors",
    intro:
      "Hyderabad pairs one of India's densest pharma and life-sciences manufacturing belts with a services economy built around HITEC City — IT firms, global capability centres and the vendors who supply them. Those are opposite bookkeeping profiles: batch-wise material consumption and job-work challans on one side, unbilled revenue and client-deducted TDS on the other. Booking a verified accountant by the day lets each side get exactly the days it needs.",
    businessProfile:
      "Hyderabad is one of the metros where the platform runs its own qualifying-exam centre (Banjara Hills), so accountants here are verified the same way as everywhere else — exam plus document checks, no city shortcut. On the work itself, the manufacturing SOP block keeps GRNs and job-work material movement documented for pharma units, while the service-business block reconciles client-deducted TDS against 26AS and AIS before a rupee is written off.",
  },
  {
    slug: "chennai",
    name: "Chennai",
    state: "Tamil Nadu",
    trait: "manufacturers and auto-component suppliers",
    intro:
      "Chennai's manufacturing belt — auto components, engineering, leather and pharma — carries the heaviest bookkeeping load of any business type: raw material consumption, GRNs, work-in-progress valuation and job-work challans on top of the usual filings. The pricing engine prices manufacturing engagements with an explicit effort loading for precisely this reason.",
    businessProfile:
      "The platform's manufacturing SOP block tracks stores issues against production reports, matches GRNs to supplier bills before purchases are booked, and keeps job-work material movement documented with ITC-04 discipline — the checks a Chennai factory's auditor will ask about first.",
  },
  {
    slug: "kolkata",
    name: "Kolkata",
    state: "West Bengal",
    trait: "family-run trading and distribution firms",
    intro:
      "Kolkata's business fabric is generational — trading and distribution firms where the books have often lived with one munim for decades. Moving to a verified accountant doesn't mean losing that continuity: you book the same professional recurringly, and every visit ends with a client walkthrough and sign-off on the portal.",
    businessProfile:
      "Older books usually mean backlog, and backlog is priced honestly here: the engine adds catch-up effort month-by-month for pending periods (bulk catch-up beyond three months is rated cheaper per month), so a Kolkata firm that is six months behind sees the real cost of getting current — once, upfront.",
  },
  {
    slug: "pune",
    name: "Pune",
    state: "Maharashtra",
    trait: "manufacturers, IT services firms and growing D2C brands",
    intro:
      "Pune mixes auto and engineering manufacturing with a deep IT-services bench and a growing D2C cluster — three very different bookkeeping profiles in one city. BookYourAccountant runs a branch office in Hadapsar (Amanora), and Pune accountants on the platform are verified through the same qualifying exam as everywhere else.",
    businessProfile:
      "Because the engagement is priced from a questionnaire — transaction volume, GST returns in scope, employee count for payroll — a Pune machine shop and a Pune SaaS startup get genuinely different quotes rather than one flat retainer. Both get the same live dashboard and monthly MIS.",
  },
];

// Fail the build, not the reader: every curated city must exist in the shared
// India dataset under its stated state.
for (const c of CITY_PAGES) {
  const cities = CITIES_BY_STATE[c.state];
  if (cities === undefined || !cities.includes(c.name)) {
    throw new Error(`SEO city "${c.name}" not found under state "${c.state}" in CITIES_BY_STATE`);
  }
}

export function getCity(slug: string): CitySeo | undefined {
  return CITY_PAGES.find((c) => c.slug === slug);
}
