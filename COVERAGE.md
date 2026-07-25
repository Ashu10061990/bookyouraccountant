# Coverage against the legacy — the honest map

> **Purpose.** This answers one question plainly: _of everything the legacy app
> does, what has the rebuild actually built, and what has it not?_ It is the
> counterpart to `PARITY-CHECKLIST.md` — that file tracks decisions section by
> section; this one is the blunt status, so nobody mistakes a foundation for a
> finished product.
>
> **The rebuild is not feature-complete.** It is a Phase-3-plus foundation: the
> API, the security model, the domain engines and the hand-curated data — plus
> the **first product UI journey (accountant onboarding + exam), walked
> end-to-end in a browser**, and the **third-party integration layer (2026-07-25):
> AWS S3 file storage, notifications, Razorpay payments** — each behind a gated
> port, built + tested with dummy creds (real sends/charges await real creds).
> The rest of the UI layer and several major server features (the assignment
> engine, MIS, admin console, dashboards) are **not built yet**. Nothing is
> _dropped_ — `DROP` is not an
> available decision until the post-parity pruning scan — but "not dropped" is
> not "done", and this file keeps that distinction visible.

Last reconciled: 2026-07-25.

---

## The acid test: the 18 Cloud Functions + 5 triggers (inventory §18)

This is the sharpest measure of server-side parity, because it enumerates every
distinct backend behaviour the legacy app has.

| Legacy function                        | Rebuild status             | Where / why                                                                                                                                                                                          |
| -------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getExam`                              | ✅ **done**                | `POST /v1/exam/start`                                                                                                                                                                                |
| `submitExam`                           | ✅ **done**                | `POST /v1/exam/submit` — server-side scoring, throttle, verify-on-pass                                                                                                                               |
| `saveAccountantKyc`                    | ✅ **done**                | `PUT /v1/accountants/me/kyc` — envelope-encrypted                                                                                                                                                    |
| `saveBusinessKyc`                      | ✅ **done**                | `PUT /v1/businesses/me/org-pan`                                                                                                                                                                      |
| `adminSetVerification`                 | ✅ **done**                | `POST /v1/accountants/:uid/verify` (admin) + exam-driven path                                                                                                                                        |
| `onAssignmentCompleted` (payout)       | ◐ **partial**              | payout **maths** ported (`domain/payout.ts`); the trigger that mints the ledger on completion needs the assignment lifecycle                                                                         |
| `syncPublicAccountant` (public mirror) | ◑ **superseded**           | replaced by serialise-on-read (`accountants.serializers.ts`) — no separate mirror collection. Deliberate design change, recorded in `FIRESTORE-RULES-PARITY.md`                                      |
| `createRazorpayOrder`                  | ◐ **partial**              | Razorpay `createOrder` built (`platform/payments.ts`, dummy creds); the order-for-an-assignment call site awaits the assignment engine                                                               |
| `confirmAssignmentPayment`             | ◐ **partial**              | replaced by webhook-as-source-of-truth — `POST /v1/payments/webhook` (HMAC verify + idempotency) is built; confirm→paid-assignment wiring awaits the assignment engine                               |
| `createBooking`                        | ⛔ **blocked**             | booking engine — spec §18 Q1 (bookings vs assignments)                                                                                                                                               |
| `updateBookingStatus`                  | ⛔ **blocked**             | booking engine — §18 Q1                                                                                                                                                                              |
| `verifyWorkOtp`                        | **deferred**               | assignment lifecycle (start/complete OTP) — Phase 5                                                                                                                                                  |
| `processClientTemplate`                | ⛔ **blocked**             | MIS dashboard — orphaned by §18 Q1                                                                                                                                                                   |
| `checkPhoneAvailable`                  | ⚠️ **keep-undecided**      | flagged in the inventory as an unauthenticated **enumeration oracle**; a straight port would reproduce a security hole. Candidate for the security review, not an automatic rebuild                  |
| `adminSetExamOverride`                 | **deferred**               | admin console — Phase 5                                                                                                                                                                              |
| `adminResetExam`                       | **deferred**               | admin console — Phase 5                                                                                                                                                                              |
| `adminSetBlocked`                      | ◐ **partial**              | the `blocked` field exists and is **enforced** on every request; the admin _action to set it_ is not built (audit log + admin console)                                                               |
| `adminResolveBooking`                  | ⛔ **blocked**             | booking dispute override — §18 Q1                                                                                                                                                                    |
| `adminDeleteProfile`                   | ⚠️ **deferred, high-care** | the irreversible cascade delete. Deferred deliberately: it needs the audit-log snapshot, DPDP anonymisation (§6.8), and every collection it touches to exist first. **Must not be rebuilt casually** |
| `adminApproveDocs`                     | **deferred**               | document scrutiny — Phase 5                                                                                                                                                                          |
| `onReviewCreated` (rating aggregation) | **deferred**               | reviews — Phase 5                                                                                                                                                                                    |
| `onAssignmentPosted` (codes + notify)  | ⛔ **blocked**             | assignment lifecycle + notifications                                                                                                                                                                 |
| `onAssignmentAssigned` (notify)        | ⛔ **blocked**             | assignment lifecycle + notifications                                                                                                                                                                 |

**Tally: 5 done, 3 partial/superseded, 13 deferred/blocked, 2 flagged for review.**
Roughly a quarter of the backend behaviours are built. That is expected for the
phase reached — and it is the honest number.

Legend: **done** · **partial** (some of it built) · **superseded** (a better
design replaces it) · **deferred** (a later phase, named) · **blocked** (waiting
on a §18 product decision) · **keep-undecided** (carried forward, fate deferred
to the pruning scan).

---

## By inventory section

| §   | Area                      | Status              | Note                                                                                                                                                                               |
| --- | ------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §1  | System map                | n/a                 | descriptive                                                                                                                                                                        |
| §2  | Roles & permissions       | ✅ enforced         | 3 roles, admin out-of-band, re-checked from Mongo per request                                                                                                                      |
| §3  | Routing table             | ◐ API only          | 20+ `/v1/*` endpoints; the client route table is Phase 5                                                                                                                           |
| §4  | Auth & onboarding         | ◐ accountant done   | token/role/blocked gate + **OTP sign-in screen + role bootstrap built, walked E2E**; business-side onboarding pending                                                              |
| §5  | Business dashboard        | ⛔ not built        | Phase 5; browse marketplace blocked on §18 Q2                                                                                                                                      |
| §6  | Accountant dashboard      | ◐ register+terminal | profile **register screen + verified terminal built, walked E2E** (born-verified from the exam pass); KYC screen next, dashboard tabs Phase 5                                      |
| §7  | Assignment engine         | ◐ pure logic        | pricing/SOP/coupon ported + golden-verified; wizard + lifecycle Phase 5, UI blocked on §18 Q1                                                                                      |
| §8  | Booking engine            | ⛔ blocked          | §18 Q1                                                                                                                                                                             |
| §9  | Financial dashboard (MIS) | ⛔ blocked          | orphaned by §18 Q1; `parseTemplate.js` not ported                                                                                                                                  |
| §10 | Compliance calendar       | ◐ data+storage      | 23 obligations ported + golden-verified; `config/complianceOverrides` r/w done; screen Phase 5                                                                                     |
| §11 | Qualifying exam           | ✅ built+walked     | bank, engine, routes, throttle, verify-on-pass **+ the timed exam screen (30s/no-back/idempotent submit), walked E2E**                                                             |
| §12 | Payments & payouts        | ◐ infra built       | rates + payout maths ported; **Razorpay port/adapter + webhook (HMAC verify + idempotency) built, dummy creds**; order-create→paid-assignment wiring awaits the assignment engine  |
| §13 | Notifications             | ◐ built (dummy)     | **3-channel ports (SMTP/WhatsApp/MSG91) + delivery log + allSettled fan-out, wired to `accountant_verified`**; real sends await creds; assignment-posted fan-out awaits the engine |
| §14 | Keiri chatbot             | ◐ KB ported         | 12-entry KB in the contract; the Claude-backed chat + lead tool Phase 5 (spec §D15)                                                                                                |
| §15 | Admin console             | ◐ 3 endpoints       | services/config writes + lead list + verify; the console UI and most admin actions Phase 5                                                                                         |
| §16 | Public marketing site     | ◐ copy ported       | marketing copy in the contract; the Next.js pages Phase 4                                                                                                                          |
| §17 | Data model                | ◐ 7 of 22           | users, leads, services, config, accountants, businesses, exam*, audit; the rest per-domain                                                                                         |
| §18 | Cloud Functions           | see table above     | 5 done                                                                                                                                                                             |
| §19 | Reference data            | ✅ **12 of 12**     | **all hand-curated assets ported**                                                                                                                                                 |
| §20 | Dead / unreachable code   | ◑ tracked           | all 14 items `KEEP-UNDECIDED`; `ComplianceOverridesEditor` backend now exists                                                                                                      |
| §22 | Keiritech site            | ↗ separate          | its own repo/session (user's call)                                                                                                                                                 |

---

## What guarantees nothing is lost

The concern this file exists to answer — _"are we skipping features?"_ — is
handled structurally, not by memory:

1. **`FEATURE-INVENTORY.md` is the contract.** 23 sections cataloguing every
   screen, route, function, collection and dataset. If it is in there and not in
   the rebuild, the rebuild is not done — by definition.
2. **`PARITY-CHECKLIST.md` forces a decision per section.** A phase is complete
   only when every row it touches has a status _and_ a decision with who/when.
3. **`DROP` is not an available decision.** Everything not built is `PORT`,
   `REBUILD`, `DEFER` or `KEEP-UNDECIDED` — carried forward, never removed,
   until one dedicated post-parity pruning scan adjudicates with full context.
4. **`FIRESTORE-RULES-PARITY.md` tracks the security layer** rule by rule —
   which of the two lines of defence have actually been rebuilt.

So: features are being **deferred in the open**, with a named blocker and a
phase, not skipped. This file is the running total of that.

## The load-bearing blocker

Most of what is `⛔ blocked` traces to one unmade product decision: **spec §18
Q1, bookings vs assignments.** It gates the booking engine, the assignment
lifecycle, the MIS dashboard, and everything downstream of them. Until it is
settled, those cannot be built without risking building the wrong one. It is
the single highest-leverage thing the user can unblock.
