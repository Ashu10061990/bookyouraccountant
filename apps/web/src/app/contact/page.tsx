import type { Metadata } from "next";
import { JsonLd } from "../../components/JsonLd";
import { CONTACT, OFFICES } from "../../lib/site";
import { breadcrumbsJsonLd, localBusinessJsonLd } from "../../lib/structured-data";

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Reach BookYourAccountant at Business@keiritech.com or +91-8954841762. Head office in Greater Noida, with branch offices in Pune, New Delhi and Agra.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact BookYourAccountant",
    description:
      "Reach us at Business@keiritech.com or +91-8954841762. Head office Greater Noida; branches in Pune, New Delhi and Agra.",
    url: "/contact",
  },
};

export default function ContactPage() {
  return (
    <section className="mx-auto max-w-[1280px] px-5 py-24 sm:px-10">
      {/* LocalBusiness uses the real head-office address from lib/site — the
          same OFFICES constant rendered below. */}
      <JsonLd data={localBusinessJsonLd()} />
      <JsonLd
        data={breadcrumbsJsonLd([
          { name: "Home", path: "/" },
          { name: "Contact us", path: "/contact" },
        ])}
      />
      <div className="mx-auto mb-12 max-w-3xl text-center">
        <span className="text-xs font-extrabold uppercase tracking-widest text-gold">
          Contact us
        </span>
        <h1 className="font-display text-3xl font-bold uppercase tracking-tight text-ink sm:text-5xl">
          Get in touch
        </h1>
        <p className="mt-4 leading-relaxed text-ink-soft">
          Questions about booking, pricing or compliance? Reach us directly — or visit one of our
          offices.
        </p>
      </div>

      <div className="mx-auto mb-12 flex max-w-2xl flex-col gap-4 sm:flex-row">
        <a
          href={`mailto:${CONTACT.email}`}
          className="flex flex-1 items-center gap-4 rounded-2xl border border-line bg-white p-5 transition-colors hover:border-gold"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-gold/15 text-xl text-gold">
            ✉
          </span>
          <span>
            <span className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Email
            </span>
            <strong className="text-ink">{CONTACT.email}</strong>
          </span>
        </a>
        <a
          href={`tel:${CONTACT.phone.replace(/-/g, "")}`}
          className="flex flex-1 items-center gap-4 rounded-2xl border border-line bg-white p-5 transition-colors hover:border-gold"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-gold/15 text-xl text-gold">
            ☎
          </span>
          <span>
            <span className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Phone
            </span>
            <strong className="text-ink">{CONTACT.phone}</strong>
          </span>
        </a>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {OFFICES.map((o) => (
          <div
            key={o.city}
            className={`rounded-2xl border bg-white p-6 ${o.head ? "border-gold" : "border-line"}`}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-gold">
              {o.label}
            </span>
            <h2 className="mt-1 font-display text-xl font-bold text-ink">📍 {o.city}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{o.addr}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
