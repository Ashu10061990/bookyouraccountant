import { describe, expect, it, vi } from "vitest";
import { createNotifier, render } from "./notifications.js";
import type {
  ChannelMessage,
  ChannelSender,
  DeliveryRecord,
  NotifyInput,
} from "./notifications.js";

/**
 * `createNotifier` is exercised entirely with fakes — no real SMTP/HTTP, no
 * database. That is the point of injecting both `ChannelSender` and
 * `logDelivery`: the fan-out, the templating and the delivery-log shape are
 * all provable without a network or a Mongo instance. The repository's
 * `logDelivery` against real Mongo is exercised by N3's integration test.
 */

const NOW = new Date("2026-07-25T10:00:00.000Z");

const VERIFIED_INPUT: NotifyInput = {
  event: "accountant_verified",
  to: { email: "asha@example.com", phone: "+911234567890" },
  data: { name: "Asha" },
};

/** A `ChannelSender` that records every message it was asked to send. */
function fakeSender(
  channel: ChannelSender["channel"],
  behavior: "succeeds" | "throws" = "succeeds",
): { sender: ChannelSender; calls: ChannelMessage[] } {
  const calls: ChannelMessage[] = [];
  return {
    calls,
    sender: {
      channel,
      send(msg: ChannelMessage): Promise<void> {
        calls.push(msg);
        if (behavior === "throws") {
          return Promise.reject(new Error(`${channel} adapter unreachable`));
        }
        return Promise.resolve();
      },
    },
  };
}

/** A fake `logDelivery` that just remembers every row it was handed. */
function fakeLog(): {
  logDelivery: (record: DeliveryRecord) => Promise<void>;
  records: DeliveryRecord[];
} {
  const records: DeliveryRecord[] = [];
  return { records, logDelivery: (record) => Promise.resolve(void records.push(record)) };
}

describe("createNotifier — fan-out", () => {
  it("attempts every configured channel with a handle, and logs one sent row each", async () => {
    const email = fakeSender("email");
    const sms = fakeSender("sms");
    const log = fakeLog();

    const notifier = createNotifier([email.sender, sms.sender], {
      logDelivery: log.logDelivery,
      now: () => NOW,
    });

    await notifier.notify(VERIFIED_INPUT);

    expect(email.calls).toEqual([
      {
        to: "asha@example.com",
        subject: "You're verified on BookYourAccountant",
        body: "Hi Asha, you're verified on BookYourAccountant — your profile is live to businesses.",
      },
    ]);
    expect(sms.calls).toEqual([
      {
        to: "+911234567890",
        body: "Hi Asha, you're verified on BookYourAccountant — your profile is live to businesses.",
      },
    ]);

    expect(log.records).toHaveLength(3);
    expect(log.records).toContainEqual({
      event: "accountant_verified",
      channel: "email",
      to: "asha@example.com",
      status: "sent",
      createdAt: NOW,
    });
    expect(log.records).toContainEqual({
      event: "accountant_verified",
      channel: "sms",
      to: "+911234567890",
      status: "sent",
      createdAt: NOW,
    });
  });

  it("logs a skipped row for a channel with no configured sender, without calling anything", async () => {
    const email = fakeSender("email");
    const sms = fakeSender("sms");
    const log = fakeLog();

    // No whatsapp sender in the list at all — the N2 adapter is simply absent
    // because WA_TOKEN/WA_PHONE_ID are unset, exactly as it will be until
    // real creds land.
    const notifier = createNotifier([email.sender, sms.sender], {
      logDelivery: log.logDelivery,
      now: () => NOW,
    });

    await notifier.notify(VERIFIED_INPUT);

    expect(log.records).toContainEqual({
      event: "accountant_verified",
      channel: "whatsapp",
      to: "+911234567890",
      status: "skipped",
      error: "channel not configured",
      createdAt: NOW,
    });
  });

  it("logs a skipped row when the channel's recipient handle is missing, and never calls that sender", async () => {
    const email = fakeSender("email");
    const log = fakeLog();

    const notifier = createNotifier([email.sender], {
      logDelivery: log.logDelivery,
      now: () => NOW,
    });

    await notifier.notify({
      event: "accountant_verified",
      to: { phone: "+911234567890" }, // no email handle
      data: { name: "Asha" },
    });

    expect(email.calls).toHaveLength(0);
    expect(log.records).toContainEqual({
      event: "accountant_verified",
      channel: "email",
      to: "",
      status: "skipped",
      error: "no recipient handle",
      createdAt: NOW,
    });
  });
});

describe("createNotifier — Promise.allSettled isolation", () => {
  it("a throwing sender does not stop the other channel's send, and both get a delivery-log row", async () => {
    const email = fakeSender("email", "throws");
    const sms = fakeSender("sms");
    const log = fakeLog();

    const notifier = createNotifier([email.sender, sms.sender], {
      logDelivery: log.logDelivery,
      now: () => NOW,
    });

    await notifier.notify(VERIFIED_INPUT);

    // The other channel was attempted regardless of email's rejection.
    expect(sms.calls).toHaveLength(1);

    const emailRecord = log.records.find((record) => record.channel === "email");
    const smsRecord = log.records.find((record) => record.channel === "sms");

    expect(emailRecord?.status).toBe("failed");
    expect(emailRecord?.error).toContain("email adapter unreachable");
    expect(smsRecord).toEqual({
      event: "accountant_verified",
      channel: "sms",
      to: "+911234567890",
      status: "sent",
      createdAt: NOW,
    });
  });
});

describe("createNotifier — notify never rejects", () => {
  it("resolves even when a sender throws and logDelivery also throws", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      const email = fakeSender("email", "throws");
      const notifier = createNotifier([email.sender], {
        logDelivery: () => Promise.reject(new Error("mongo is down")),
        now: () => NOW,
      });

      await expect(notifier.notify(VERIFIED_INPUT)).resolves.toBeUndefined();

      // Not a silent catch — the delivery-log failure is warned about, not swallowed.
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("resolves even when logDelivery throws but every send succeeds", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      const email = fakeSender("email");
      const notifier = createNotifier([email.sender], {
        logDelivery: () => Promise.reject(new Error("mongo is down")),
        now: () => NOW,
      });

      await expect(notifier.notify(VERIFIED_INPUT)).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("render", () => {
  it("interpolates {name} from the data map", () => {
    expect(render("Hi {name}!", { name: "Asha" })).toBe("Hi Asha!");
  });

  it("leaves an unresolved token untouched rather than guessing", () => {
    expect(render("Hi {name}, ref {code}", { name: "Asha" })).toBe("Hi Asha, ref {code}");
  });

  it("stringifies a numeric value", () => {
    expect(render("{count} pending", { count: 3 })).toBe("3 pending");
  });
});
