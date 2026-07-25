import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildNotificationSenders,
  msg91Sms,
  smtpEmail,
  whatsappCloud,
} from "./notification-adapters.js";
import type { ChannelMessage } from "./notifications.js";
import { testEnv } from "../test/env.js";

/**
 * Every real transport is mocked here — nodemailer's `createTransport` (SMTP)
 * and the global `fetch` (WhatsApp Cloud / MSG91). These tests assert the
 * *shape* of what each adapter sends (URL, headers, JSON body) and that a
 * transport failure — a rejected `sendMail`, a non-2xx HTTP response —
 * propagates as a rejection out of `send`. That propagation is exactly what
 * `createNotifier`'s `Promise.allSettled` fan-out (see `notifications.test.ts`)
 * turns into a `failed` delivery-log row rather than an unhandled rejection.
 */

// `vi.mock` factories are hoisted above every import in this file, so they
// cannot close over a plain `const` declared below them — `vi.hoisted` runs
// first and gives the factory (and the tests) a shared handle on the same
// mock function `smtpEmail`'s lazy `import("nodemailer")` will receive.
const { createTransportMock } = vi.hoisted(() => ({ createTransportMock: vi.fn() }));

vi.mock("nodemailer", () => ({
  createTransport: createTransportMock,
}));

const MESSAGE: ChannelMessage = {
  to: "asha@example.com",
  subject: "You're verified on BookYourAccountant",
  body: "Hi Asha, you're verified.",
};

describe("smtpEmail", () => {
  beforeEach(() => {
    createTransportMock.mockReset();
  });

  it("creates a transport from host/user/pass and sends to/subject/text", async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    createTransportMock.mockReturnValue({ sendMail });

    const sender = smtpEmail({ host: "smtp.example.com", user: "u@example.com", pass: "s3cret" });
    await sender.send(MESSAGE);

    expect(sender.channel).toBe("email");
    expect(createTransportMock).toHaveBeenCalledWith({
      host: "smtp.example.com",
      auth: { user: "u@example.com", pass: "s3cret" },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: "u@example.com",
      to: "asha@example.com",
      subject: "You're verified on BookYourAccountant",
      text: "Hi Asha, you're verified.",
    });
  });

  it("propagates a rejection from sendMail", async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error("smtp connection refused"));
    createTransportMock.mockReturnValue({ sendMail });

    const sender = smtpEmail({ host: "smtp.example.com", user: "u@example.com", pass: "s3cret" });

    await expect(sender.send(MESSAGE)).rejects.toThrow("smtp connection refused");
  });
});

describe("whatsappCloud", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("posts to the Graph API with bearer auth and the text-message body shape", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    const sender = whatsappCloud({ token: "tok-123", phoneId: "phone-456" });
    expect(sender.channel).toBe("whatsapp");

    await sender.send({ to: "+911234567890", body: "You're verified." });

    expect(fetchMock).toHaveBeenCalledWith("https://graph.facebook.com/v20.0/phone-456/messages", {
      method: "POST",
      headers: { authorization: "Bearer tok-123", "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: "+911234567890",
        type: "text",
        text: { body: "You're verified." },
      }),
    });
  });

  it("throws when the API responds non-2xx", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    const sender = whatsappCloud({ token: "tok", phoneId: "phone" });

    await expect(sender.send({ to: "+911234567890", body: "x" })).rejects.toThrow(
      "WhatsApp send failed: 401",
    );
  });
});

describe("msg91Sms", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("posts to the flow API with the authkey header and the recipients body shape", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    const sender = msg91Sms({ authKey: "key-1", template: "tmpl-1", sender: "BYADEV" });
    expect(sender.channel).toBe("sms");

    await sender.send({ to: "+911234567890", body: "You're verified." });

    expect(fetchMock).toHaveBeenCalledWith("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: { authkey: "key-1", "content-type": "application/json" },
      body: JSON.stringify({
        template_id: "tmpl-1",
        sender: "BYADEV",
        recipients: [{ mobiles: "+911234567890" }],
      }),
    });
  });

  it("throws when the API responds non-2xx", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    const sender = msg91Sms({ authKey: "key", template: "tmpl", sender: "BYADEV" });

    await expect(sender.send({ to: "+911234567890", body: "x" })).rejects.toThrow(
      "MSG91 send failed: 401",
    );
  });
});

describe("buildNotificationSenders", () => {
  it("returns no senders when nothing is configured", () => {
    expect(buildNotificationSenders(testEnv())).toEqual([]);
  });

  it("builds the email sender when the full SMTP set is present", () => {
    const senders = buildNotificationSenders(
      testEnv({ SMTP_HOST: "smtp.example.com", SMTP_USER: "u@example.com", SMTP_PASS: "s3cret" }),
    );

    expect(senders.map((sender) => sender.channel)).toEqual(["email"]);
  });

  it("omits the email sender when the SMTP set is only partially configured", () => {
    // SMTP_HOST alone, no SMTP_USER/SMTP_PASS — a partial set must never
    // build a half-configured adapter that would only fail at send time.
    const senders = buildNotificationSenders(testEnv({ SMTP_HOST: "smtp.example.com" }));

    expect(senders).toEqual([]);
  });
});
