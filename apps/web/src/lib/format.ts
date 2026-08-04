/** Small pure formatters shared by the SEO pages. */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * "2026-07-11" → "11 July 2026". Parses the ISO string directly — never via
 * `new Date()`, whose local-time parsing shifts dates across timezones.
 */
export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return `${String(d)} ${MONTHS[m - 1] ?? ""} ${String(y)}`;
}

/** Integer paise → "₹3,600" (Indian digit grouping, whole rupees). */
export function formatPaise(paise: number): string {
  const rupees = Math.round(paise / 100);
  return `₹${rupees.toLocaleString("en-IN")}`;
}

/** The FY starting in April of `fy` as a label: 2026 → "FY 2026-27". */
export function fyLabel(fy: number): string {
  return `FY ${String(fy)}-${String(fy + 1).slice(2)}`;
}
