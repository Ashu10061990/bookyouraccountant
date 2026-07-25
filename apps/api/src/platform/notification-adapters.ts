import type { Env } from "./env.js";
import type { ChannelMessage, ChannelSender } from "./notifications.js";

/**
 * The three real channel adapters behind the `Notifier` port — spec
 * `docs/specs/2026-07-25-notifications-slice.md`. Each is a thin wrapper
 * around one transport (SMTP via nodemailer, two HTTP APIs via `fetch`):
 * build the request, send it, and let a transport failure propagate as a
 * thrown error — the fan-out in `createNotifier` (`platform/notifications.ts`)
 * is what turns that into a `failed` delivery-log row rather than a crash.
 *
 * ## Why `nodemailer` is imported lazily, inside `send`
 *
 * Mirrors `firebaseVerifier` in `platform/auth.ts`: importing the SDK at
 * module load time would make every test file and every boot — including
 * ones that never send an email — pay to initialise it. A dynamic `import()`
 * defers that cost to the first (and only ever, if SMTP is unconfigured) real
 * send. `whatsappCloud`/`msg91Sms` need no such treatment: they use the
 * global `fetch` (Node 20+), which costs nothing to "import" because it isn't
 * one.
 *
 * ## Why `buildNotificationSenders` lives here, not in `app.ts`
 *
 * It is the one place that knows both the adapters above and the env keys
 * that gate them, so it is the natural single seam to unit-test the gating
 * decision (`notification-adapters.test.ts`) independently of `app.ts`
 * booting a whole Fastify instance.
 */

/** `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` — all three or the channel is omitted. */
export function smtpEmail(config: { host: string; user: string; pass: string }): ChannelSender {
  return {
    channel: "email",
    async send(msg: ChannelMessage): Promise<void> {
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.createTransport({
        host: config.host,
        auth: { user: config.user, pass: config.pass },
      });

      await transport.sendMail({
        from: config.user,
        to: msg.to,
        subject: msg.subject,
        text: msg.body,
      });
    },
  };
}

/** `WA_TOKEN` / `WA_PHONE_ID` — Meta's WhatsApp Cloud API, plain-text message. */
export function whatsappCloud(config: { token: string; phoneId: string }): ChannelSender {
  return {
    channel: "whatsapp",
    async send(msg: ChannelMessage): Promise<void> {
      const res = await fetch(`https://graph.facebook.com/v20.0/${config.phoneId}/messages`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: msg.to,
          type: "text",
          text: { body: msg.body },
        }),
      });

      if (!res.ok) {
        throw new Error(`WhatsApp send failed: ${res.status}`);
      }
    },
  };
}

/** `MSG91_AUTHKEY` / `MSG91_TEMPLATE` / `MSG91_SENDER` — MSG91's flow API. */
export function msg91Sms(config: {
  authKey: string;
  template: string;
  sender: string;
}): ChannelSender {
  return {
    channel: "sms",
    async send(msg: ChannelMessage): Promise<void> {
      const res = await fetch("https://control.msg91.com/api/v5/flow/", {
        method: "POST",
        headers: {
          authkey: config.authKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          template_id: config.template,
          sender: config.sender,
          recipients: [{ mobiles: msg.to }],
        }),
      });

      if (!res.ok) {
        throw new Error(`MSG91 send failed: ${res.status}`);
      }
    },
  };
}

/**
 * Builds the fan-out list for `createNotifier` from configured env: one
 * `ChannelSender` per channel whose FULL secret set is present. A channel
 * with a partial set (e.g. `SMTP_HOST` but no `SMTP_PASS`) is treated exactly
 * like an absent one — omitted here, not half-built — so `createNotifier`
 * logs it `skipped (channel not configured)` rather than an adapter
 * surfacing a confusing runtime error for a value nobody meant to set.
 */
export function buildNotificationSenders(env: Env): ChannelSender[] {
  const senders: ChannelSender[] = [];

  if (env.SMTP_HOST !== undefined && env.SMTP_USER !== undefined && env.SMTP_PASS !== undefined) {
    senders.push(smtpEmail({ host: env.SMTP_HOST, user: env.SMTP_USER, pass: env.SMTP_PASS }));
  }

  if (env.WA_TOKEN !== undefined && env.WA_PHONE_ID !== undefined) {
    senders.push(whatsappCloud({ token: env.WA_TOKEN, phoneId: env.WA_PHONE_ID }));
  }

  if (
    env.MSG91_AUTHKEY !== undefined &&
    env.MSG91_TEMPLATE !== undefined &&
    env.MSG91_SENDER !== undefined
  ) {
    senders.push(
      msg91Sms({
        authKey: env.MSG91_AUTHKEY,
        template: env.MSG91_TEMPLATE,
        sender: env.MSG91_SENDER,
      }),
    );
  }

  return senders;
}
