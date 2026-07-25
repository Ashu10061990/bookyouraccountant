# Slice: Notifications (email / WhatsApp / SMS) — §13

**Date:** 2026-07-25 · **Branch:** `slice/aws-storage-and-integrations`

**Goal.** Port the legacy 3-channel notification system (§13): SMTP email, Meta
WhatsApp Cloud API, MSG91 SMS — behind a **port**, fanned out with
`Promise.allSettled` (one channel failing never blocks the others), **every send
logged** to a delivery-log collection. Wire it to a real event that exists today:
**an accountant becomes verified → a "you're live" welcome notification.** Built
with **dummy creds**; each channel adapter is gated on its own secrets and, when
unconfigured, **records a `skipped` delivery-log row rather than crashing**.

---

## Architecture (ports + gated adapters, like `Cipher`/`StoragePort`)

**`apps/api/src/platform/notifications.ts`** — the port + fan-out:

```ts
export type NotificationChannel = "email" | "whatsapp" | "sms";
/** A rendered, channel-ready message. */
export interface ChannelMessage {
  to: string;
  subject?: string;
  body: string;
}
/** One delivery attempt over one channel. Throws on failure. */
export interface ChannelSender {
  readonly channel: NotificationChannel;
  send(msg: ChannelMessage): Promise<void>;
}

export interface NotifyInput {
  event: string; // e.g. "accountant_verified"
  to: { email?: string; phone?: string }; // recipient handles
  data: Record<string, string | number>; // template variables
}
export interface Notifier {
  notify(input: NotifyInput): Promise<void>;
}
```

- **`createNotifier(senders, deps)`** — for each channel whose recipient handle is
  present (email needs `to.email`; whatsapp/sms need `to.phone`), render the
  message from the event template, call the matching `ChannelSender`, and
  **`Promise.allSettled`** them. Each settled result → one `notifications`
  delivery-log row (`sent` | `failed` with the error | `skipped` when no handle /
  no configured sender). `notify` itself never rejects — a notification failing
  must never fail the business action that triggered it.
- **Templates** — a small `NOTIFICATION_TEMPLATES[event]` map → per-channel
  subject/body with `{name}`-style interpolation. First event:
  `accountant_verified` ("You're verified on BookYourAccountant — your profile is
  live to businesses.").
- **Gating** — a channel with incomplete config is simply **absent from the
  `senders` list**; `notify` then logs `skipped (channel not configured)` for it.
  No silent success, no crash.

**Delivery log** — `apps/api/src/modules/notifications/notifications.schema.ts`,
collection `notifications` (legacy §17): `{ event, channel, to, status, error?,
metadata?, createdAt }`. Written by the server, read by admin (a future console).
Mirrors the append-only `audit` module's shape.

## Adapters (`apps/api/src/platform/notification-adapters.ts`)

- **`smtpEmail(config)`** over `nodemailer` — `SMTP_HOST/USER/PASS`.
- **`whatsappCloud(config)`** — `fetch` to `graph.facebook.com/v20.0/{WA_PHONE_ID}/messages` with the approved template, bearer `WA_TOKEN`.
- **`msg91Sms(config)`** — `fetch` to MSG91's flow API with `MSG91_AUTHKEY/TEMPLATE/SENDER`.

Each is built only when its secrets are present (else omitted from the fan-out).
Non-2xx / transport error → throw (the fan-out records `failed`, logs, moves on).

## Wiring — the real consumer

In the accountants service, at the **two moments an accountant becomes verified** —
the born-verified `createProfile` path and the admin `verifyAccountant` path — call
`notifier.notify({ event: "accountant_verified", to: { email: doc.email, phone: doc.phone }, data: { name: doc.name } })` **after the verification commits**, fire-and-forget (the `Notifier` swallows+logs its own failures). Inject the `Notifier` into the accountants service like `Cipher` is.

## Env (dummy now)

`SMTP_HOST/SMTP_USER/SMTP_PASS`, `WA_TOKEN/WA_PHONE_ID`, `MSG91_AUTHKEY/MSG91_TEMPLATE/MSG91_SENDER` — all optional; a channel is enabled only when its full set is present. `.env.example` documents them; `.env` leaves them unset (⇒ all channels `skipped`, logged).

## Tasks

- **N1** (TDD): `notifications.ts` port + `createNotifier` fan-out + templates + the `notifications` delivery-log schema/repo. Unit/integration with **fake `ChannelSender`s**: assert fan-out hits every channel with a handle, `Promise.allSettled` isolation (one throwing sender still lets the others through and still logs all three), `skipped` when a handle/sender is absent, and that `notify` never rejects. A delivery-log row per attempt.
- **N2**: the 3 real adapters + env additions + `app.ts` wiring (build the `senders` list from configured secrets; `createNotifier`). Adapter unit tests with `fetch`/nodemailer mocked (URL/headers/body shape; non-2xx → throw).
- **N3**: wire `accountant_verified` into the accountants service (both verify paths), fire-and-forget; integration test that a born-verified registration writes the expected `notifications` rows (all `skipped` with no creds, using injected fake senders to assert `sent`). Verify + fold into the program docs.

**Dummy-creds verification.** N1/N3 are fully testable offline (fake senders). N2's adapters are unit-tested against mocked transports. A real send (actual email/WhatsApp/SMS) awaits real creds — at which point the same code path lights up with no changes.
