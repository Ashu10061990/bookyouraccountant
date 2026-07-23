import { BENEFIT_GROUPS } from "@bya/shared";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Why BYA — Business benefits of live financial tracking",
  description:
    "Win tenders, prevent cash crunches, cut costs and stay compliant — 12 concrete ways a live dashboard and monthly MIS grow your business.",
  alternates: { canonical: "/why" },
};

export default function WhyPage() {
  const groups = BENEFIT_GROUPS as readonly {
    theme: string;
    ic: string;
    items: readonly { t: string; d: string }[];
  }[];

  return (
    <section className="mx-auto max-w-[1280px] px-5 py-24 sm:px-10">
      <div className="mx-auto mb-14 max-w-3xl text-center">
        <span className="text-xs font-extrabold uppercase tracking-widest text-gold">Why BYA</span>
        <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-ink sm:text-5xl">
          How tracking your numbers grows the business
        </h1>
        <p className="mt-4 leading-relaxed text-ink-soft">
          A live financial dashboard is not just tidy books — it is a decision tool. Here is exactly
          where it pays you back, from winning tenders to dodging a cash crunch.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {groups.map((g) => (
          <div key={g.theme} className="rounded-2xl border border-line bg-white p-8">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-gold/15 text-xl text-gold">
                {g.ic}
              </span>
              <h2 className="font-display text-xl font-bold text-ink">{g.theme}</h2>
            </div>
            <div className="flex flex-col gap-5">
              {g.items.map((it) => (
                <div key={it.t}>
                  <h3 className="font-semibold text-ink">{it.t}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{it.d}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 text-center">
        <Link
          href="/contact"
          className="rounded-full bg-gold px-8 py-4 font-bold text-[#1a1206] transition-transform hover:-translate-y-0.5"
        >
          Book an accountant →
        </Link>
      </div>
    </section>
  );
}
