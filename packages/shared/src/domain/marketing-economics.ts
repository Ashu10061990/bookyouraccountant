import { ECONOMICS } from "../reference/marketing.js";

/**
 * The savings-calculator maths behind the marketing hero — feature inventory
 * §16, ported from the legacy `computeEconomics`.
 *
 * Compares the loaded yearly cost of a full-time accountant against booking one
 * on demand for a handful of days a month. Pure; the `ECONOMICS` dials come
 * from the ported marketing data.
 */
export interface Economics {
  loadedMonthly: number;
  loadedYearly: number;
  onDemandMonthly: number;
  onDemandYearly: number;
  savingYearly: number;
}

export function computeEconomics(salaryPerMonth: number, daysPerMonth: number): Economics {
  const loadedMonthly = salaryPerMonth * ECONOMICS.loadingFactor;
  const loadedYearly = loadedMonthly * ECONOMICS.monthsPerYear;
  const onDemandMonthly = ECONOMICS.perDayRate * daysPerMonth;
  const onDemandYearly = onDemandMonthly * ECONOMICS.monthsPerYear;
  const savingYearly = Math.max(0, loadedYearly - onDemandYearly);
  return { loadedMonthly, loadedYearly, onDemandMonthly, onDemandYearly, savingYearly };
}

/** Indian-format rupee display, e.g. `₹6,37,200`. */
export const inr = (n: number): string => "₹" + Math.round(n).toLocaleString("en-IN");
