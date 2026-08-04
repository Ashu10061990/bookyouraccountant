"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "./Logo";

const TABS = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/about", label: "About BYA" },
  { href: "/why", label: "Why BYA" },
  { href: "/dashboards", label: "Dashboards & MIS" },
  { href: "/contact", label: "Contact us" },
];

/** Sticky, dark, blurred marketing nav with a mobile menu. */
export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="nav-blur sticky top-0 z-30 border-b border-white/10">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-6 px-5 py-4 sm:px-10">
        <Link href="/" className="flex items-center gap-3">
          <Logo className="h-9 w-9" />
          <span className="font-display text-xl font-bold text-white">BYA</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {TABS.map((t) => {
            const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`text-sm font-semibold transition-colors hover:text-gold ${
                  active ? "text-gold" : "text-white/75"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/contact"
            className="hidden rounded-full bg-gold px-6 py-3 text-sm font-bold text-[#1a1206] transition-transform hover:-translate-y-0.5 sm:inline-block"
          >
            Sign in
          </Link>
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            className="text-2xl text-white md:hidden"
            onClick={() => setOpen((o) => !o)}
          >
            ☰
          </button>
        </div>
      </div>

      {open && (
        <nav className="flex flex-col gap-1 border-t border-white/10 px-5 pb-4 md:hidden">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              onClick={() => setOpen(false)}
              className="py-2 text-sm font-semibold text-white/80 hover:text-gold"
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
