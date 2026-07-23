# Feature parity checklist — legacy → rebuild

> **Nothing here may be left blank when a phase is declared complete.**
>
> Source of truth: `../BYA& Keiri/FEATURE-INVENTORY.md`. Open the matching section, walk
> every feature it lists, and record a decision. "We forgot" is not a decision — every
> row needs both a **status** and a **decision**, with who decided and when.
>
> Decisions: `PORT` (rebuild as-is) · `REBUILD` (same capability, new design) ·
> `DROP` (deliberately not carried forward — say why) · `DEFER` (later phase — say which)

## How to use

1. Open the inventory section named in the row.
2. For each feature listed there, confirm it exists in the rebuild or record a decision.
3. Fill Status, Decision, Who/When. Link the PR or commit that delivered it.
4. A phase is complete only when every row it touches is filled in.

---

## Sections

| §   | Area                                             | Status        | Decision | Who / when | Ref |
| --- | ------------------------------------------------ | ------------- | -------- | ---------- | --- |
| §1  | System map                                       | ☐ not started |          |            |     |
| §2  | Roles & permission matrix                        | ☐ not started |          |            |     |
| §3  | Routing table                                    | ☐ not started |          |            |     |
| §4  | Authentication & onboarding                      | ☐ not started |          |            |     |
| §5  | Business dashboard                               | ☐ not started |          |            |     |
| §6  | Accountant dashboard                             | ☐ not started |          |            |     |
| §7  | Assignment engine (the core product)             | ☐ not started |          |            |     |
| §8  | Booking engine (legacy, parallel to assignments) | ☐ not started |          |            |     |
| §9  | Financial dashboard (MIS)                        | ☐ not started |          |            |     |
| §10 | Compliance calendar                              | ☐ not started |          |            |     |
| §11 | Qualifying exam engine                           | ☐ not started |          |            |     |
| §12 | Payments & payouts                               | ☐ not started |          |            |     |
| §13 | Notifications                                    | ☐ not started |          |            |     |
| §14 | Keiri chatbot                                    | ☐ not started |          |            |     |
| §15 | Admin console                                    | ☐ not started |          |            |     |
| §16 | Public marketing site (in-app)                   | ☐ not started |          |            |     |
| §17 | Data model                                       | ☐ not started |          |            |     |
| §18 | Cloud Functions catalogue (18)                   | ☐ not started |          |            |     |
| §19 | Reference data tables to preserve                | ☐ not started |          |            |     |
| §20 | Dead / unreachable code register                 | ☐ not started |          |            |     |
| §22 | Keiri Tech marketing site                        | ☐ not started |          |            |     |

---

## High-risk items — invisible in the running app

These are fully built but unreachable, so anyone rebuilding from the live UI will never
see them. Each needs an explicit decision **before** the phase that would have covered it.

| Item                                                                       | §        | Decision | Who / when |
| -------------------------------------------------------------------------- | -------- | -------- | ---------- |
| Accountant browse marketplace (search, filters, match score, BookingModal) | §5       |          |            |
| Entire booking engine (createBooking, status machine, workflow gates, ARN) | §8       |          |            |
| MIS financial dashboard + ClientUpload + processClientTemplate             | §9       |          |            |
| ComplianceOverridesEditor (admin pushes due-date extensions)               | §10, §15 |          |            |
| Admin BookingsTable + askResolve (dispute override)                        | §15      |          |            |
| AppointmentStep (physical exam centres)                                    | §20      |          |            |
| RateField + rateSlab.js                                                    | §20      |          |            |
| CourseView + accountingCourse.js (5 modules, ~21 lessons)                  | §20      |          |            |
| AssignmentChecklist + accountingSOP.js (account-head SOP)                  | §20      |          |            |
| Earnings tab (crashes — undefined identifiers)                             | §6       |          |            |
| Admin Payouts tab (crashes — undefined identifiers)                        | §15      |          |            |
| Start.jsx email/password signup path                                       | §20      |          |            |
| /pricing route (3 tiers defined, route redirects away)                     | §16, §20 |          |            |
| Capacitor mobile shell (configured, never built)                           | §20      |          |            |

## Hand-curated data — recreating any of this costs a domain expert's time

| Asset                                                | §   | Ported? | Where it now lives |
| ---------------------------------------------------- | --- | ------- | ------------------ |
| 293-question exam bank, 11 topics                    | §19 | ☐       |                    |
| 28-point bookkeeping SOP (Do/Don't/Reconcile)        | §19 | ☐       |                    |
| 19 business-type SOP checks (trading/mfg/service)    | §19 | ☐       |                    |
| Per-service SOPs (6 services × 4 tasks)              | §19 | ☐       |                    |
| 23-obligation compliance calendar (IT Act 2025)      | §19 | ☐       |                    |
| parseTemplate.js — spreadsheet → dashboard engine    | §19 | ☐       |                    |
| Pricing dials (slabs, synergy, catch-up, discounts)  | §19 | ☐       |                    |
| Payout statutory rates (fee, GST, TDS ₹5L, TCS)      | §19 | ☐       |                    |
| India 36 states + 466 cities                         | §19 | ☐       |                    |
| Marketing copy (benefits, FAQs, tiers, testimonials) | §19 | ☐       |                    |
| Keiri chatbot knowledge base (12 entries)            | §19 | ☐       |                    |
| Software catalogues (11 accounting + 11 compliance)  | §19 | ☐       |                    |

## Archives — analysed, closed

All 60 zip archives in the legacy folder were extracted and every source file compared by
content hash against both live trees. **Only the newest archive**,
`bookyouraccountant-source-updated.zip`, contains anything not already in the live tree: an
unshipped mobile-responsiveness pass across 6 files, plus `keiri-mobile.css` for the static
site. Everything else is an older version of a file that moved forward, a file that lives
at the repo root, or macOS `._` metadata.

**Nothing else needs extracting.** Detail in `FEATURE-INVENTORY.md` §21.

| Carry-forward item                                                            | Ported? | Where |
| ----------------------------------------------------------------------------- | ------- | ----- |
| Mobile-responsiveness pass (6 files, `clamp()` padding + grid overflow fixes) | ☐       |       |
| `keiri-mobile.css` — universal mobile patch for the Keiri static site         | ☐       |       |

## Still unconfirmed (not code, unrelated to the zips)

Three standalone HTML tools at the legacy repo root — `Payment_Extractor_Tool.html`,
`Payment_Register_Tool.html`, `Receivables_Mapper.html` (~900 KB each, self-contained).
They look like working internal utilities rather than mockups. Confirm with the user
whether they are in active use, and if so whether they belong in the rebuild.
