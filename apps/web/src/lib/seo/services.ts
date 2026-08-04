import { complianceFy, computeQuote, OBLIGATIONS, SERVICES, SOP_COUNTS } from "@bya/shared";
import type { Quote } from "@bya/shared";
import { formatIsoDate, formatPaise } from "../format";
import type { ServiceCopy } from "./service-content";
import { SERVICE_COPY } from "./service-content";

/**
 * Assembles the service landing-page model: hand-written copy from
 * `service-content.ts` joined with the shared catalogue name, an indicative
 * quote from the real pricing engine, the SOP inclusions and the relevant
 * statutory obligations. Everything numeric or statutory is derived — never
 * typed into page files.
 */

/** The financial year rendered across the SEO pages, fixed at build time. */
export const SEO_FY = complianceFy(new Date().toISOString().slice(0, 10));

export interface ObligationView {
  name: string;
  appliesTo: string;
  desc: string;
  /** "Monthly" | "Quarterly" | "Half-yearly" | "Annual" — from occurrence count. */
  cadence: string;
  /** First formatted due dates of the FY (up to three). */
  sampleDates: readonly string[];
  /** Total occurrences in the FY. */
  total: number;
}

export interface ServicePage extends ServiceCopy {
  /** Catalogue name from the shared 7-service contract. */
  catalogueName: string;
  quote: Quote;
  /** "₹1,200" — indicative day rate from the engine. */
  fromRate: string;
  fromRateRupees: number;
  /** One generated sentence describing the indicative engagement size. */
  priceLine: string;
  /** Auto-generated pricing FAQ (kept with the hand-written ones). */
  priceFaq: { q: string; a: string };
  inclusions: readonly string[];
  obligations: readonly ObligationView[];
}

function cadenceLabel(count: number): string {
  if (count >= 12) return "Monthly";
  if (count >= 4) return "Quarterly";
  if (count === 2) return "Half-yearly";
  return "Annual";
}

function obligationViews(keywords: readonly string[]): ObligationView[] {
  return OBLIGATIONS.filter((o) => keywords.some((k) => o.name.includes(k))).map((o) => {
    const occurrences = o.occ(SEO_FY);
    return {
      name: o.name,
      appliesTo: o.appliesTo,
      desc: o.desc,
      cadence: cadenceLabel(occurrences.length),
      sampleDates: occurrences.slice(0, 3).map((x) => formatIsoDate(x.dateIso)),
      total: occurrences.length,
    };
  });
}

function buildServicePage(copy: ServiceCopy): ServicePage {
  const catalogue = SERVICES.find((s) => s.id === copy.slug);
  if (catalogue === undefined) {
    throw new Error(`SEO service "${copy.slug}" is not in the shared SERVICES catalogue`);
  }

  const quote = computeQuote({ serviceIds: [copy.slug], frequency: copy.frequency });
  if (quote === null) {
    throw new Error(`computeQuote returned null for service "${copy.slug}"`);
  }

  const inclusions = SOP_COUNTS.perService[copy.slug];
  if (inclusions === undefined) {
    throw new Error(`No SOP entry for service "${copy.slug}"`);
  }

  const fromRate = formatPaise(quote.ratePaise);
  const priceLine =
    copy.frequency === "monthly"
      ? `A typical standalone engagement is ${String(quote.monthlyDays ?? quote.days)} accountant-day${(quote.monthlyDays ?? quote.days) === 1 ? "" : "s"} a month — ${formatPaise(quote.monthlyTotalPaise ?? quote.totalPaise)}/month at the standard tier.`
      : `A typical standalone engagement is ${String(quote.days)} accountant-days — ${formatPaise(quote.totalPaise)} at the standard tier.`;

  const priceFaq = {
    q: `How much does ${copy.shortName.toLowerCase()} cost on BookYourAccountant?`,
    a:
      `Prices come from the same engine that prices every assignment on the platform. ` +
      `${copy.shortName} starts from ${fromRate} per accountant-day at the standard experience tier. ${priceLine} ` +
      `Senior (3+ years) and expert (7+ years) accountants carry a rate premium, on-site visits add a flat ₹300/day, ` +
      `and volume discounts of up to 20% apply as the engagement grows. Every booking gets a GST-compliant invoice.`,
  };

  return {
    ...copy,
    catalogueName: catalogue.name,
    quote,
    fromRate,
    fromRateRupees: Math.round(quote.ratePaise / 100),
    priceLine,
    priceFaq,
    inclusions,
    obligations: obligationViews(copy.complianceKeywords),
  };
}

export const SERVICE_PAGES: readonly ServicePage[] = SERVICE_COPY.map(buildServicePage);

export function getServicePage(slug: string): ServicePage | undefined {
  return SERVICE_PAGES.find((s) => s.slug === slug);
}
