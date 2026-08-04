import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "../../components/JsonLd";
import { MisViewer } from "../../components/MisViewer";
import { breadcrumbsJsonLd } from "../../lib/structured-data";

export const metadata: Metadata = {
  title: "Dashboards & MIS",
  description:
    "Live business dashboard and monthly MIS with every booking: overview, cash flow, P&L, GST compliance and expense analysis — always current, never stale.",
  alternates: { canonical: "/dashboards" },
  openGraph: {
    title: "Dashboards & MIS",
    description:
      "Live business dashboard and monthly MIS with every booking: overview, cash flow, P&L, GST compliance and expense analysis.",
    url: "/dashboards",
  },
};

export default function DashboardsPage() {
  return (
    <section className="bg-[#f5f7fc] py-24">
      <JsonLd
        data={breadcrumbsJsonLd([
          { name: "Home", path: "/" },
          { name: "Dashboards & MIS", path: "/dashboards" },
        ])}
      />
      <div className="mx-auto max-w-[1280px] px-5 sm:px-10">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <span className="text-xs font-extrabold uppercase tracking-widest text-gold">
            Dashboards & MIS reports
          </span>
          <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-ink sm:text-5xl">
            Five views you get with every booking
          </h1>
          <p className="mt-4 leading-relaxed text-ink-soft">
            Click through the views below — this is the live financial control you unlock the moment
            you book accounting services.
          </p>
        </div>

        <MisViewer />

        <div className="mt-12 text-center">
          <Link
            href="/contact"
            className="rounded-full bg-gold px-8 py-4 font-bold text-[#1a1206] transition-transform hover:-translate-y-0.5"
          >
            Book an accountant & get your dashboard →
          </Link>
        </div>
      </div>
    </section>
  );
}
