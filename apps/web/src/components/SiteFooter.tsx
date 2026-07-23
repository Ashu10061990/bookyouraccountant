import Link from "next/link";
import { Logo } from "./Logo";

/** Marketing footer — ported from the legacy MarketingLayout. */
export function SiteFooter() {
  return (
    <footer className="bg-[#0e1c12] text-white/70">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-5 py-16 sm:px-10 md:grid-cols-4">
        <div className="md:col-span-1">
          <div className="mb-4 flex items-center gap-3">
            <Logo className="h-9 w-9" />
            <span className="font-display text-xl font-bold text-white">BYA</span>
          </div>
          <p className="text-sm leading-relaxed">
            BookYourAccountant — verified accountants for India&apos;s MSMEs, on demand. A Keiritech
            product.
          </p>
        </div>
        <FooterCol
          title="Explore"
          links={[
            { href: "/about", label: "About BYA" },
            { href: "/why", label: "Why BYA" },
            { href: "/dashboards", label: "Dashboards & MIS" },
          ]}
        />
        <FooterCol
          title="Company"
          links={[
            { href: "/about", label: "About" },
            { href: "/contact", label: "Contact" },
          ]}
        />
        <FooterCol
          title="Legal"
          links={[
            { href: "#", label: "Terms of Service" },
            { href: "#", label: "Privacy Policy" },
            { href: "#", label: "Refund Policy" },
          ]}
        />
      </div>
      <div className="mx-auto flex max-w-[1280px] flex-col justify-between gap-2 border-t border-white/10 px-5 py-6 text-xs sm:flex-row sm:px-10">
        <span>© 2026 Keiritech. All rights reserved.</span>
        <span>Made in India · For India MSMEs</span>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-white">{title}</h4>
      <div className="flex flex-col gap-2">
        {links.map((l) => (
          <Link key={l.label} href={l.href} className="text-sm hover:text-gold">
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
