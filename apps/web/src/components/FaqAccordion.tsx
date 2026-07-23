"use client";

import { FAQS } from "@bya/shared";
import { useState } from "react";

/** The home-page FAQ accordion. */
export function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="mx-auto max-w-3xl divide-y divide-line rounded-2xl border border-line bg-white">
      {(FAQS as readonly { q: string; a: string }[]).map((f, i) => (
        <div key={f.q}>
          <button
            type="button"
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left font-display text-lg font-semibold text-ink"
            aria-expanded={open === i}
          >
            {f.q}
            <span className="text-gold">{open === i ? "−" : "+"}</span>
          </button>
          {open === i && <p className="px-6 pb-6 leading-relaxed text-ink-soft">{f.a}</p>}
        </div>
      ))}
    </div>
  );
}
