import { describe, expect, it, vi } from "vitest";
import { firebaseVerifier } from "./auth.js";

// We assert the DECISION the verifier makes (projectId-only init + checkRevoked
// flag), by spying on firebase-admin. We never hit the network.
describe("firebaseVerifier option decision", () => {
  it("defaults to checkRevoked: true and a credentialed init", async () => {
    const initializeApp = vi.fn();
    const verifyIdToken = vi.fn().mockResolvedValue({ uid: "u1" });
    vi.doMock("firebase-admin/app", () => ({
      getApps: () => [],
      initializeApp,
      applicationDefault: () => ({ __adc: true }),
    }));
    vi.doMock("firebase-admin/auth", () => ({ getAuth: () => ({ verifyIdToken }) }));

    // Exercises the statically-imported binding itself (not just the
    // dynamically re-imported `fresh` copy below), so a rename or removal of
    // the export fails this line — a stronger guarantee than an import that
    // is merely present, and it also keeps `firebaseVerifier` a used symbol.
    expect(typeof firebaseVerifier).toBe("function");

    const { firebaseVerifier: fresh } = await import("./auth.js");
    await fresh("proj-1").verify("tok");

    expect(initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({ credential: { __adc: true }, projectId: "proj-1" }),
    );
    expect(verifyIdToken).toHaveBeenCalledWith("tok", true);
    vi.resetModules();
    vi.doUnmock("firebase-admin/app");
    vi.doUnmock("firebase-admin/auth");
  });

  it("with checkRevoked:false inits projectId-only (no credential) and skips revocation", async () => {
    const initializeApp = vi.fn();
    const verifyIdToken = vi.fn().mockResolvedValue({ uid: "u2" });
    vi.doMock("firebase-admin/app", () => ({
      getApps: () => [],
      initializeApp,
      applicationDefault: () => ({ __adc: true }),
    }));
    vi.doMock("firebase-admin/auth", () => ({ getAuth: () => ({ verifyIdToken }) }));

    const { firebaseVerifier: fresh } = await import("./auth.js");
    await fresh("proj-2", { checkRevoked: false }).verify("tok");

    expect(initializeApp).toHaveBeenCalledWith({ projectId: "proj-2" });
    expect(verifyIdToken).toHaveBeenCalledWith("tok", false);
    vi.resetModules();
    vi.doUnmock("firebase-admin/app");
    vi.doUnmock("firebase-admin/auth");
  });
});
