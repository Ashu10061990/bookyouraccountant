import { ERROR_CODES } from "@bya/shared";
import { describe, expect, it } from "vitest";
import { AppError, conflict, forbidden, notFound } from "./errors.js";

describe("AppError", () => {
  it("carries a status, a code and a message", () => {
    const err = new AppError(404, ERROR_CODES.NOT_FOUND, "Assignment not found");
    expect(err.status).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("Assignment not found");
  });

  it("is an instance of Error", () => {
    expect(new AppError(500, ERROR_CODES.INTERNAL, "x")).toBeInstanceOf(Error);
  });

  it("stores context for logging without exposing it on the message", () => {
    const err = new AppError(409, ERROR_CODES.CONFLICT, "Already claimed", {
      assignmentId: "a1",
    });
    expect(err.context).toEqual({ assignmentId: "a1" });
    expect(err.message).toBe("Already claimed");
  });

  it("retains a stack trace", () => {
    expect(new AppError(500, ERROR_CODES.INTERNAL, "x").stack).toBeDefined();
  });
});

describe("constructor helpers", () => {
  it("notFound builds a 404", () => {
    const err = notFound("Nope");
    expect(err.status).toBe(404);
    expect(err.code).toBe(ERROR_CODES.NOT_FOUND);
  });

  it("forbidden builds a 403 with a default message", () => {
    const err = forbidden();
    expect(err.status).toBe(403);
    expect(err.message).toBe("You do not have access to this.");
  });

  it("conflict builds a 409 and accepts a specific code", () => {
    const err = conflict("Already claimed", ERROR_CODES.ASSIGNMENT_ALREADY_CLAIMED);
    expect(err.status).toBe(409);
    expect(err.code).toBe(ERROR_CODES.ASSIGNMENT_ALREADY_CLAIMED);
  });
});
