# `firestore.rules` → service-guard parity register

> **The question this file answers:** the legacy app has two independent lines
> of defence — application code and `firestore.rules`. The Node API deletes the
> second. **Which of those rules have actually been rebuilt?**
>
> Source: `../BYA& Keiri/bya-new/firestore.rules` (375 lines, 20 collections).
> Spec §6.1 requires every rule to become an explicit service-layer guard with
> a test asserting the **denial**.

## How to read this

| Column               | Meaning                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------- |
| **Legacy condition** | The rule as written in `firestore.rules`                                                  |
| **Guard**            | Where it now lives                                                                        |
| **Test**             | The test asserting the denial                                                             |
| **Verified**         | Whether the guard was mutation-tested — broken, the test confirmed to fail, then restored |

`PENDING <phase>` means the collection has no API surface yet. It is **not** a
decision to drop the rule; it is a rule not yet due.

**A `DONE` row with no `Verified` mark is not done.** An untested guard and an
unenforced guard look identical from a green test run — that is the shape of
every defect found in Phase 1.

---

## Rebuilt in Phase 3

| Collection               | Legacy condition                                       | Guard                                                                     | Test                     | Verified                   |
| ------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------ | -------------------------- |
| `users` create           | `isOwner(userId) && role in ['business','accountant']` | `users.service.ts` `assertSelfAssignable` + `createUserSchema` role union | denials §1               | ✅ both layers, separately |
| `users` create           | `isOwner(userId)` — uid from path                      | uid taken from verified token; body has no `firebaseUid` field            | denials §2               | ✅                         |
| `users` update           | `role in ['business','accountant']`                    | `assertSelfAssignable` in `updateOwnUser`                                 | denials §3               | ✅ both layers             |
| `users` read             | `isOwner(userId) \|\| isAdmin()`                       | only `/v1/users/me` exists — no route takes another uid                   | denials §2               | ✅                         |
| `users` delete           | `isAdmin()`                                            | no delete route exists                                                    | —                        | n/a — see note 1           |
| `config` read            | `isSignedIn()`                                         | `requireAuth` on `GET /v1/config/:name`                                   | denials §4               | ✅                         |
| `config` write           | `isAdmin()`                                            | `requireRole("admin")` on `PUT /v1/config/:name`                          | denials §5               | ✅                         |
| `services` read          | `if true` (public)                                     | no guard, deliberately                                                    | services.test            | ✅ asserted public         |
| `services` write         | `isAdmin()`                                            | `requireRole("admin")` on POST and PATCH                                  | denials §6               | ✅                         |
| `leads` read             | `isOwner(uid) \|\| isAdmin()`                          | `/v1/leads/me` keyed to token; `/v1/leads` is admin-only                  | denials §7, §9           | ✅                         |
| `leads` create/update    | `isOwner(uid)`                                         | `upsertOwnLead(tokenUid, …)`; body uid ignored                            | denials §8               | ✅                         |
| `leads` delete           | `isAdmin()`                                            | no delete route — see note 2                                              | —                        | n/a                        |
| `accountants` read       | `isSignedIn() \|\| resource.data.verified == true`     | `viewFor` — public gets safe fields only                                  | accountants, serializers | ✅ A2, A3                  |
| `accountants` create     | anti-self-verify on verified/examScore/rating          | `assertNoServerOwnedFields` + schema + repo-from-constants                | accountants              | ✅ A1                      |
| `accountants` update     | `!diff.hasAny(['verified','examScore',…])`             | same three-layer guard on PATCH                                           | accountants              | ✅ A1                      |
| `accountants/kyc` read   | `isOwner \|\| isAdmin()`                               | admin-only decrypt; owner sees masked only                                | accountants.service      | ✅ A4                      |
| `accountants/kyc` write  | `if false` (server-only)                               | sealed server-side; sealed fields unreachable by client                   | accountants              | ✅ C1                      |
| `businesses` read        | `isOwner \|\| isAdmin()`                               | `getForViewer` ownership; no listing route exists                         | businesses.service       | ✅ B1                      |
| `businesses` create      | `isOwner && data.uid == bizId`                         | uid from token; `assertNoServerOwnedFields`                               | businesses               | ✅                         |
| `businesses` update      | `!('orgPanEncrypted' in diff)`                         | org PAN unreachable from profile path — own endpoint                      | businesses               | ✅ B2                      |
| `adminActions` (audit)   | `isAdmin()` read, `if false` write                     | append-only by construction; transactional                                | audit                    | ✅ D1                      |
| `examCenters` read/write | `if true` / `isAdmin()`                                | data ported to `@bya/shared`; no route yet                                | —                        | PENDING Phase 5            |

## New guards with no legacy equivalent

Firestore's SDK verified identity itself, so the rules file never had to say
"do not believe the client about who it is". A JSON API does.

| Threat                                                                                    | Guard                                                              | Test        | Verified |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------- | -------- |
| Forged, expired or malformed bearer token                                                 | `verifyToken` in `platform/auth.ts`                                | denials §10 | ✅       |
| Verifier's failure reason leaking as a forgery oracle                                     | error never forwarded to the client                                | denials §10 | ✅       |
| A `role` field in the request body                                                        | schemas strip unknown keys; role only ever read from Mongo         | denials §11 | ✅       |
| **Stale admin claim** — a token still says `role: admin` for up to an hour after demotion | role re-read from Mongo on every request; `claims` never consulted | denials §12 | ✅       |
| Blocked user with a valid token                                                           | `requireAuth` rejects `blocked: true` before any handler           | denials §12 | ✅       |
| A route wiring `requireRole` without `requireAuth`                                        | fails closed with 401                                              | auth.test   | ✅       |

---

## Not yet rebuilt

Every remaining rule, with the phase that owes it. Nothing here is dropped —
per the retention policy, `DROP` is not an available decision until the
post-parity pruning scan.

| Collection                         | Rules to rebuild                                                                                                                                                                                                                                                                                              | Owed by                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `assignments`                      | the largest rule in the file: read by party/admin/open-to-accountants; **first-accept-wins** `open → assigned`; experience-tier gate; field-level `hasOnly` allowlists; coupon-only client create with `total == days * rate`; completion requires progress 100 **and** a MIS upload **and** OTP verification | Phase 5                                              |
| `assignmentSecrets`                | read by owning business or admin; write denied to all                                                                                                                                                                                                                                                         | Phase 5                                              |
| `counters/assignments`             | increment by exactly 1, never jump or rewind                                                                                                                                                                                                                                                                  | Phase 5                                              |
| `bookings` + `bookings/*/workflow` | server-only create/update; per-party approval gates; `details` frozen at create; ARN only after approval                                                                                                                                                                                                      | **Blocked on spec §18 Q1** (bookings vs assignments) |
| `payouts`                          | read by owning accountant or admin; admin update restricted to `status`/`utr`/`paidAt`/`note`; create and delete denied to all                                                                                                                                                                                | Phase 6                                              |
| `examSessions`                     | **no client access at all** — holds the answer key                                                                                                                                                                                                                                                            | Phase 5                                              |
| `examAttempts`                     | read owner-or-admin; write denied to all                                                                                                                                                                                                                                                                      | Phase 5                                              |
| `examAppointments`                 | accountant creates own with `status: 'Booked'`; update denied                                                                                                                                                                                                                                                 | Phase 5 (§20 dead code — decision pending)           |
| `reviews`                          | business creates own, rating 1–5 integer; update denied                                                                                                                                                                                                                                                       | Phase 5                                              |
| `serviceRequests`                  | business creates own; read/update/delete admin-only                                                                                                                                                                                                                                                           | Phase 5                                              |
| `notifications`                    | admin read; write denied to all                                                                                                                                                                                                                                                                               | Phase 5                                              |
| `clientDashboards`                 | read owner, admin, or the uploading accountant; write denied to all                                                                                                                                                                                                                                           | Phase 5 (§18 Q1)                                     |
| `publicAccountants`                | world read; write denied to all                                                                                                                                                                                                                                                                               | Phase 4                                              |
| catch-all                          | `match /{document=**} { allow read, write: if false; }`                                                                                                                                                                                                                                                       | see note 3                                           |

---

## Notes

1. **No delete routes exist yet.** The legacy rules allow admin deletion of
   users and leads. Deletion is DPDP-relevant (spec §6.8: statutory records
   survive account deletion, and "delete user" anonymises rather than removes),
   so it belongs with the erasure path and the §6.7 audit log — not bolted onto
   a CRUD endpoint. Recorded as `DEFER`, not `DROP`.

2. Same reasoning for `leads` delete.

3. **The default-deny catch-all has no direct equivalent, and that is a real
   difference.** In Firestore, a collection nobody wrote a rule for is
   inaccessible. In a Node API, a route nobody wrote simply 404s — which is
   equivalent — but a route written _without_ a guard is wide open. The
   structural replacement is that guards are wired per route, so the analogue
   of the catch-all is discipline plus this register. Worth revisiting: a
   default `onRoute` hook that refuses to register any `/v1/*` route lacking an
   explicit preHandler would restore fail-closed-by-default properly. Recorded
   in `OPEN-ITEMS.md`.

## How guards were verified

`apps/api/scripts/verify-guards.sh` breaks each guard, runs the test that
should catch it, and asserts that test **fails** — then restores the file from
git. Two guards were decorative until that pass and were fixed:

- The service-layer role check was shadowed by the schema, so route tests
  passed with it deleted.
- Denial 7 observed the happy path instead of attempting the attack, so a
  handler honouring `?uid=` still passed.

Re-run it after touching any guard:

```bash
bash apps/api/scripts/verify-guards.sh
```

Note it rebuilds nothing: `@bya/shared` resolves to `dist/`, so a mutation to
shared source needs `pnpm --filter @bya/shared build` before the API sees it.
The first run of this script reported a false pass for exactly that reason.
