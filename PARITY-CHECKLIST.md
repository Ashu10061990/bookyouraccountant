# Feature parity checklist — legacy → rebuild

> **Nothing here may be left blank when a phase is declared complete.**
>
> Source of truth: `../BYA& Keiri/FEATURE-INVENTORY.md`. Open the matching section, walk
> every feature it lists, and record a decision. "We forgot" is not a decision — every
> row needs both a **status** and a **decision**, with who decided and when.
>
> Decisions: `PORT` (rebuild as-is) · `REBUILD` (same capability, new design) ·
> `DEFER` (later phase — say which) · `KEEP-UNDECIDED` (carried forward, fate deferred to
> the pruning scan)
>
> **`DROP` is deliberately not an option yet.** Policy is keep-everything-prune-later:
> nothing is removed until a dedicated end-to-end dead-code scan runs _after_ parity is
> reached. If you think something should go, record `KEEP-UNDECIDED` and your reasoning.

## How to use

1. Open the inventory section named in the row.
2. For each feature listed there, confirm it exists in the rebuild or record a decision.
3. Fill Status, Decision, Who/When. Link the PR or commit that delivered it.
4. A phase is complete only when every row it touches is filled in.

---

## Sections

| §   | Area                                             | Status                  | Decision                               | Who / when         | Ref     |
| --- | ------------------------------------------------ | ----------------------- | -------------------------------------- | ------------------ | ------- |
| §1  | System map                                       | ☐ not started           |                                        |                    |         |
| §2  | Roles & permission matrix                        | ◐ partial — API layer   | PORT (3 roles, admin out-of-band)      | Claude, 2026-07-23 | Phase 3 |
| §3  | Routing table                                    | ◐ partial — 4 domains   | REBUILD as `/v1/*` REST                | Claude, 2026-07-23 | Phase 3 |
| §4  | Authentication & onboarding                      | ◐ partial — API half    | PORT (Firebase Auth retained)          | Claude, 2026-07-23 | Phase 3 |
| §5  | Business dashboard                               | ☐ not started           |                                        |                    |         |
| §6  | Accountant dashboard                             | ☐ not started           |                                        |                    |         |
| §7  | Assignment engine (the core product)             | ☐ not started           | DEFER → Phase 5                        | Claude, 2026-07-23 |         |
| §8  | Booking engine (legacy, parallel to assignments) | ☐ not started           | DEFER → blocked on §18 Q1              | Claude, 2026-07-23 |         |
| §9  | Financial dashboard (MIS)                        | ☐ not started           | DEFER → blocked on §18 Q1              | Claude, 2026-07-23 |         |
| §10 | Compliance calendar                              | ◐ partial — storage     | REBUILD (`config/complianceOverrides`) | Claude, 2026-07-23 | Phase 3 |
| §11 | Qualifying exam engine                           | ☐ not started           | DEFER → Phase 5                        | Claude, 2026-07-23 |         |
| §12 | Payments & payouts                               | ◐ rates ported only     | DEFER → Phase 6 (constants PORTed)     | Claude, 2026-07-23 | Phase 3 |
| §13 | Notifications                                    | ☐ not started           | DEFER → Phase 5                        | Claude, 2026-07-23 |         |
| §14 | Keiri chatbot                                    | ☐ not started           |                                        |                    |         |
| §15 | Admin console                                    | ◐ partial — 3 endpoints | REBUILD                                | Claude, 2026-07-23 | Phase 3 |
| §16 | Public marketing site (in-app)                   | ☐ not started           | DEFER → Phase 4                        | Claude, 2026-07-23 |         |
| §17 | Data model                                       | ◐ 7 of 22 collections   | REBUILD (Mongo, `legacyId` retained)   | Claude, 2026-07-23 | Phase 3 |
| §18 | Cloud Functions catalogue (18)                   | ☐ not started           | DEFER → Phase 5/6                      | Claude, 2026-07-23 |         |
| §19 | Reference data tables to preserve                | ◐ 4 of 12 ported        | PORT (verbatim, generated)             | Claude, 2026-07-23 | Phase 3 |
| §20 | Dead / unreachable code register                 | ☐ not started           | KEEP-UNDECIDED (all 14)                | Claude, 2026-07-23 |         |
| §22 | Keiri Tech marketing site                        | ☐ not started           | separate session, user's call          | User, 2026-07-23   |         |

### What "partial" means for each row above

- **§2 Roles.** The three roles exist and are enforced server-side; `admin` is
  not self-assignable. The per-screen permission matrix arrives with the UI.
- **§3 Routing.** 11 endpoints across 4 domains. The legacy client-side route
  table is a Phase 5 concern.
- **§4 Auth.** Token verification, role resolution and the blocked-user gate are
  done. The onboarding _flows_ (OTP screens, exam-then-register ordering,
  the §18 exam-pass-then-refresh trap) are Phase 5.
- **§6 Accountant dashboard.** Profile CRUD, encrypted KYC submission, admin
  verification and the safe-field public listing exist. The dashboard _tabs_
  (assignments, earnings) are Phase 5. Contact details are no longer
  world-readable — see the accepted-risk note below.
- **§10 Compliance.** `config/complianceOverrides` can now be read and written,
  which is the backend for `ComplianceOverridesEditor` (§20 dead code). The
  23-obligation calendar itself is not yet ported.
- **§12 Payments.** Only the statutory rate constants, and only as data. No
  payout logic, no Razorpay, no ledger.
- **§15 Admin.** Admin-only writes for services and config, plus the lead list.
  The console's other tabs are Phase 5.
- **§17 Data model.** `users`, `leads`, `services`, `config`, `accountants`,
  `businesses`, `audit_log`. Every document schema carries optional `legacyId`
  for §14 traceability.
- **§19 Reference data.** 4 of 12 assets; see the table below.

---

## High-risk items — invisible in the running app

These are fully built but unreachable, so anyone rebuilding from the live UI will never
see them. Each needs an explicit decision **before** the phase that would have covered it.

| Item                                                                       | §        | Decision                                | Who / when         |
| -------------------------------------------------------------------------- | -------- | --------------------------------------- | ------------------ |
| Accountant browse marketplace (search, filters, match score, BookingModal) | §5       | KEEP-UNDECIDED — blocked on §18 Q2      | Claude, 2026-07-23 |
| Entire booking engine (createBooking, status machine, workflow gates, ARN) | §8       | KEEP-UNDECIDED — blocked on §18 Q1      | Claude, 2026-07-23 |
| MIS financial dashboard + ClientUpload + processClientTemplate             | §9       | KEEP-UNDECIDED — orphaned by §18 Q1     | Claude, 2026-07-23 |
| ComplianceOverridesEditor (admin pushes due-date extensions)               | §10, §15 | **REBUILD — backend done in Phase 3**   | Claude, 2026-07-23 |
| Admin BookingsTable + askResolve (dispute override)                        | §15      | KEEP-UNDECIDED — blocked on §18 Q1      | Claude, 2026-07-23 |
| AppointmentStep (physical exam centres)                                    | §20      | KEEP-UNDECIDED — centre data ported     | Claude, 2026-07-23 |
| RateField + rateSlab.js                                                    | §20      | KEEP-UNDECIDED — DEFER to Phase 5       | Claude, 2026-07-23 |
| CourseView + accountingCourse.js (5 modules, ~21 lessons)                  | §20      | KEEP-UNDECIDED — blocked on §18 Q5      | Claude, 2026-07-23 |
| AssignmentChecklist + accountingSOP.js (account-head SOP)                  | §20      | KEEP-UNDECIDED — blocked on §18 Q5      | Claude, 2026-07-23 |
| Earnings tab (crashes — undefined identifiers)                             | §6       | REBUILD — DEFER to Phase 5              | Claude, 2026-07-23 |
| Admin Payouts tab (crashes — undefined identifiers)                        | §15      | REBUILD — DEFER to Phase 5              | Claude, 2026-07-23 |
| Start.jsx email/password signup path                                       | §20      | KEEP-UNDECIDED — Firebase supports both | Claude, 2026-07-23 |
| /pricing route (3 tiers defined, route redirects away)                     | §16, §20 | KEEP-UNDECIDED — DEFER to Phase 4       | Claude, 2026-07-23 |
| Capacitor mobile shell (configured, never built)                           | §20      | DEFER → Phase 7                         | Claude, 2026-07-23 |

**One row changed status this phase.** `ComplianceOverridesEditor` is an
inventory §20 dead-code item — built, imported by `AdminHome`, never rendered,
so an admin cannot currently push a due-date extension at all. Its storage
(`config/complianceOverrides`) now has a read/write API with denial tests, so
restoring it is a UI decision rather than a backend rebuild.

Every other row is `KEEP-UNDECIDED` or `DEFER` with a named blocker. None is
dropped — per the retention policy, `DROP` is not available until the
post-parity pruning scan.

## Hand-curated data — recreating any of this costs a domain expert's time

| Asset                                                  | §   | Ported? | Where it now lives                                 |
| ------------------------------------------------------ | --- | ------- | -------------------------------------------------- |
| 293-question exam bank, 11 topics                      | §19 | ☐       |                                                    |
| 28-point bookkeeping SOP (Do/Don't/Reconcile)          | §19 | ☐       |                                                    |
| 19 business-type SOP checks (trading/mfg/service)      | §19 | ☐       |                                                    |
| Per-service SOPs (6 services × 4 tasks)                | §19 | ☐       |                                                    |
| 23-obligation compliance calendar (IT Act 2025)        | §19 | ☐       | storage only — `config/complianceOverrides`        |
| parseTemplate.js — spreadsheet → dashboard engine      | §19 | ☐       |                                                    |
| Pricing dials (slabs, synergy, catch-up, discounts)    | §19 | ☐       |                                                    |
| Payout statutory rates (fee, GST, TDS ₹5L, TCS)        | §19 | ☑       | `packages/shared/src/reference/payout-rates.ts`    |
| India 36 states + **161** cities (not 466 — see below) | §19 | ☑       | `packages/shared/src/reference/india.ts`           |
| Marketing copy (benefits, FAQs, tiers, testimonials)   | §19 | ☐       |                                                    |
| Keiri chatbot knowledge base (12 entries)              | §19 | ☐       |                                                    |
| Software catalogues (11 accounting + 11 compliance)    | §19 | ☑       | `packages/shared/src/reference/profile-options.ts` |
| Service catalogue (7) + exam centres (6)               | §19 | ☑       | `packages/shared/src/reference/services.ts`        |
| Profile vocabularies (entity, turnover, GST, volume…)  | §19 | ☑       | `packages/shared/src/reference/profile-options.ts` |

Every ported dataset has a count assertion in `reference.test.ts`. Porting 120
of 161 cities looks exactly like porting all of them; a count is the cheapest
check that fails when a port is partial. Data was generated from the frozen
legacy source by `packages/shared/scripts/gen-reference.mjs`, never retyped.

### Three corrections to the inventory itself

The inventory is the parity contract, so errors in it need fixing at the
source rather than being quietly worked around.

| Finding                               | Detail                                                                                                                                                                                                                               | Action needed                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| **§19 city count is wrong**           | The inventory says 466 cities. Both copies of the legacy `india.js` — repo root and `bya-new/src/lib/` — are byte-identical and contain **161** across 36 states.                                                                    | Correct `FEATURE-INVENTORY.md` §19 |
| **Two service vocabularies disagree** | The seeded catalogue (`functions/seed.js`, 7 ids: adds `tax`, `statements`) and the profile matching list (`profileOptions.js`, 10 ids: adds `tds`, `itr`, `roc`, `einvoicing`, `other`). Both ported verbatim under distinct names. | **User decision — spec §18 Q3**    |
| **§17.2 confirmed**                   | `FALLBACK_SERVICES` has one service; the pricing engine, SOP templates, booking validator and seed script define seven. All seven now ship in the contract.                                                                          | Closed by Phase 3                  |

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

## Standalone tools — retained, fate undetermined

Three self-contained HTML utilities at the legacy repo root, ~900 KB each. They read like
working internal tools rather than mockups. The user is not currently sure whether they are
in use, so per the retention policy they are **kept** and the decision deferred to the
pruning scan.

| Tool                          | Status           | Decision | Who / when |
| ----------------------------- | ---------------- | -------- | ---------- |
| `Payment_Extractor_Tool.html` | ☐ KEEP-UNDECIDED |          |            |
| `Payment_Register_Tool.html`  | ☐ KEEP-UNDECIDED |          |            |
| `Receivables_Mapper.html`     | ☐ KEEP-UNDECIDED |          |            |

## Retention policy

Nothing is deleted during the rebuild. Dead code, unreachable modules, the zip archives and
the tools above are all carried forward. Removal happens in **one dedicated end-to-end scan
after parity is reached** — with full context, and evidence per item. Deleting is cheap and
reversible then; noticing something you already deleted is not.
