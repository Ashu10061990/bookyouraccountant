import { phoneSchema } from "@bya/shared";
import { z } from "zod";
import { OTP_LENGTH } from "../constants/index.js";

/**
 * Body schemas for the `/v1/auth/*` endpoints.
 *
 * `phone` reuses `@bya/shared`'s `phoneSchema` — the same E.164 rule the
 * user/lead schemas already enforce, so the SPA validates against the exact
 * grammar the API accepts.
 *
 * The OTP pattern is derived from `OTP_LENGTH`, never restated: if the code
 * ever grows a digit, this schema follows the constant.
 */

const otpPattern = new RegExp(`^\\d{${OTP_LENGTH}}$`);

export const otpRequestSchema = z.object({
  phone: phoneSchema,
});

export const otpVerifySchema = z.object({
  phone: phoneSchema,
  otp: z.string().regex(otpPattern, `otp must be exactly ${OTP_LENGTH} digits`),
});

/**
 * Shared by refresh and logout: both act on the opaque refresh token. Bounded
 * above so a client cannot post megabytes into a hashing call — a real token
 * is 43 base64url chars.
 */
export const refreshTokenBodySchema = z.object({
  refreshToken: z.string().min(1).max(512),
});

export type OtpRequestInput = z.infer<typeof otpRequestSchema>;
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
export type RefreshTokenBodyInput = z.infer<typeof refreshTokenBodySchema>;
