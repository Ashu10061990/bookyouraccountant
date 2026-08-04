import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "../../../../components/Breadcrumbs";
import { JsonLd } from "../../../../components/JsonLd";
import { fyLabel } from "../../../../lib/format";
import { CITY_PAGES, getCity } from "../../../../lib/seo/cities";
import { getServicePage, SEO_FY, SERVICE_PAGES } from "../../../../lib/seo/services";
import { faqJsonLd, serviceJsonLd } from "../../../../lib/structured-data";
import type { CitySeo } from "../../../../lib/seo/cities";
import type { ServicePage as ServicePageModel } from "../../../../lib/seo/services";

/**
 * City-specific FAQs, composed from the same engine-derived facts as the rest
 * of the page (day rate, on-site add-on, verification process) so the answers
 * differ by city and by service without inventing anything.
 */
function cityFaqs(page: ServicePageModel, cityPage: CitySeo): readonly { q: string; a: string }[] {
  return [
    {
      q: `How much does ${page.shortName.toLowerCase()} cost in ${cityPage.name}?`,
      a:
        `${page.shortName} starts from ${page.fromRate} per accountant-day in ${cityPage.name} — the same ` +
        `engine-computed rate as everywhere in India; what changes your quote is scope, transaction volume and ` +
        `backlog, not the pin code. ${page.priceLine} On-site visits in ${cityPage.name} add a flat ₹300/day, ` +
        `volume discounts run up to 20%, and every booking gets a GST-compliant invoice.`,
    },
    {
      q: `Can the accountant visit my office in ${cityPage.name}?`,
      a:
        `Yes. Engagements run online by default with a live dashboard, and on-site visits anywhere in ` +
        `${cityPage.name}, ${cityPage.state} are available as a flat ₹300/day add-on. Many of the city's ` +
        `${cityPage.trait} choose a mix — on-site for the setup visit, online for the recurring cycle.`,
    },
    {
      q: `How are accountants serving ${cityPage.name} verified?`,
      a:
        `Every accountant on the platform clears the same qualifying exam and document verification before ` +
        `taking a single assignment — there is no city-specific shortcut. Before booking ${page.shortName.toLowerCase()} ` +
        `in ${cityPage.name} you see the accountant's verified profile and experience tier, and every visit ends ` +
        `with a sign-off recorded on the portal.`,
    },
  ];
}

interface Props {
  params: Promise<{ service: string; city: string }>;
}

export const dynamicParams = false;

export function generateStaticParams(): { service: string; city: string }[] {
  return SERVICE_PAGES.flatMap((s) => CITY_PAGES.map((c) => ({ service: s.slug, city: c.slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { service, city } = await params;
  const page = getServicePage(service);
  const cityPage = getCity(city);
  if (page === undefined || cityPage === undefined) notFound();
  const path = `/services/${page.slug}/${cityPage.slug}`;
  // Kept deliberately short: with the "| BookYourAccountant" template suffix
  // the longest combination stays under 60 characters.
  const title = `${page.shortName} in ${cityPage.name}`;
  // Template sized so every service × city combination lands at 140–160 chars.
  const description = `${page.shortName} in ${cityPage.name} from ${page.fromRate}/day — CA-verified accountants booked by the day, with live dashboard, MIS and a GST invoice for every engagement.`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path },
  };
}

export default async function ServiceCityPage({ params }: Props) {
  const { service, city } = await params;
  const page = getServicePage(service);
  const cityPage = getCity(city);
  if (page === undefined || cityPage === undefined) notFound();

  const path = `/services/${page.slug}/${cityPage.slug}`;
  const otherCities = CITY_PAGES.filter((c) => c.slug !== cityPage.slug);
  const otherServices = SERVICE_PAGES.filter((s) => s.slug !== page.slug);
  const faqs = cityFaqs(page, cityPage);

  return (
    <section className="bg-[#f5f7fc]">
      <div className="mx-auto max-w-[1280px] px-5 py-20 sm:px-10">
        <JsonLd
          data={serviceJsonLd({
            name: `${page.catalogueName} — ${cityPage.name}`,
            description: `${page.shortName} for businesses in ${cityPage.name}, ${cityPage.state}, delivered by CA-verified accountants booked by the day.`,
            path,
            fromRateRupees: page.fromRateRupees,
            city: cityPage.name,
          })}
        />
        <JsonLd data={faqJsonLd(faqs)} />
        <Breadcrumbs
          crumbs={[
            { name: "Home", path: "/" },
            { name: "Services", path: "/services" },
            { name: page.catalogueName, path: `/services/${page.slug}` },
            { name: cityPage.name, path },
          ]}
        />

        <div className="max-w-3xl">
          <span className="text-xs font-extrabold uppercase tracking-widest text-gold">
            {cityPage.name}, {cityPage.state}
          </span>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl">
            {page.shortName} in {cityPage.name}
          </h1>
          <p className="mt-6 leading-relaxed text-ink-soft">{cityPage.intro}</p>
          <p className="mt-4 leading-relaxed text-ink-soft">{page.cityAngle(cityPage)}</p>
          <p className="mt-4 leading-relaxed text-ink-soft">{cityPage.businessProfile}</p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <div className="rounded-2xl border border-gold bg-white p-8">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Indicative pricing in {cityPage.name}
            </span>
            <p className="mt-2 font-display text-4xl font-bold text-ink">
              {page.fromRate}
              <span className="text-lg font-semibold text-ink-soft">/day</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">{page.priceLine}</p>
            <p className="mt-3 text-xs leading-relaxed text-ink-soft">
              The same engine prices every city — what changes your quote is scope, volume and
              backlog, not the pin code. On-site visits in {cityPage.name} add a flat ₹300/day.
            </p>
            <Link
              href="/contact"
              className="mt-6 inline-block rounded-full bg-gold px-7 py-3.5 font-bold text-[#1a1206] transition-transform hover:-translate-y-0.5"
            >
              Book in {cityPage.name} →
            </Link>
          </div>

          <div className="rounded-2xl border border-line bg-white p-8">
            <h2 className="font-display text-xl font-bold text-ink">
              How the work runs — the {page.shortName.toLowerCase()} SOP
            </h2>
            <ul className="mt-4 flex flex-col gap-3">
              {page.inclusions.map((task) => (
                <li key={task} className="flex gap-3 text-sm leading-relaxed text-ink">
                  <span className="mt-0.5 text-gold">✓</span>
                  {task}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm leading-relaxed text-ink-soft">
              Every engagement — in {cityPage.name} or anywhere in India — ends with your dashboard
              updated and a plain-language MIS, and every booking generates a GST-compliant invoice.
            </p>
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-line bg-white p-8">
          <h2 className="font-display text-xl font-bold text-ink">
            {page.shortName} due dates for {cityPage.name} businesses — {fyLabel(SEO_FY)}
          </h2>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
                  <th className="py-2 pr-4">Obligation</th>
                  <th className="py-2 pr-4">Frequency</th>
                  <th className="py-2">First due dates</th>
                </tr>
              </thead>
              <tbody>
                {page.obligations.map((o) => (
                  <tr key={o.name} className="border-b border-line/60 align-top">
                    <td className="py-3 pr-4 font-semibold text-ink">
                      {o.name}
                      <span className="mt-1 block text-xs font-normal text-ink-soft">
                        {o.appliesTo}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-ink-soft">{o.cadence}</td>
                    <td className="py-3 text-ink-soft">
                      {o.sampleDates.join(", ")}
                      {o.total > o.sampleDates.length ? ", …" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-ink-soft">
            The full 23-obligation calendar, month by month:{" "}
            <Link href="/compliance-calendar" className="font-semibold text-gold hover:underline">
              statutory compliance calendar →
            </Link>
          </p>
        </div>

        {/* City FAQ — rendered content matches the FAQPage JSON-LD above. */}
        <div className="mt-10 rounded-2xl border border-line bg-white p-8">
          <h2 className="font-display text-xl font-bold text-ink">
            {page.shortName} in {cityPage.name} — common questions
          </h2>
          <div className="mt-4 flex flex-col gap-6">
            {faqs.map((f) => (
              <div key={f.q}>
                <h3 className="font-semibold text-ink">{f.q}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{f.a}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-white p-8">
            <h2 className="font-display text-lg font-bold text-ink">
              {page.shortName} in other cities
            </h2>
            <ul className="mt-4 flex flex-wrap gap-3">
              {otherCities.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/services/${page.slug}/${c.slug}`}
                    className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-gold hover:text-gold"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-line bg-white p-8">
            <h2 className="font-display text-lg font-bold text-ink">
              Other services in {cityPage.name}
            </h2>
            <ul className="mt-4 flex flex-wrap gap-3">
              {otherServices.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/services/${s.slug}/${cityPage.slug}`}
                    className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-gold hover:text-gold"
                  >
                    {s.shortName}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
