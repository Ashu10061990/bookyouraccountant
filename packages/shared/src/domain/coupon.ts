import type { Quote } from "./pricing.js";

/**
 * The first-day-free coupon — feature inventory §12.2, ported from the legacy
 * `computePayable`.
 *
 * A business's first engagement gets one day free: the coupon is worth one
 * day's rate, capped at the total (so a sub-one-day quote is simply free, never
 * negative). Everything is integer paise; the legacy `Math.round` is a no-op
 * here because `Quote` already carries whole-paise figures, and it is kept only
 * for exactness.
 *
 * `firestore.rules` let a business create its own assignment **only** when fully
 * coupon-covered (`payable == 0`), leaving every paid assignment to be created
 * server-side after Razorpay verification. So the `payablePaise === 0` case this
 * produces is load-bearing, not cosmetic.
 */

export interface Payable {
  /** What the business pays now, in paise. Zero when the coupon covers it. */
  payablePaise: number;
  /** The coupon's value applied, in paise — one day's rate, capped at total. */
  couponValuePaise: number;
}

export function computePayable(
  quote: Pick<Quote, "ratePaise" | "totalPaise">,
  applyCoupon: boolean,
): Payable {
  const couponValuePaise = applyCoupon ? Math.min(quote.ratePaise, quote.totalPaise) : 0;
  return {
    payablePaise: Math.max(0, quote.totalPaise - couponValuePaise),
    couponValuePaise,
  };
}
