import { describe, expect, it } from "vite-plus/test";
import { pageScriptTag } from "./page-script";

describe("page script tag", () => {
  it("names the served script on this computer and carries the token", () => {
    expect(pageScriptTag(48100, "abc123")).toBe('<script src="http://127.0.0.1:48100/v1/capture/page-context/sdk.js" data-token="abc123"></script>');
  });

  it("is missing while the server has no port or no token", () => {
    expect(pageScriptTag(0, "abc123")).toBeUndefined();
    expect(pageScriptTag(48100, "")).toBeUndefined();
  });
});
