import { describe, expect, it } from "vite-plus/test";
import { tokenRejected } from "./rejection";

describe("tokenRejected", () => {
  it("accepts 401 and 403 whatever the body", () => {
    expect(tokenRejected(401, undefined)).toBe(true);
    expect(tokenRejected(403, {})).toBe(true);
  });

  it("accepts 404 only with the code token-rejected", () => {
    expect(tokenRejected(404, { error: { code: "token-rejected", message: "x" } })).toBe(true);
    expect(tokenRejected(404, { error: { code: "not-found" } })).toBe(false);
    expect(tokenRejected(404, undefined)).toBe(false);
    expect(tokenRejected(404, null)).toBe(false);
    expect(tokenRejected(404, { error: null })).toBe(false);
    expect(tokenRejected(404, "token-rejected")).toBe(false);
  });

  it("does not accept other statuses with that code", () => {
    expect(tokenRejected(500, { error: { code: "token-rejected" } })).toBe(false);
    expect(tokenRejected(200, { error: { code: "token-rejected" } })).toBe(false);
  });
});
