import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "../../../components/Breadcrumbs";
import { JsonLd } from "../../../components/JsonLd";
import { fyLabel } from "../../../lib/format";
import { CITY_PAGES } from "../../../lib/seo/cities";
import { getServicePage, SEO_FY, SERVICE_PAGES } from "../../../lib/seo/services";
import { faqJsonLd, serviceJsonLd } from "../../../lib/structured-data";

interface Props {
  params: Promise<{ service: string }>;
}

export const dynamicParams = false;

export function generateStaticParams(): { service: string }[] {
  return SERVICE_PAGES.map((s) => ({ service: s.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { service } = await params;
  const page = getServicePage(service);
  if (page === undefined) notFound();
  const path = `/services/${page.slug}`;
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: { canonical: path },
    openGraph: { title: page.metaTitle, description: page.metaDescription, url: path },
  };
}

export default async function ServicePage({ params }: Props) {
  const { service } = await params;
  const page = getServicePage(service);
  if (page === undefined) notFound();

  const path = `/services/${page.slug}`;
  const faqs = [...page.faqs, page.priceFaq];
  const siblings = SERVICE_PAGES.filter((s) => s.slug !== page.slug);

  return (
    <section className="bg-[#f5f7fc]">
      <div className="mx-auto max-w-[1280px] px-5 py-20 sm:px-10">
        <JsonLd
          data={serviceJsonLd({
            name: page.catalogueName,
            description: page.metaDescription,
            path,
            fromRateRupees: page.fromRateRupees,
          })}
        />
        <JsonLd data={faqJsonLd(faqs)} />
        <Breadcrumbs
          crumbs={[
            { name: "Home", path: "/" },
            { name: "Services", path: "/services" },
            { name: page.catalogueName, path },
          ]}
        />

        <div className="max-w-3xl">
          <span className="text-xs font-extrabold uppercase tracking-widest text-gold">
            {page.catalogueName}
          </span>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl">
            {page.h1}
          </h1>
          <p className="mt-6 leading-relaxed text-ink-soft">{page.intro}</p>
          <p className="mt-4 leading-relaxed text-ink-soft">{page.detail}</p>
        </div>

        {/* Pricing signal — derived from the real pricing engine. */}
        <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <div className="rounded-2xl border border-gold bg-white p-8">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Indicative pricing
            </span>
            <p className="mt-2 font-display text-4xl font-bold text-ink">
              {page.fromRate}
              <span className="text-lg font-semibold text-ink-soft">/day</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">{page.priceLine}</p>
            <p className="mt-3 text-xs leading-relaxed text-ink-soft">
              Your exact quote is computed from a short questionnaire — scope, volumes, backlog and
              experience tier. Volume discounts up to 20%; every booking gets a GST invoice.
            </p>
            <Link
              href="/contact"
              className="mt-6 inline-block rounded-full bg-gold px-7 py-3.5 font-bold text-[#1a1206] transition-transform hover:-translate-y-0.5"
            >
              Get your exact quote →
            </Link>
          </div>

          <div className="rounded-2xl border border-line bg-white p-8">
            <h2 className="font-display text-xl font-bold text-ink">
              What the accountant works through
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              From the platform&apos;s published SOP — the same checklist the accountant is held to.
            </p>
            <ul className="mt-4 flex flex-col gap-3">
              {page.inclusions.map((task) => (
                <li key={task} className="flex gap-3 text-sm leading-relaxed text-ink">
                  <span className="mt-0.5 text-gold">✓</span>
                  {task}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Statutory due dates relevant to this service — from the shared calendar. */}
        <div className="mt-10 rounded-2xl border border-line bg-white p-8">
          <h2 className="font-display text-xl font-bold text-ink">
            Due dates this service keeps for you — {fyLabel(SEO_FY)}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            From the 23-obligation statutory compliance calendar.{" "}
            <Link href="/compliance-calendar" className="font-semibold text-gold hover:underline">
              See the full calendar →
            </Link>
          </p>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
                  <th className="py-2 pr-4">Obligation</th>
                  <th className="py-2 pr-4">Applies to</th>
                  <th className="py-2 pr-4">Frequency</th>
                  <th className="py-2">First due dates</th>
                </tr>
              </thead>
              <tbody>
                {page.obligations.map((o) => (
                  <tr key={o.name} className="border-b border-line/60 align-top">
                    <td className="py-3 pr-4 font-semibold text-ink">
                      {o.name}
                      <span className="mt-1 block text-xs font-normal text-ink-soft">{o.desc}</span>
                    </td>
                    <td className="py-3 pr-4 text-ink-soft">{o.appliesTo}</td>
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
        </div>

        {/* FAQ */}
        <div className="mt-10 rounded-2xl border border-line bg-white p-8">
          <h2 className="font-display text-xl font-bold text-ink">Frequently asked questions</h2>
          <div className="mt-4 flex flex-col gap-6">
            {faqs.map((f) => (
              <div key={f.q}>
                <h3 className="font-semibold text-ink">{f.q}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{f.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Internal links: cities for this service, then sibling services. */}
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-line bg-white p-8">
            <h2 className="font-display text-lg font-bold text-ink">
              {page.shortName} in your city
            </h2>
            <ul className="mt-4 flex flex-wrap gap-3">
              {CITY_PAGES.map((c) => (
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
            <h2 className="font-display text-lg font-bold text-ink">Other services</h2>
            <ul className="mt-4 flex flex-wrap gap-3">
              {siblings.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/services/${s.slug}`}
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
