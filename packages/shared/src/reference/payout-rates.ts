import type { PlatformFees } from "../schemas/config.js";

/**
 * Statutory and commercial payout rates — feature inventory §19.
 *
 * Ported verbatim from `PAYOUT_DEFAULTS` in the frozen legacy
 * `functions/index.js`, where they sit inside a 1,245-line file alongside
 * exams, KYC, bookings, admin actions, payments and notifications. Moving them
 * into the contract is the cheapest available insurance against losing them.
 *
 * **No payout logic ships in this phase.** These are constants only; the §12
 * engine will read them from here, overridden at runtime by the
 * `config/platformFees` document so a notified rate change can go live without
 * a deploy.
 *
 * Money is integer paise throughout. The legacy values were in rupees
 * (`minFee: 200`, `tdsThreshold: 500000`) and are converted here, once, at the
 * boundary — which is the only place a rupee value is allowed to appear.
 */
export const PAYOUT_RATES: PlatformFees = {
  /** Platform facilitation fee on collected value. */
  takeRate: 0.12,

  /** GST charged on the platform fee. */
  gstOnFeeRate: 0.18,

  /**
   * Income-tax TDS on e-commerce participants, 0.1% of gross.
   * Sec 393(1) Sl.8(v), IT Act 2025 — erstwhile 194-O.
   */
  tdsRate: 0.001,

  /** GST TCS u/s 52 CGST Act, 0.5% of net taxable value (N/N 15/2024). */
  gstTcsRate: 0.005,

  /** Fee floor per engagement. Legacy `minFee: 200` rupees. */
  minFeePaise: 20_000,

  /**
   * Annual gross above which TDS applies. Legacy `tdsThreshold: 500000` rupees
   * (₹5 lakh).
   */
  tdsThresholdPaise: 50_000_000,
};
