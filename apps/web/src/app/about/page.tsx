import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "../../components/JsonLd";
import { breadcrumbsJsonLd } from "../../lib/structured-data";

export const metadata: Metadata = {
  title: "How BookYourAccountant works",
  description:
    "Two simple journeys — businesses register and book verified accountants; accountants clear a qualifying exam and get matched. See the full process.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "How BookYourAccountant works",
    description:
      "Businesses register and book; accountants clear a qualifying exam and get matched. See the full process.",
    url: "/about",
  },
};

const BIZ = [
  {
    icon: "🏢",
    t: "Business registers",
    d: "Sign up free and add your basics — GSTIN, business type, and what work you need.",
  },
  {
    icon: "🔎",
    t: "Find & book",
    d: "Browse CA-verified accountants by rating and day-rate, and book the days you need.",
  },
];
const ACC = [
  {
    icon: "🎓",
    t: "Accountant registers",
    d: "A CA signs up and clears a qualifying exam, so only verified pros appear.",
  },
  {
    icon: "✅",
    t: "Gets matched",
    d: "Verified accountants are matched to the businesses that need their skills.",
  },
];
const JOINT = [
  {
    icon: "🤝",
    t: "They connect",
    d: "Business and accountant are paired for the booked work — on your terms.",
  },
  {
    icon: "🧾",
    t: "Work gets done",
    d: "Books, GST and tax handled — with a proper GST invoice for every visit.",
  },
  { icon: "📊", t: "Live dashboard", d: "Your numbers update on one screen as the work happens." },
  {
    icon: "📈",
    t: "Monthly MIS",
    d: "A simple monthly report shows where the business stands and what to do next.",
  },
];

function Step({ icon, t, d, accent }: { icon: string; t: string; d: string; accent: string }) {
  return (
    <div className="flex-1 rounded-2xl border border-line bg-white p-6">
      <span className={`grid h-12 w-12 place-items-center rounded-xl text-2xl ${accent}`}>
        {icon}
      </span>
      <h3 className="mt-4 font-display text-lg font-bold text-ink">{t}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{d}</p>
    </div>
  );
}

export default function AboutPage() {
  return (
    <section className="bg-[#f5f7fc]">
      <JsonLd
        data={breadcrumbsJsonLd([
          { name: "Home", path: "/" },
          { name: "About BYA", path: "/about" },
        ])}
      />
      <div className="mx-auto max-w-[1280px] px-5 py-24 sm:px-10">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <span className="text-xs font-extrabold uppercase tracking-widest text-gold">
            About BYA
          </span>
          <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-ink sm:text-5xl">
            How BookYourAccountant works
          </h1>
          <p className="mt-4 leading-relaxed text-ink-soft">
            Two simple journeys — one for businesses, one for accountants — that meet on the
            platform. Here is exactly what happens, in order.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <span className="mb-4 inline-block rounded-full bg-gold px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-wide text-navy">
              For businesses
            </span>
            <div className="flex flex-col gap-4 sm:flex-row">
              {BIZ.map((s) => (
                <Step key={s.t} {...s} accent="bg-gold/15 text-gold" />
              ))}
            </div>
          </div>
          <div>
            <span className="mb-4 inline-block rounded-full bg-navy2 px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-wide text-white">
              For accountants
            </span>
            <div className="flex flex-col gap-4 sm:flex-row">
              {ACC.map((s) => (
                <Step key={s.t} {...s} accent="bg-navy2/15 text-navy2" />
              ))}
            </div>
          </div>
        </div>

        <p className="my-10 text-center text-sm font-semibold text-ink-soft">
          They come together on the platform ↓
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {JOINT.map((s) => (
            <Step key={s.t} {...s} accent="bg-gold/15 text-gold" />
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/contact"
            className="rounded-full bg-gold px-8 py-4 font-bold text-[#1a1206] transition-transform hover:-translate-y-0.5"
          >
            Find an accountant →
          </Link>
        </div>
      </div>
    </section>
  );
}
