/**
 * Regenerates the payout golden fixture.
 *
 * Unlike gen-golden.mjs, this does NOT import the legacy function — the legacy
 * payout math lives inside a Firestore onDocumentWritten callback
 * (functions/index.js `onAssignmentCompleted`, the block at ~line 1198) and
 * cannot be sliced out cleanly. `legacyPayout` below is a line-for-line
 * transcription of that block, in rupees. Cross-check it against the frozen
 * source when regenerating; the TS port in payout.ts is then proven to
 * reproduce these figures x 100.
 */
// Reproduces the EXACT legacy payout math (functions/index.js:1198-1225) in
// rupees, over a spread of cases, and emits golden vectors. The TS port (in
// paise) must give these figures x 100.
const DEF = {
  takeRate: 0.12,
  gstOnFeeRate: 0.18,
  tdsRate: 0.001,
  gstTcsRate: 0.005,
  minFee: 200,
  tdsThreshold: 500000,
};

function legacyPayout(grossR, prevFyGrossR, gstin, cfg = DEF) {
  const gross = Math.max(0, Number(grossR));
  const fee = gross === 0 ? 0 : Math.max(cfg.minFee, Math.round(gross * cfg.takeRate));
  const gstOnFee = Math.round(fee * cfg.gstOnFeeRate);
  const prevFyGross = prevFyGrossR;
  const newFyGross = prevFyGross + gross;
  const TDS_THRESHOLD = cfg.tdsThreshold;
  const tdsBase =
    Math.max(0, newFyGross - TDS_THRESHOLD) - Math.max(0, prevFyGross - TDS_THRESHOLD);
  const tds = Math.round(tdsBase * cfg.tdsRate);
  const gstTcs = gstin ? Math.round(gross * cfg.gstTcsRate) : 0;
  const net = Math.max(0, gross - fee - gstOnFee - tds - gstTcs);
  return { gross, fee, gstOnFee, tds, gstTcs, net, fyGrossAfter: newFyGross };
}

const CASES = [
  ["zero-gross-coupon", 0, 0, false],
  ["small-below-minfee", 1000, 0, false], // fee floored at 200
  ["fee-rounds-down", 8342, 0, false], // 8342*0.12 = 1001.04 -> 1001
  ["fee-rounds-up", 8346, 0, true], // 8346*0.12 = 1001.52 -> 1002
  ["mid-registered", 10000, 0, true],
  ["mid-unregistered", 10000, 0, false],
  ["below-tds-threshold", 400000, 0, true], // under 5L, no TDS
  ["crossing-tds-threshold", 200000, 400000, true], // prev 4L + 2L = 6L, TDS on 1L excess
  ["fully-above-threshold", 100000, 600000, true], // all above 5L
  ["large-registered", 550000, 0, true],
  ["straddle-exact-threshold", 500000, 0, true], // exactly at 5L, no excess
];

const vectors = CASES.map(([name, gross, prev, gstin]) => ({
  name,
  grossRupees: gross,
  priorFyGrossRupees: prev,
  isGstRegistered: gstin,
  legacy: legacyPayout(gross, prev, gstin),
}));
console.log(JSON.stringify(vectors, null, 2));
