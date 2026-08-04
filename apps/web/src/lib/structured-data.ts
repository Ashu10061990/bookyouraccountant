import { absUrl, CONTACT, OFFICES, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./site";

/**
 * schema.org builders. Each returns a plain object for <JsonLd data={…} />.
 * Only real data goes in: no invented ratings, reviews or addresses.
 */

const CONTEXT = "https://schema.org";

export function organizationJsonLd(): Record<string, unknown> {
  return {
    "@context": CONTEXT,
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    email: CONTACT.email,
    telephone: CONTACT.phone,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: CONTACT.email,
      telephone: CONTACT.phone,
      areaServed: "IN",
      availableLanguage: ["en", "hi"],
    },
  };
}

/** WebSite — no SearchAction: the marketing site has no search. */
export function webSiteJsonLd(): Record<string, unknown> {
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    publisher: { "@id": `${SITE_URL}/#organization` },
    inLanguage: "en-IN",
  };
}

/** LocalBusiness for the head office — real address from the legacy site. */
export function localBusinessJsonLd(): Record<string, unknown> {
  const head = OFFICES.find((o) => o.head) ?? OFFICES[0];
  return {
    "@context": CONTEXT,
    "@type": "AccountingService",
    name: SITE_NAME,
    url: SITE_URL,
    email: CONTACT.email,
    telephone: CONTACT.phone,
    parentOrganization: { "@id": `${SITE_URL}/#organization` },
    address: {
      "@type": "PostalAddress",
      streetAddress: head.addr,
      addressLocality: head.city,
      addressRegion: head.region,
      postalCode: head.postalCode,
      addressCountry: "IN",
    },
    areaServed: "IN",
  };
}

export interface Crumb {
  name: string;
  /** Site-relative path, e.g. "/services/gst". */
  path: string;
}

export function breadcrumbsJsonLd(crumbs: readonly Crumb[]): Record<string, unknown> {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absUrl(c.path),
    })),
  };
}

export function faqJsonLd(faqs: readonly { q: string; a: string }[]): Record<string, unknown> {
  return {
    "@context": CONTEXT,
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function serviceJsonLd(input: {
  name: string;
  description: string;
  path: string;
  /** Indicative day-rate in whole rupees, derived from the pricing engine. */
  fromRateRupees: number;
  /** City name when the page targets one city; omitted → all of India. */
  city?: string;
}): Record<string, unknown> {
  return {
    "@context": CONTEXT,
    "@type": "Service",
    name: input.name,
    serviceType: input.name,
    description: input.description,
    url: absUrl(input.path),
    provider: { "@id": `${SITE_URL}/#organization` },
    areaServed:
      input.city === undefined
        ? { "@type": "Country", name: "India" }
        : { "@type": "City", name: input.city },
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      price: String(input.fromRateRupees),
      description:
        "Indicative starting day-rate for a verified accountant; the exact quote is computed from your requirements.",
    },
  };
}
