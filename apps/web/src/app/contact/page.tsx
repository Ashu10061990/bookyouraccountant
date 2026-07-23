import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Reach BookYourAccountant: Business@keiritech.com, +91-8954841762. Head office Greater Noida; branches in Pune, New Delhi and Agra.",
  alternates: { canonical: "/contact" },
};

const OFFICES = [
  {
    head: true,
    label: "Head Office",
    city: "Greater Noida",
    addr: "320/TF, C-1, Alpha-1 Krishna Apra Plaza, HDFC Bank, Greater Noida, Gautam Budh Nagar – 201308",
  },
  {
    head: false,
    label: "Branch Office",
    city: "Pune",
    addr: "1002, Amanora Gold Tower, Hadapsar, Pune, Maharashtra – 411028",
  },
  {
    head: false,
    label: "Branch Office",
    city: "New Delhi",
    addr: "17A/44, W.E.A. Off Gurudwara Road, Karol Bagh, New Delhi – 110005, India",
  },
  {
    head: false,
    label: "Branch Office",
    city: "Agra",
    addr: "520, 5th Floor, Corporate Park, Sanjay Palace, Civil Lines, Agra, Uttar Pradesh – 282003",
  },
];

export default function ContactPage() {
  return (
    <section className="mx-auto max-w-[1280px] px-5 py-24 sm:px-10">
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
          href="mailto:Business@keiritech.com"
          className="flex flex-1 items-center gap-4 rounded-2xl border border-line bg-white p-5 transition-colors hover:border-gold"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-gold/15 text-xl text-gold">
            ✉
          </span>
          <span>
            <span className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Email
            </span>
            <strong className="text-ink">Business@keiritech.com</strong>
          </span>
        </a>
        <a
          href="tel:+918954841762"
          className="flex flex-1 items-center gap-4 rounded-2xl border border-line bg-white p-5 transition-colors hover:border-gold"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-gold/15 text-xl text-gold">
            ☎
          </span>
          <span>
            <span className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Phone
            </span>
            <strong className="text-ink">+91-8954841762</strong>
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
