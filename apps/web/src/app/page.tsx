import { FAQS, SAMPLE_ACCOUNTANTS, TESTIMONIALS } from "@bya/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { FaqAccordion } from "../components/FaqAccordion";
import { JsonLd } from "../components/JsonLd";
import { SavingsCalculator } from "../components/SavingsCalculator";
import { faqJsonLd } from "../lib/structured-data";

export const metadata: Metadata = {
  title: "CA-verified accountants on demand for India's MSMEs",
  description:
    "Book verified accountants by the day. Live dashboard, monthly MIS, GST invoices. Pay only for the days you need — no retainer, no full-time salary.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "CA-verified accountants on demand for India's MSMEs",
    description:
      "Book verified accountants by the day. Live dashboard, monthly MIS, GST invoices. Pay only for the days you need.",
    url: "/",
  },
};

const WAYS_IN = [
  {
    icon: "🔗",
    title: "About BYA",
    href: "/about",
    copy: "See exactly how it works — the journey for businesses and accountants, start to finish.",
  },
  {
    icon: "★",
    title: "Why BYA",
    href: "/why",
    copy: "The real business benefits — winning tenders, avoiding cash crunches, saving cost.",
  },
  {
    icon: "📊",
    title: "Dashboards & MIS",
    href: "/dashboards",
    copy: "The live dashboards and monthly MIS reports you get with every booking.",
  },
];

export default function HomePage() {
  const samples = SAMPLE_ACCOUNTANTS as readonly {
    initials: string;
    city: string;
    exp: string;
    rating: number;
    rate: number;
  }[];
  const testimonials = TESTIMONIALS as readonly { quote: string; who: string; where: string }[];

  return (
    <>
      {/* FAQPage JSON-LD is fed by the same shared FAQS the accordion renders,
          so the structured data can never drift from the visible content. */}
      <JsonLd data={faqJsonLd(FAQS)} />
      {/* Hero */}
      <section className="hero-bg hero-glow relative text-white">
        <div className="relative mx-auto grid max-w-[1280px] items-center gap-16 px-5 py-24 sm:px-10 lg:grid-cols-[1.05fr_1fr] lg:py-28">
          <div className="reveal">
            <span className="mb-7 inline-block rounded-full border border-gold/30 bg-gold/[0.14] px-4 py-2 text-xs font-bold uppercase tracking-widest text-gold">
              ✦ CA-verified · Built in India
            </span>
            <h1 className="font-display text-[clamp(44px,6vw,76px)] font-bold leading-[1.02] tracking-tight">
              You don&apos;t need a full-time accountant.
              <br />
              You need <span className="text-gold">10 good days</span> a month.
            </h1>
            <p className="mt-7 max-w-[30em] text-xl leading-relaxed text-white/70">
              A full-time hire costs about{" "}
              <strong className="font-semibold text-white">₹6,37,200 a year</strong> once you load
              in EPF, ESI, gratuity and overheads — for work that fits in roughly 10 days a month.
              BYA connects you with{" "}
              <strong className="font-semibold text-white">
                CA-verified accountants on demand
              </strong>
              , so you pay only for the days you actually need.
            </p>
            <div className="mt-9 flex flex-wrap gap-3.5">
              <Link
                href="/contact"
                className="rounded-full bg-gold px-7 py-3.5 font-bold text-[#1a1206] shadow-lg shadow-gold/40 transition-transform hover:-translate-y-0.5"
              >
                Find an accountant →
              </Link>
              <Link
                href="/about"
                className="rounded-full border-[1.5px] border-white/35 px-7 py-3.5 font-bold text-white transition-colors hover:border-gold hover:text-gold"
              >
                How it works
              </Link>
            </div>
            <ul className="mt-7 flex flex-wrap gap-7 text-sm font-semibold text-gold">
              <li>✓ No retainer</li>
              <li>✓ No contract</li>
              <li>✓ Pay by day</li>
            </ul>
          </div>

          <SavingsCalculator />
        </div>
      </section>

      {/* Verified accountants */}
      <section className="mx-auto max-w-[1280px] px-5 py-20 sm:px-10">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-extrabold uppercase tracking-widest text-gold">
              ✓ Verified accountants
            </span>
            <h2 className="font-display text-3xl font-bold uppercase tracking-tight text-ink sm:text-4xl">
              Meet the professionals
            </h2>
          </div>
          <Link
            href="/contact"
            className="rounded-full bg-gold px-6 py-3 font-bold text-[#1a1206] transition-transform hover:-translate-y-0.5"
          >
            Book one →
          </Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {samples.map((p) => (
            <div key={p.initials} className="rounded-2xl border border-line bg-white p-6">
              <div className="flex items-center gap-4">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-navy font-display text-lg font-bold text-white">
                  {p.initials}
                </span>
                <div>
                  <strong className="block font-display text-lg text-ink">{p.city}</strong>
                  <span className="text-sm text-ink-soft">{p.exp} experience</span>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="font-semibold text-gold">★ {p.rating.toFixed(1)}</span>
                <span className="text-ink-soft">from ₹{p.rate}/day</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Three ways in */}
      <section className="mx-auto max-w-[1280px] px-5 py-20 sm:px-10">
        <div className="mb-12 text-center">
          <span className="text-xs font-extrabold uppercase tracking-widest text-gold">
            Explore BYA
          </span>
          <h2 className="font-display text-3xl font-bold uppercase tracking-tight text-ink sm:text-4xl">
            Three ways in
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {WAYS_IN.map((w) => (
            <Link
              key={w.href}
              href={w.href}
              className="group rounded-2xl border border-line bg-white p-8 transition-all hover:-translate-y-1.5 hover:border-gold hover:shadow-xl"
            >
              <span className="text-3xl">{w.icon}</span>
              <h3 className="mt-4 font-display text-xl font-bold text-ink">{w.title}</h3>
              <p className="mt-2 leading-relaxed text-ink-soft">{w.copy}</p>
              <span className="mt-4 inline-block font-semibold text-gold group-hover:underline">
                Explore →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="mx-auto max-w-[1280px] px-5 py-20 sm:px-10">
        <div className="mb-12 text-center">
          <span className="text-xs font-extrabold uppercase tracking-widest text-gold">
            What clients say
          </span>
          <h2 className="font-display text-3xl font-bold uppercase tracking-tight text-ink sm:text-4xl">
            Businesses that switched
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((t) => (
            <figure key={t.who} className="rounded-2xl border border-line bg-paper p-8">
              <blockquote className="text-lg leading-relaxed text-ink">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-4 text-sm font-semibold text-ink-soft">
                — {t.who}, {t.where}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-[#f5f7fc] py-20">
        <div className="mx-auto max-w-[1280px] px-5 sm:px-10">
          <div className="mb-12 text-center">
            <span className="text-xs font-extrabold uppercase tracking-widest text-gold">FAQ</span>
            <h2 className="font-display text-3xl font-bold uppercase tracking-tight text-ink sm:text-4xl">
              Questions, answered
            </h2>
          </div>
          <FaqAccordion />
        </div>
      </section>
    </>
  );
}
