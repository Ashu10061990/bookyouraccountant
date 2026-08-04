/**
 * Single source of truth for site-wide SEO constants.
 *
 * Every absolute URL on the site derives from SITE_URL — nothing else may
 * hardcode the domain. Override per environment with NEXT_PUBLIC_SITE_URL
 * (e.g. a staging deploy), falling back to the production domain.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bookyouraccountant.com";

export const SITE_NAME = "BookYourAccountant";

export const SITE_DESCRIPTION =
  "Book CA-verified accountants by the day for bookkeeping, GST, TDS, payroll and more. " +
  "Live dashboard, monthly MIS, GST invoices. Pay only for the days you need.";

export const SITE_LOCALE = "en_IN";

/**
 * Social profile URLs for Organization `sameAs` — placeholder, deliberately
 * empty until the real profiles are registered. Structured data omits `sameAs`
 * while this is empty; never invent handles.
 */
export const SOCIAL_PROFILE_URLS: readonly string[] = [];

/** Public contact details — verbatim from the legacy marketing site. */
export const CONTACT = {
  email: "Business@keiritech.com",
  phone: "+91-8954841762",
} as const;

/**
 * Physical offices — verbatim from the legacy marketing site's contact page.
 * The head office feeds the LocalBusiness structured data; never fabricate or
 * "tidy" these addresses.
 */
export const OFFICES = [
  {
    head: true,
    label: "Head Office",
    city: "Greater Noida",
    region: "Uttar Pradesh",
    postalCode: "201308",
    addr: "320/TF, C-1, Alpha-1 Krishna Apra Plaza, HDFC Bank, Greater Noida, Gautam Budh Nagar – 201308",
  },
  {
    head: false,
    label: "Branch Office",
    city: "Pune",
    region: "Maharashtra",
    postalCode: "411028",
    addr: "1002, Amanora Gold Tower, Hadapsar, Pune, Maharashtra – 411028",
  },
  {
    head: false,
    label: "Branch Office",
    city: "New Delhi",
    region: "Delhi",
    postalCode: "110005",
    addr: "17A/44, W.E.A. Off Gurudwara Road, Karol Bagh, New Delhi – 110005, India",
  },
  {
    head: false,
    label: "Branch Office",
    city: "Agra",
    region: "Uttar Pradesh",
    postalCode: "282003",
    addr: "520, 5th Floor, Corporate Park, Sanjay Palace, Civil Lines, Agra, Uttar Pradesh – 282003",
  },
] as const;

/** Absolute URL for a site path ("/services/gst" → "https://…/services/gst"). */
export function absUrl(path: string): string {
  return path === "/" ? SITE_URL : `${SITE_URL}${path}`;
}
