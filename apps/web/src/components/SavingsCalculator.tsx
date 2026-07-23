"use client";

import { ECONOMICS, computeEconomics, inr } from "@bya/shared";
import { useMemo, useState } from "react";

/** The hero savings calculator — full-time cost vs booking days on demand. */
export function SavingsCalculator() {
  const [salary, setSalary] = useState<number>(ECONOMICS.defaultSalary);
  const [days, setDays] = useState<number>(ECONOMICS.defaultDays);
  const econ = useMemo(() => computeEconomics(salary, days), [salary, days]);

  return (
    <div className="rounded-3xl border border-white/60 bg-white/95 p-7 shadow-2xl">
      <div className="mb-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-gold">
        ▥ Savings calculator
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="min-w-[150px] flex-1">
          <span className="mb-2 block text-sm font-semibold text-ink-soft">Salary (₹/month)</span>
          <input
            type="number"
            value={salary}
            min={ECONOMICS.minSalary}
            max={ECONOMICS.maxSalary}
            step={1000}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSalary(Number.isFinite(v) ? v : 0);
            }}
            className="w-full rounded-xl border-[1.5px] border-line px-4 py-3 text-xl font-bold text-ink focus:border-gold focus:outline-none"
          />
        </label>
        <label className="min-w-[170px] flex-[1.3]">
          <span className="mb-2 block text-sm font-semibold text-ink-soft">
            Days needed: <strong className="text-ink">{days}/mo</strong>
          </span>
          <input
            type="range"
            value={days}
            min={ECONOMICS.minDays}
            max={ECONOMICS.maxDays}
            step={1}
            onChange={(e) => setDays(Number(e.target.value))}
            className="mt-3 w-full accent-gold"
          />
        </label>
      </div>

      <div className="mt-6 rounded-2xl bg-navy p-6 text-white">
        <div className="text-xs font-extrabold uppercase tracking-widest text-gold">
          You could save
        </div>
        <div className="font-display text-5xl font-bold leading-none">
          {inr(econ.savingYearly)}
          <span className="text-base font-normal text-white/70"> /yr</span>
        </div>
        <p className="mt-3 text-sm text-white/70">
          Full-time {inr(econ.loadedYearly)}/yr vs on-demand {inr(econ.onDemandYearly)}/yr
        </p>
      </div>
    </div>
  );
}
