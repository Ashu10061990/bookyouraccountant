/**
 * Notifications — spec `docs/specs/2026-07-25-notifications-slice.md`.
 *
 * ## Why a port
 *
 * Three real channels (SMTP email, WhatsApp Cloud API, MSG91 SMS) sit behind
 * one `Notifier`, mirroring `platform/crypto.ts`'s `Cipher` and
 * `platform/storage.ts`'s `StoragePort`: a narrow interface, real adapters
 * behind it (added in N2's `notification-adapters.ts`), and — because a
 * channel with no configured secrets must never look like a silent success —
 * every attempt, including the ones that never reach a real adapter, is
 * written to the delivery log.
 *
 * `createNotifier` never imports Mongoose. It takes `logDelivery` as an
 * injected dependency, the same way services take `Cipher`/`StoragePort`
 * rather than reaching for a model directly (spec §-layering: repositories
 * are the only Mongoose importers). That keeps this file pure logic,
 * provable entirely with fakes — see `notifications.test.ts` — with no
 * database required. The real `logDelivery`
 * (`modules/notifications/notifications.repository.ts`) is wired in at
 * composition time, once N2/N3 build the `senders` list from configured env.
 */

/** The three channels §13 ports from the legacy system. */
export const NOTIFICATION_CHANNELS = ["email", "whatsapp", "sms"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** A rendered, channel-ready message. */
export interface ChannelMessage {
  to: string;
  subject?: string;
  body: string;
}

/** One delivery attempt over one channel. Throws on failure — the fan-out below is what catches it. */
export interface ChannelSender {
  readonly channel: NotificationChannel;
  send(msg: ChannelMessage): Promise<void>;
}

export interface NotifyInput {
  /** e.g. `"accountant_verified"` — looked up in `NOTIFICATION_TEMPLATES`. */
  event: string;
  /** Recipient handles. A channel with no matching handle is logged `skipped`, never sent. */
  to: { email?: string; phone?: string };
  /** Template variables, interpolated into the event's per-channel body/subject. */
  data: Record<string, string | number>;
}

export interface Notifier {
  /**
   * Fans the event out to every configured channel with a recipient handle.
   * Never rejects — a notification failing must never fail the business
   * action that triggered it.
   */
  notify(input: NotifyInput): Promise<void>;
}

declare module "fastify" {
  interface FastifyInstance {
    /**
     * The `Notifier` `app.ts` composes at boot: `createNotifier` over
     * `buildNotificationSenders(env)` (N2's `notification-adapters.ts`) — a
     * real channel adapter per fully-configured secret set, an empty one
     * otherwise (every attempt then logs `skipped`). Always present once
     * `buildApp` has run; decorated once, at composition time, the same way
     * `storage` is in `platform/storage.ts`.
     */
    notifier: Notifier;
  }
}

/** The outcome of one channel's delivery attempt. */
export const DELIVERY_STATUSES = ["sent", "failed", "skipped"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** One row of the `notifications` delivery log — see `notifications.schema.ts`. */
export interface DeliveryRecord {
  event: string;
  channel: NotificationChannel;
  /** The recipient handle used, or that would have been used; `""` when none was available. */
  to: string;
  status: DeliveryStatus;
  /** Why a `failed` or `skipped` attempt ended that way. Absent for `sent`. */
  error?: string;
  createdAt: Date;
}

/**
 * Event → per-channel subject/body. `{token}`-style placeholders are filled
 * from `NotifyInput.data` by `render`. A channel absent from an event's entry
 * (whatsapp/sms below carry no `subject` — that field means nothing on
 * those channels) is "this event has nothing to say here", not a
 * misconfiguration; `createNotifier` treats it the same as a `skipped` send.
 */
export const NOTIFICATION_TEMPLATES: Record<
  string,
  Partial<Record<NotificationChannel, { subject?: string; body: string }>>
> = {
  accountant_verified: {
    email: {
      subject: "You're verified on BookYourAccountant",
      body: "Hi {name}, you're verified on BookYourAccountant — your profile is live to businesses.",
    },
    whatsapp: {
      body: "Hi {name}, you're verified on BookYourAccountant — your profile is live to businesses.",
    },
    sms: {
      body: "Hi {name}, you're verified on BookYourAccountant — your profile is live to businesses.",
    },
  },
};

const TOKEN_PATTERN = /\{(\w+)\}/g;

/** Replaces every `{key}` in `template` with `data[key]`; a token with no match is left as-is. */
export function render(template: string, data: Record<string, string | number>): string {
  return template.replace(TOKEN_PATTERN, (token: string, key: string): string => {
    const value = data[key];
    return value === undefined ? token : String(value);
  });
}

function handleFor(channel: NotificationChannel, to: NotifyInput["to"]): string | undefined {
  return channel === "email" ? to.email : to.phone;
}

interface SkipPlan {
  kind: "skip";
  channel: NotificationChannel;
  to: string;
  error: string;
}

interface SendPlan {
  kind: "send";
  channel: NotificationChannel;
  to: string;
  sender: ChannelSender;
  message: ChannelMessage;
}

type ChannelPlan = SkipPlan | SendPlan;

/**
 * Decides one channel's fate ahead of any I/O: skip with a reason, or a
 * ready-to-send message. Kept synchronous and side-effect-free so `notify`'s
 * only asynchronous work is the sends themselves (via `Promise.allSettled`)
 * and the delivery-log writes — nothing here is a path that could make
 * `notify` reject.
 */
function planChannel(
  channel: NotificationChannel,
  input: NotifyInput,
  sendersByChannel: ReadonlyMap<NotificationChannel, ChannelSender>,
): ChannelPlan {
  const handle = handleFor(channel, input.to);
  const to = handle ?? "";

  const sender = sendersByChannel.get(channel);
  if (sender === undefined) {
    return { kind: "skip", channel, to, error: "channel not configured" };
  }
  if (handle === undefined) {
    return { kind: "skip", channel, to, error: "no recipient handle" };
  }

  const template = NOTIFICATION_TEMPLATES[input.event]?.[channel];
  if (template === undefined) {
    return { kind: "skip", channel, to, error: "no template for channel" };
  }

  const message: ChannelMessage = {
    to: handle,
    body: render(template.body, input.data),
    ...(template.subject === undefined ? {} : { subject: render(template.subject, input.data) }),
  };

  return { kind: "send", channel, to, sender, message };
}

/**
 * Builds a `Notifier` over a fixed set of channel senders.
 *
 * A channel simply absent from `senders` (N2: an adapter is only built when
 * its secrets are configured) is not an error: it is logged `skipped`. The
 * same goes for a recipient with no handle for that channel. Neither case
 * reaches a `ChannelSender`, so neither can throw.
 *
 * The channels that DO have both a sender and a handle are attempted with
 * `Promise.allSettled`, so one channel's adapter throwing (a real SMTP/API
 * failure) can never stop the others from being attempted — and, because
 * `allSettled` never itself rejects, this is also what lets `notify` learn
 * every outcome without wrapping each send in its own `try`/`catch`.
 */
export function createNotifier(
  senders: ChannelSender[],
  deps: { logDelivery: (record: DeliveryRecord) => Promise<void>; now: () => Date },
): Notifier {
  const sendersByChannel = new Map(senders.map((sender) => [sender.channel, sender] as const));

  return {
    async notify(input: NotifyInput): Promise<void> {
      // The one place this file allows itself an unqualified backstop: every
      // step below is written to avoid throwing (Promise.allSettled never
      // rejects; each logDelivery call is caught on its own, right below),
      // but "notify never rejects" is a promise every caller relies on — a
      // notification failing must never fail the business action that
      // triggered it. If something here misbehaves in a way this file did
      // not anticipate, that is a bug worth a loud `console.warn`, never a
      // rejected promise.
      try {
        const createdAt = deps.now();
        const plans = NOTIFICATION_CHANNELS.map((channel) =>
          planChannel(channel, input, sendersByChannel),
        );

        const skipRecords: DeliveryRecord[] = plans
          .filter((plan): plan is SkipPlan => plan.kind === "skip")
          .map((plan) => ({
            event: input.event,
            channel: plan.channel,
            to: plan.to,
            status: "skipped",
            error: plan.error,
            createdAt,
          }));

        const sendPlans = plans.filter((plan): plan is SendPlan => plan.kind === "send");
        const outcomes = await Promise.allSettled(
          sendPlans.map((plan) => plan.sender.send(plan.message)),
        );

        const sentOrFailedRecords: DeliveryRecord[] = sendPlans.map((plan, index) => {
          const outcome = outcomes[index];

          if (outcome === undefined) {
            // Unreachable: Promise.allSettled returns exactly one result per
            // input promise, in order. Handled rather than asserted only
            // because noUncheckedIndexedAccess cannot know that.
            return {
              event: input.event,
              channel: plan.channel,
              to: plan.to,
              status: "failed",
              error: "missing settle outcome",
              createdAt,
            };
          }

          if (outcome.status === "fulfilled") {
            return {
              event: input.event,
              channel: plan.channel,
              to: plan.to,
              status: "sent",
              createdAt,
            };
          }

          const reason: unknown = outcome.reason;
          return {
            event: input.event,
            channel: plan.channel,
            to: plan.to,
            status: "failed",
            error: String(reason),
            createdAt,
          };
        });

        for (const record of [...skipRecords, ...sentOrFailedRecords]) {
          try {
            await deps.logDelivery(record);
          } catch (err) {
            // The documented exception to "never swallow": a failed
            // delivery-log write must not stop the other channels' rows from
            // being written, and must not turn a notification failure into a
            // request failure — but it must never vanish silently either.
            console.warn(
              `notifications: failed to write delivery log (event=${record.event}, channel=${record.channel})`,
              err,
            );
          }
        }
      } catch (err) {
        console.warn(`notifications: notify failed unexpectedly (event=${input.event})`, err);
      }
    },
  };
}
