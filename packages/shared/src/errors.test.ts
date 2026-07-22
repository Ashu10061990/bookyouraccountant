import { describe, expect, it } from "vitest";
import { ERROR_CODES, isApiErrorBody } from "./errors.js";

describe("ERROR_CODES", () => {
  it("exposes the codes clients branch on", () => {
    expect(ERROR_CODES.ASSIGNMENT_ALREADY_CLAIMED).toBe("ASSIGNMENT_ALREADY_CLAIMED");
    expect(ERROR_CODES.NOT_FOUND).toBe("NOT_FOUND");
    expect(ERROR_CODES.FORBIDDEN).toBe("FORBIDDEN");
    expect(ERROR_CODES.INTERNAL).toBe("INTERNAL");
  });

  it("is frozen so codes cannot be mutated at runtime", () => {
    expect(Object.isFrozen(ERROR_CODES)).toBe(true);
  });

  it("maps every key to an identical string value", () => {
    for (const [key, value] of Object.entries(ERROR_CODES)) {
      expect(value).toBe(key);
    }
  });
});

describe("isApiErrorBody", () => {
  it("accepts a well-formed error body", () => {
    expect(
      isApiErrorBody({
        error: { code: "NOT_FOUND", message: "Assignment not found", requestId: "req-1" },
      }),
    ).toBe(true);
  });

  it("rejects an unknown code", () => {
    expect(
      isApiErrorBody({ error: { code: "MADE_UP", message: "x", requestId: "r" } }),
    ).toBe(false);
  });

  it("rejects a missing requestId", () => {
    expect(isApiErrorBody({ error: { code: "NOT_FOUND", message: "x" } })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isApiErrorBody(null)).toBe(false);
    expect(isApiErrorBody("error")).toBe(false);
    expect(isApiErrorBody(undefined)).toBe(false);
  });
});
