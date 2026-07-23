"use client";

import { MIS_VIEWS } from "@bya/shared";
import { useEffect, useState } from "react";

/** The Dashboards & MIS viewer — tabbed, gently auto-advancing until you click. */
export function MisViewer() {
  const views = MIS_VIEWS as readonly { t: string; d: string }[];
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto) return;
    const timer = setInterval(() => setActive((a) => (a + 1) % views.length), 4000);
    return () => clearInterval(timer);
  }, [auto, views.length]);

  const pick = (i: number) => {
    setAuto(false);
    setActive(i);
  };
  const v = views[active]!;

  return (
    <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[280px_1fr]">
      <div role="tablist" className="flex flex-col gap-2">
        {views.map((m, i) => (
          <button
            key={m.t}
            role="tab"
            aria-selected={active === i}
            onClick={() => pick(i)}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
              active === i
                ? "border-gold bg-gold/10 text-ink"
                : "border-line bg-white text-ink-soft hover:border-gold/50"
            }`}
          >
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${
                active === i ? "bg-gold text-[#1a1206]" : "bg-paper2 text-ink-soft"
              }`}
            >
              {i + 1}
            </span>
            {m.t}
          </button>
        ))}
      </div>

      <figure className="overflow-hidden rounded-2xl border border-line bg-white">
        {/* The dashboard screenshots are not part of this slice; a branded
            placeholder stands in for each view so the copy still lands. */}
        <div className="hero-bg grid aspect-video place-items-center p-8 text-center">
          <div>
            <div className="font-display text-2xl font-bold text-white">{v.t}</div>
            <div className="mt-2 text-sm text-white/60">Live dashboard preview</div>
          </div>
        </div>
        <figcaption className="p-6">
          <h3 className="font-display text-xl font-bold text-ink">{v.t}</h3>
          <p className="mt-2 leading-relaxed text-ink-soft">{v.d}</p>
        </figcaption>
      </figure>
    </div>
  );
}
