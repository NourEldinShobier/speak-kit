import { ERROR_CODES } from "@speakkit/protocol";
import { describe, expect, it } from "vite-plus/test";
import { ERROR_TEXT } from "../../features/connection";

describe("error text", () => {
  it("has a sentence for every protocol error code and no other", () => {
    expect(Object.keys(ERROR_TEXT).sort()).toEqual([...ERROR_CODES].sort());
    for (const code of ERROR_CODES) expect(ERROR_TEXT[code], code).toMatch(/\S[.?]$/);
  });
});
