/**
 * Money is represented as an integer number of paise (1 rupee = 100 paise).
 *
 * Rationale: floating-point arithmetic on currency accumulates error that
 * surfaces as rupee-level disputes in payout statements. Every monetary value
 * crossing a boundary — API, database, UI — is an integer.
 */

/**
 * An integer number of paise. This is a plain alias, NOT a branded type — the
 * compiler will not stop a rupee value being passed where paise is expected.
 * Validate at every boundary with `assertPaise`.
 */
export type Paise = number;

/** Throws unless `value` is a safe integer. */
export function assertPaise(value: number): asserts value is Paise {
  if (!Number.isFinite(value)) {
    throw new TypeError(`Paise value is not a finite number: ${value}`);
  }
  if (!Number.isInteger(value)) {
    throw new TypeError(`Paise value must be an integer, received: ${value}`);
  }
}

/** Rounds half away from zero, avoiding the float drift in `Math.round`. */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Converts rupees to paise. Accepts fractional rupees. */
export function rupeesToPaise(rupees: number): Paise {
  if (!Number.isFinite(rupees)) {
    throw new TypeError(`Rupee value is not a finite number: ${rupees}`);
  }
  // toFixed first, so 19.99 * 100 = 1998.9999999999998 becomes 1999 reliably.
  return roundHalfAwayFromZero(Number((rupees * 100).toFixed(4)));
}

/** Converts paise to rupees. For display and external APIs only. */
export function paiseToRupees(paise: Paise): number {
  assertPaise(paise);
  return paise / 100;
}

const INR_FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats paise as Indian currency, e.g. `₹1,23,456.78`. */
export function formatINR(paise: Paise): string {
  assertPaise(paise);
  // Intl emits U+00A0 or U+202F between symbol and digits on some ICU builds
  // and none on others; strip both so output is stable across runtimes.
  return INR_FORMATTER.format(paise / 100).replace(/[\u00A0\u202F]/g, "");
}

/** Sums paise amounts. Returns 0 for an empty list. */
export function addPaise(...amounts: Paise[]): Paise {
  let total = 0;
  for (const amount of amounts) {
    assertPaise(amount);
    total += amount;
  }
  return total;
}

/**
 * Applies a rate (0..1) to a paise amount, returning an integer.
 * Used for platform fee, GST, TDS and TCS calculations.
 */
export function percentageOfPaise(amount: Paise, rate: number): Paise {
  assertPaise(amount);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new RangeError(`Rate must be between 0 and 1, received: ${rate}`);
  }
  return roundHalfAwayFromZero(Number((amount * rate).toFixed(4)));
}
