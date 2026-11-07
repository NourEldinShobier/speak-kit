import { describe, expect, it } from "vite-plus/test";
import { ERROR_CODES } from "./api";

describe("ERROR_CODES", () => {
  it("lists every code the API can return, once each", () => {
    expect([...ERROR_CODES]).toEqual([
      "app-not-running",
      "token-rejected",
      "engine-not-ready",
      "page-unreadable",
      "file-access",
      "synthesis-failed",
      "version-mismatch",
      "invalid-request",
      "forbidden",
      "busy",
      "engine-unavailable",
      "clip-rejected",
      "not-found",
    ]);
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });
});
