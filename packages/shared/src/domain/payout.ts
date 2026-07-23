import { PAYOUT_RATES } from "../reference/payout-rates.js";
import type { PlatformFees } from "../schemas/config.js";

/**
 * The payout statutory maths — feature inventory §19, ported from the legacy
 * `onAssignmentCompleted` engine in `functions/index.js`.
 *
 * On every completed assignment the legacy system mints a payout-ledger entry
 * with the full deduction stack: the platform fee, GST on that fee, income-tax
 * TDS, and GST TCS. This is money owed to real accountants and reported to the
 * tax authorities, so §14.5 makes it the gate of the whole migration — "the
 * payout engine re-run against migrated data produces byte-identical output. A
 * single-rupee difference blocks the flip."
 *
 * ## Pure, and in paise
 *
 * The legacy engine is entangled with Firestore: it reads the accountant's
 * running financial-year gross, computes, then writes it back. That statefulness
 * is the service layer's job. **This function is the pure core** — given the
 * gross, the accountant's prior-FY gross, and whether they are GST-registered,
 * it returns the breakdown.
 *
 * ## Whole-rupee rounding is deliberate, not incidental
 *
 * The legacy computes every statutory line in **whole rupees** —
 * `Math.round(gross × takeRate)` on a rupee gross. Computing the same in paise
 * rounds more finely and diverges: on a ₹1005 gross the fee is ₹121 in the
 * legacy but ₹120.60 in paise. §14.5 makes the payout engine the migration
 * gate — "re-run against migrated data produces byte-identical output; a
 * single-rupee difference blocks the flip" — so the port reproduces the
 * rupee-granular rounding exactly, and the golden fixture proves it against the
 * legacy math. Amounts are stored as integer paise, always a whole-rupee
 * multiple of 100, which is both faithful and correct: these are figures
 * reported to the tax authorities.
 */

/** Round a paise amount to the nearest whole rupee, as the legacy engine did. */
const toRupeePaise = (paise: number): number => Math.round(paise / 100) * 100;

export interface PayoutInput {
  /** Amount actually collected from the business for this engagement, in paise. */
  grossPaise: number;
  /**
   * The accountant's cumulative gross for the current financial year *before*
   * this engagement, in paise. TDS applies only beyond the ₹5L threshold, so
   * the running total decides how much of this gross crosses it.
   */
  priorFyGrossPaise: number;
  /** GST TCS is collected only from GST-registered accountants. */
  isGstRegistered: boolean;
  /** Overrides for the statutory rates; defaults to the shipped `PAYOUT_RATES`. */
  rates?: PlatformFees;
}

export interface PayoutBreakdown {
  grossPaise: number;
  /** Platform facilitation fee, floored at `minFeePaise`. */
  feePaise: number;
  /** GST charged on the fee. */
  gstOnFeePaise: number;
  /** Income-tax TDS on the portion of gross above the ₹5L FY threshold. */
  tdsPaise: number;
  /** GST TCS u/s 52, or 0 for an unregistered accountant. */
  gstTcsPaise: number;
  /** What the accountant actually receives: gross minus every deduction. */
  netPaise: number;
  /** The accountant's FY gross after adding this engagement — the running total. */
  fyGrossAfterPaise: number;
}

/**
 * Computes the payout breakdown for one completed engagement.
 *
 * Line-for-line faithful to the legacy engine, with two deliberate structural
 * differences, neither of which changes a number:
 *
 * - The FY-gross read/write is lifted out. The caller passes `priorFyGrossPaise`
 *   and stores `fyGrossAfterPaise`, so this stays pure and testable — §15's
 *   first-priority tier.
 * - `Math.max(0, …)` guards are kept exactly where the legacy had them, so a
 *   zero-gross (fully coupon-covered) engagement produces an all-zero breakdown
 *   rather than a negative fee.
 */
export function computePayout(input: PayoutInput): PayoutBreakdown {
  const rates = input.rates ?? PAYOUT_RATES;
  const gross = Math.max(0, input.grossPaise);

  // Platform fee: a proportion of gross, floored — but zero on a zero-gross
  // engagement, so the floor never charges a fee on nothing.
  const fee = gross === 0 ? 0 : Math.max(rates.minFeePaise, toRupeePaise(gross * rates.takeRate));
  const gstOnFee = toRupeePaise(fee * rates.gstOnFeeRate);

  // Income-tax TDS: 0.1% of gross, but only on the cumulative amount beyond the
  // ₹5L FY threshold. The base is "how much of THIS gross sits above the line",
  // i.e. the newly-crossed portion — computed as the excess after minus the
  // excess before, exactly as the legacy did.
  const prior = Math.max(0, input.priorFyGrossPaise);
  const fyGrossAfter = prior + gross;
  const tdsBase =
    Math.max(0, fyGrossAfter - rates.tdsThresholdPaise) -
    Math.max(0, prior - rates.tdsThresholdPaise);
  const tds = toRupeePaise(tdsBase * rates.tdsRate);

  // GST TCS u/s 52: 0.5% of gross, collected only from registered accountants.
  const gstTcs = input.isGstRegistered ? toRupeePaise(gross * rates.gstTcsRate) : 0;

  const net = Math.max(0, gross - fee - gstOnFee - tds - gstTcs);

  return {
    grossPaise: gross,
    feePaise: fee,
    gstOnFeePaise: gstOnFee,
    tdsPaise: tds,
    gstTcsPaise: gstTcs,
    netPaise: net,
    fyGrossAfterPaise: fyGrossAfter,
  };
}

/**
 * The financial-year key (`"2026-2027"`) for a given date, April–March.
 *
 * Ported from the legacy FY logic. Passed a date rather than reading the clock,
 * so it is pure — and because the engine cannot call `new Date()` in this
 * codebase anyway, the caller supplies the date.
 */
export function financialYearKey(date: { getMonth(): number; getFullYear(): number }): string {
  const year = date.getFullYear();
  // April (month index 3) starts the Indian FY.
  return date.getMonth() + 1 >= 4 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}
