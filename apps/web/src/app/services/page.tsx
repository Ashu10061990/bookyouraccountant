import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { CITY_PAGES } from "../../lib/seo/cities";
import { SERVICE_PAGES } from "../../lib/seo/services";

export const metadata: Metadata = {
  title: "Accounting Services for Indian MSMEs",
  description:
    "Seven accounting services, one verified accountant: bookkeeping, GST, TDS and income tax, payroll, statements, advisory and audit support — priced per day.",
  alternates: { canonical: "/services" },
  openGraph: {
    title: "Accounting Services for Indian MSMEs",
    description:
      "Bookkeeping, GST, TDS, payroll, statements, advisory and audit support — CA-verified accountants, priced per day.",
    url: "/services",
  },
};

export default function ServicesIndexPage() {
  return (
    <section className="bg-[#f5f7fc]">
      <div className="mx-auto max-w-[1280px] px-5 py-20 sm:px-10">
        <Breadcrumbs
          crumbs={[
            { name: "Home", path: "/" },
            { name: "Services", path: "/services" },
          ]}
        />
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <span className="text-xs font-extrabold uppercase tracking-widest text-gold">
            Services
          </span>
          <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-ink sm:text-5xl">
            Seven services, one verified accountant
          </h1>
          <p className="mt-4 leading-relaxed text-ink-soft">
            Every service is delivered to a published SOP by a CA-verified accountant, priced per
            accountant-day by the same engine that prices every assignment — with a GST-compliant
            invoice and a live dashboard on every engagement.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICE_PAGES.map((s) => (
            <Link
              key={s.slug}
              href={`/services/${s.slug}`}
              className="group rounded-2xl border border-line bg-white p-7 transition-all hover:-translate-y-1.5 hover:border-gold hover:shadow-xl"
            >
              <h2 className="font-display text-xl font-bold text-ink">{s.catalogueName}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.metaDescription}</p>
              <p className="mt-4 text-sm font-semibold text-gold">
                From {s.fromRate}/day <span className="group-hover:underline">— see details →</span>
              </p>
            </Link>
          ))}
        </div>

        <div className="mt-14 rounded-2xl border border-line bg-white p-8">
          <h2 className="font-display text-xl font-bold text-ink">Available across India</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Verified accountants work online across India, with on-site visits available. Explore
            services in the major metros:
          </p>
          <ul className="mt-4 flex flex-wrap gap-3">
            {CITY_PAGES.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/services/bookkeeping/${c.slug}`}
                  className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-gold hover:text-gold"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-ink-soft">
            Planning the year?{" "}
            <Link href="/compliance-calendar" className="font-semibold text-gold hover:underline">
              See the full statutory compliance calendar →
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
