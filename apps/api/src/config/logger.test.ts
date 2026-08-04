import { Writable } from "node:stream";
import { pino } from "pino";
import { describe, expect, it } from "vitest";
import { REDACTED, buildLoggerOptions } from "./logger.js";

/** Captures everything a pino instance writes, as parsed JSON lines. */
function captureLogs(): { stream: Writable; lines: () => Record<string, unknown>[] } {
  const raw: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      raw.push(chunk.toString());
      callback();
    },
  });
  return {
    stream,
    lines: () =>
      raw
        .join("")
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

function loggerFor(sink: Writable) {
  return pino(buildLoggerOptions({ LOG_LEVEL: "info", NODE_ENV: "test" }), sink);
}

describe("buildLoggerOptions", () => {
  // These assertions are deliberately written as "the secret is ABSENT", not
  // "the redaction config has N paths". A typo'd redact path produces output
  // that looks identical to a working one — the only check that can fail when
  // the config breaks is one that searches the emitted bytes for the secret.
  it.each([
    ["pan", "ABCDE1234F"],
    ["aadhaar", "1234 5678 9012"],
    ["phone", "+919876543210"],
    ["bankAccount", "50100123456789"],
    ["ifsc", "HDFC0001234"],
    ["idToken", "eyJhbGciOiJSUzI1NiJ9.payload.signature"],
    ["password", "hunter2"],
    ["panEncrypted", "AQICAHh0Y2lwaGVydGV4dA=="],
  ])("removes %s from the emitted line", (field, secret) => {
    const sink = captureLogs();
    loggerFor(sink.stream).info({ [field]: secret }, "profile updated");

    const emitted = JSON.stringify(sink.lines());
    expect(emitted).not.toContain(secret);
    expect(emitted).toContain(REDACTED);
  });

  // Two distinct mechanisms protect credentials in headers, and they are
  // tested separately so that neither can quietly stop working behind the
  // other. The `req` serializer never emits headers at all; the redact paths
  // catch a header object logged by hand anywhere else.
  it("never emits request headers, so the bearer token cannot leak via req", () => {
    const sink = captureLogs();
    const token = "Bearer eyJhbGciOiJSUzI1NiJ9.realtoken.sig";

    loggerFor(sink.stream).info(
      { req: { method: "GET", url: "/v1/users/me", headers: { authorization: token } } },
      "request",
    );

    const emitted = JSON.stringify(sink.lines());
    expect(emitted).not.toContain("realtoken");
    // The serializer drops headers wholesale rather than redacting them, so
    // there is deliberately no [Redacted] marker here. The useful fields survive.
    expect(emitted).toContain("/v1/users/me");
  });

  it("redacts a header object logged directly rather than through req", () => {
    const sink = captureLogs();

    loggerFor(sink.stream).info(
      { headers: { authorization: "Bearer handrolledtoken", cookie: "session=secretsession" } },
      "outbound call",
    );

    const emitted = JSON.stringify(sink.lines());
    expect(emitted).not.toContain("handrolledtoken");
    expect(emitted).not.toContain("secretsession");
    expect(emitted).toContain(REDACTED);
  });

  it("redacts set-cookie on the response", () => {
    const sink = captureLogs();

    loggerFor(sink.stream).info(
      { res: { headers: { "set-cookie": "session=anothersecret; HttpOnly" } } },
      "response",
    );

    expect(JSON.stringify(sink.lines())).not.toContain("anothersecret");
  });

  it("strips the query string, where a PAN ends up the day someone adds a search box", () => {
    const sink = captureLogs();

    loggerFor(sink.stream).info(
      { req: { method: "GET", url: "/v1/accountants?pan=ABCDE1234F" } },
      "request",
    );

    const emitted = JSON.stringify(sink.lines());
    expect(emitted).not.toContain("ABCDE1234F");
    expect(emitted).toContain("/v1/accountants");
  });

  it("redacts PII nested inside a request body", () => {
    const sink = captureLogs();
    loggerFor(sink.stream).info({ body: { pan: "ABCDE1234F", name: "Asha" } }, "kyc submitted");

    const emitted = JSON.stringify(sink.lines());
    expect(emitted).not.toContain("ABCDE1234F");
    // Non-sensitive fields must survive, or the logs stop being useful and
    // people work around them.
    expect(emitted).toContain("Asha");
  });

  it("keeps ordinary fields intact", () => {
    const sink = captureLogs();
    loggerFor(sink.stream).info({ requestId: "req-1", route: "/v1/services" }, "handled");

    const [line] = sink.lines();
    expect(line?.requestId).toBe("req-1");
    expect(line?.route).toBe("/v1/services");
    expect(line?.msg).toBe("handled");
  });

  it("honours the configured level", () => {
    expect(buildLoggerOptions({ LOG_LEVEL: "debug", NODE_ENV: "development" }).level).toBe("debug");
  });
});
