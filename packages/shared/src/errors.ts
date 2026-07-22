/**
 * Stable, machine-readable error codes shared by the API and every client.
 *
 * Clients branch on `code`, never on `message` — messages are user-facing copy
 * and may be reworded or translated without warning.
 */
export const ERROR_CODES = Object.freeze({
  // Generic
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL: "INTERNAL",

  // Assignments
  ASSIGNMENT_ALREADY_CLAIMED: "ASSIGNMENT_ALREADY_CLAIMED",
  ASSIGNMENT_NOT_OPEN: "ASSIGNMENT_NOT_OPEN",
  EXPERIENCE_TIER_NOT_MET: "EXPERIENCE_TIER_NOT_MET",
  SOP_INCOMPLETE: "SOP_INCOMPLETE",
  MIS_REQUIRED: "MIS_REQUIRED",

  // Payments
  PAYMENT_VERIFICATION_FAILED: "PAYMENT_VERIFICATION_FAILED",
  PAYMENT_AMOUNT_MISMATCH: "PAYMENT_AMOUNT_MISMATCH",
  COUPON_ALREADY_USED: "COUPON_ALREADY_USED",

  // Accountants
  ACCOUNTANT_NOT_VERIFIED: "ACCOUNTANT_NOT_VERIFIED",
  PROFILE_BLOCKED: "PROFILE_BLOCKED",

  // Exams
  EXAM_ATTEMPTS_EXHAUSTED: "EXAM_ATTEMPTS_EXHAUSTED",
  EXAM_SESSION_INVALID: "EXAM_SESSION_INVALID",
} as const);

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** The exact JSON body the API returns for any error. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
  };
}

const CODE_VALUES = new Set<string>(Object.values(ERROR_CODES));

/** Narrows an unknown response body to `ApiErrorBody`. */
export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null) return false;
  const { error } = value as { error?: unknown };
  if (typeof error !== "object" || error === null) return false;
  const { code, message, requestId } = error as Record<string, unknown>;
  return (
    typeof code === "string" &&
    CODE_VALUES.has(code) &&
    typeof message === "string" &&
    typeof requestId === "string"
  );
}
