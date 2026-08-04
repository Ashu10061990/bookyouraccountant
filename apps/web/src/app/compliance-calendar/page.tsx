import { buildComplianceCalendar, OBLIGATIONS } from "@bya/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "../../components/Breadcrumbs";
import { JsonLd } from "../../components/JsonLd";
import { formatIsoDate, fyLabel } from "../../lib/format";
import { SEO_FY, SERVICE_PAGES } from "../../lib/seo/services";
import { faqJsonLd } from "../../lib/structured-data";

const FY_LABEL = fyLabel(SEO_FY);

export const metadata: Metadata = {
  title: `Compliance Calendar ${FY_LABEL} — India`,
  description: `Every statutory due date for ${FY_LABEL} in one place: GST returns, TDS deposits, advance tax, EPF/ESI, ITRs and ROC filings — ${String(OBLIGATIONS.length)} obligations, month by month.`,
  alternates: { canonical: "/compliance-calendar" },
  openGraph: {
    title: `Statutory Compliance Calendar ${FY_LABEL}`,
    description: `All ${String(OBLIGATIONS.length)} statutory obligations for ${FY_LABEL}, month by month — GST, TDS, advance tax, payroll and ROC due dates.`,
    url: "/compliance-calendar",
  },
};

const CALENDAR_FAQS = [
  {
    q: `Which financial year does this calendar cover?`,
    a: `${FY_LABEL} — April ${String(SEO_FY)} to March ${String(SEO_FY + 1)}. The calendar covers ${String(OBLIGATIONS.length)} statutory obligations: monthly filings like GSTR-1, GSTR-3B, TDS deposits and EPF/ESI; quarterly items like advance tax and TDS statements; and annual filings including ITRs, tax audit, GSTR-9 and the ROC forms AOC-4 and MGT-7.`,
  },
  {
    q: "What happens if a due date is extended by notification?",
    a: "Government notifications sometimes extend individual due dates. On the BookYourAccountant platform, notified extensions are applied on top of this base calendar, so the dashboard always shows the effective date with a note about the extension.",
  },
  {
    q: "Do all of these dates apply to my business?",
    a: "No — each obligation lists who it applies to. A GST-registered monthly filer, a QRMP filer and a composition dealer see different GST rows; EPF applies from 20 employees and ESI from 10; ROC forms apply to companies. A verified accountant scopes exactly which rows are yours.",
  },
];

interface MonthGroup {
  key: string;
  label: string;
  entries: {
    dateIso: string;
    name: string;
    period: string;
    appliesTo: string;
  }[];
}

function monthGroups(): MonthGroup[] {
  const entries = buildComplianceCalendar(SEO_FY);
  const groups = new Map<string, MonthGroup>();
  for (const e of entries) {
    const key = e.dateIso.slice(0, 7);
    let group = groups.get(key);
    if (group === undefined) {
      // "2026-04" → "April 2026" via the shared date formatter on day 1.
      const label = formatIsoDate(`${key}-01`).replace(/^1 /, "");
      group = { key, label, entries: [] };
      groups.set(key, group);
    }
    group.entries.push({
      dateIso: e.dateIso,
      name: e.name,
      period: e.period,
      appliesTo: e.appliesTo,
    });
  }
  // buildComplianceCalendar sorts by date, and Map preserves insertion order.
  return [...groups.values()];
}

export default function ComplianceCalendarPage() {
  const groups = monthGroups();

  return (
    <section className="bg-[#f5f7fc]">
      <div className="mx-auto max-w-[1280px] px-5 py-20 sm:px-10">
        <JsonLd data={faqJsonLd(CALENDAR_FAQS)} />
        <Breadcrumbs
          crumbs={[
            { name: "Home", path: "/" },
            { name: "Compliance Calendar", path: "/compliance-calendar" },
          ]}
        />

        <div className="mx-auto mb-12 max-w-3xl text-center">
          <span className="text-xs font-extrabold uppercase tracking-widest text-gold">
            {FY_LABEL}
          </span>
          <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-ink sm:text-5xl">
            Statutory compliance calendar
          </h1>
          <p className="mt-4 leading-relaxed text-ink-soft">
            All {OBLIGATIONS.length} statutory obligations for {FY_LABEL}, month by month — GST
            returns, TDS deposits and statements, advance tax, EPF/ESI, income-tax returns and ROC
            filings. This is the same calendar that drives due-date tracking on every
            BookYourAccountant dashboard.
          </p>
        </div>

        <div className="flex flex-col gap-8">
          {groups.map((g) => (
            <div key={g.key} className="rounded-2xl border border-line bg-white p-6 sm:p-8">
              <h2 className="font-display text-2xl font-bold text-ink">{g.label}</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-soft">
                      <th className="w-36 py-2 pr-4">Due date</th>
                      <th className="py-2 pr-4">Obligation</th>
                      <th className="py-2">Applies to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.entries.map((e) => (
                      <tr
                        key={`${e.dateIso}-${e.name}-${e.period}`}
                        className="border-b border-line/60 align-top"
                      >
                        <td className="py-3 pr-4 font-semibold text-ink">
                          {formatIsoDate(e.dateIso)}
                        </td>
                        <td className="py-3 pr-4">
                          <span className="font-semibold text-ink">{e.name}</span>
                          <span className="mt-0.5 block text-xs text-ink-soft">{e.period}</span>
                        </td>
                        <td className="py-3 text-ink-soft">{e.appliesTo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-line bg-white p-8">
          <h2 className="font-display text-xl font-bold text-ink">Frequently asked questions</h2>
          <div className="mt-4 flex flex-col gap-6">
            {CALENDAR_FAQS.map((f) => (
              <div key={f.q}>
                <h3 className="font-semibold text-ink">{f.q}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{f.a}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 rounded-2xl border border-gold bg-white p-8 text-center">
          <h2 className="font-display text-2xl font-bold text-ink">Never chase a due date again</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            A verified accountant tracks every date on this calendar that applies to your business —
            with reminders before each, and the filing done on time.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {SERVICE_PAGES.map((s) => (
              <Link
                key={s.slug}
                href={`/services/${s.slug}`}
                className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-gold hover:text-gold"
              >
                {s.shortName}
              </Link>
            ))}
          </div>
          <Link
            href="/contact"
            className="mt-8 inline-block rounded-full bg-gold px-8 py-4 font-bold text-[#1a1206] transition-transform hover:-translate-y-0.5"
          >
            Book an accountant →
          </Link>
        </div>
      </div>
    </section>
  );
}
