# Slice: Payments (Razorpay) — §12, infra-first

**Date:** 2026-07-25 · **Branch:** `slice/aws-storage-and-integrations`

**Goal.** Build the Razorpay payment layer the assignment engine will consume,
behind a **port**, with the two things OPEN-ITEMS mandates before payments are
safe: **webhook-as-source-of-truth** and **idempotency**. Dummy creds now; real
`RAZORPAY_KEY_ID/SECRET` + webhook secret later. The security-critical parts —
HMAC signature verification and idempotent webhook processing — are **pure /
DB-testable offline**, so this slice is fully verifiable without real Razorpay.

**Honest scope.** Payments has **no feature consumer yet** — "create an order for
an assignment" and "confirm payment → mint a paid assignment" belong to the
assignment engine (the next flagship slice the §18 Q1 decision unblocks). So this
slice deliberately builds the **infrastructure**: the port, the adapter, the
webhook endpoint, the idempotency store, and the verification primitives. The
assignment wiring is a documented seam, not dead code pretending to be a feature.

---

## Architecture (port + gated adapter, like the others)

**`apps/api/src/platform/payments.ts`** — port + pure verification:

```ts
export interface CreateOrderInput {
  amountPaise: number;
  receipt: string;
  notes: Record<string, string>;
}
export interface Order {
  id: string;
  amountPaise: number;
  status: string;
  notes: Record<string, string>;
}
export interface PaymentGateway {
  createOrder(input: CreateOrderInput): Promise<Order>;
  fetchOrder(orderId: string): Promise<Order>;
}
/** HMAC-SHA256 of `${orderId}|${paymentId}` with the key secret — the legacy
 * checkout-callback signature check. Pure; constant-time compare. */
export function verifyPaymentSignature(
  secret: string,
  orderId: string,
  paymentId: string,
  signature: string,
): boolean;
/** HMAC-SHA256 of the raw webhook body with the webhook secret. Pure; constant-time. */
export function verifyWebhookSignature(secret: string, rawBody: string, signature: string): boolean;
```

- **`razorpayGateway(config)`** — the real adapter over the `razorpay` SDK (or
  `fetch` to `api.razorpay.com`), gated on `RAZORPAY_KEY_ID`+`RAZORPAY_KEY_SECRET`.
- **`unavailablePaymentGateway()`** — fail-loud 503 fallback (like
  `unavailableCipher`/`unavailableStorage`) when unconfigured.
- Money is **integer paise** (repo rule); `verify*Signature` use `crypto.createHmac`
  - `crypto.timingSafeEqual` (constant-time — a non-constant compare on a MAC is a
    real timing oracle).

## Webhook — source of truth + idempotency

`POST /v1/payments/webhook` (public; authenticated by the **webhook signature**, not a bearer token):

1. Read the **raw body** (needed for HMAC — add a raw-body capture for this route; Fastify parses JSON by default, so register a content-type parser or `@fastify/raw-body` scoped to this route).
2. `verifyWebhookSignature(env.RAZORPAY_WEBHOOK_SECRET, rawBody, header["x-razorpay-signature"])` → 400 on mismatch (never process an unverified webhook).
3. **Idempotency:** each Razorpay event carries an id; insert it into a `paymentEvents` collection with a **unique index on the event id**. If the insert hits E11000 (already seen) → **200, no reprocessing** (a redelivered webhook is a no-op). This is the "webhook-as-source-of-truth" store the assignment engine reads from.
4. Record the event (type, order/payment id, amount, status) in `paymentEvents`. Acting on it (mint a paid assignment) is a documented TODO for the assignment slice — for now the row IS the durable record.

## Env (dummy now)

`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` — all optional; the gateway is `unavailable*` unless key id+secret are present; the webhook 503s (or 400s "not configured") unless the webhook secret is present. `.env.example` documents them; `.env` unset.

## Tasks

- **P1** (TDD): `payments.ts` port + `verifyPaymentSignature` + `verifyWebhookSignature` (pure HMAC + `timingSafeEqual`, tested with **known-good vectors** computed in the test via `crypto` — a correct signature verifies, a tampered one fails, a wrong-length one fails safely) + `unavailablePaymentGateway`. Plus the `paymentEvents` schema/repo with a **unique index on eventId** and a `recordEventOnce(event)` that returns `{ firstTime: boolean }` (E11000 → `firstTime:false`). Unit/integration.
- **P2**: `razorpayGateway` adapter (`razorpay` SDK; `createOrder` in paise, `fetchOrder`) + env + `app.ts` wiring (`unavailable*` unless configured) + `app.decorate("payments", gateway)`. Adapter unit test with the SDK/`fetch` mocked (order-create maps amountPaise→amount, returns normalized `Order`).
- **P3**: `POST /v1/payments/webhook` — raw-body capture, signature verify, idempotent `recordEventOnce`. Integration tests via `buildTestApp`: a correctly-signed webhook → 200 + a `paymentEvents` row; **redelivery of the same event → 200, still exactly one row** (idempotency); a bad signature → 400 + no row; missing webhook secret → 503/400. Verify + fold into the program docs.

**Dummy-creds verification.** All three tasks are fully testable offline: HMAC signing/verification is pure `crypto`; idempotency is a unique-index behaviour against the in-memory Mongo; the adapter is unit-tested against a mocked SDK. A real order-create / live webhook awaits real Razorpay creds — the same code lights up unchanged.
