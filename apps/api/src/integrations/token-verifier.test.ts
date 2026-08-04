import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { ACCESS_TOKEN_TTL_SEC, JWT_ISSUER } from "../constants/index.js";
import { signAccessToken } from "../helpers/jwt.helper.js";
import { jwtVerifier } from "./token-verifier.js";

const SECRET = "test-jwt-secret-0123456789abcdef0123456789abcdef";
const OTHER_SECRET = "another-32-plus-character-secret-that-differs!";

/**
 * The REAL jwt path: real HS256 sign (helpers/jwt.helper.ts) through the real
 * verifier adapter. No fakes, no network, no database.
 */
describe("jwtVerifier", () => {
  it("round-trips a freshly signed token to {uid, phone}", async () => {
    const token = await signAccessToken(
      { authUid: "a".repeat(24), phone: "+919876543210" },
      SECRET,
    );

    const verified = await jwtVerifier(SECRET).verify(token);

    expect(verified.uid).toBe("a".repeat(24));
    expect(verified.phone).toBe("+919876543210");
    expect(verified.claims["iss"]).toBe(JWT_ISSUER);
  });

  it("rejects a tampered token", async () => {
    const token = await signAccessToken({ authUid: "uid-1", phone: "+919876543210" }, SECRET);
    // Flip one character of the signature segment.
    const tampered = token.slice(0, -2) + (token.endsWith("A") ? "B" : "A");

    await expect(jwtVerifier(SECRET).verify(tampered)).rejects.toThrow();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signAccessToken({ authUid: "uid-1", phone: "+919876543210" }, OTHER_SECRET);

    await expect(jwtVerifier(SECRET).verify(token)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const past = new Date(Date.now() - (ACCESS_TOKEN_TTL_SEC + 120) * 1000);
    const token = await signAccessToken({ authUid: "uid-1", phone: "+919876543210" }, SECRET, past);

    await expect(jwtVerifier(SECRET).verify(token)).rejects.toThrow();
  });

  it("rejects a token minted for a different audience", async () => {
    const token = await new SignJWT({ phone: "+919876543210" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("uid-1")
      .setIssuer(JWT_ISSUER)
      .setAudience("someone-else")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode(SECRET));

    await expect(jwtVerifier(SECRET).verify(token)).rejects.toThrow();
  });

  it("rejects a token from a different issuer", async () => {
    const token = await new SignJWT({ phone: "+919876543210" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("uid-1")
      .setIssuer("someone-else")
      .setAudience("bookyouraccountant")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode(SECRET));

    await expect(jwtVerifier(SECRET).verify(token)).rejects.toThrow();
  });

  it("rejects a valid-signature token that carries no subject", async () => {
    const token = await new SignJWT({ phone: "+919876543210" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(JWT_ISSUER)
      .setAudience("bookyouraccountant")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode(SECRET));

    await expect(jwtVerifier(SECRET).verify(token)).rejects.toThrow(/subject/);
  });

  it("rejects an unsigned (alg=none style) token", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: "uid-1", iss: JWT_ISSUER, aud: "bookyouraccountant" }),
    ).toString("base64url");

    await expect(jwtVerifier(SECRET).verify(`${header}.${payload}.`)).rejects.toThrow();
  });
});
