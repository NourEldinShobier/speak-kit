import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { PageScript } from "./PageScript";

describe("page script on the card", () => {
  it("shows the tag without the token, with a button that copies it", () => {
    const html = renderToStaticMarkup(<PageScript port={48101} token="secret-token" />);
    expect(html).toContain("http://127.0.0.1:48101/v1/capture/page-context/sdk.js");
    expect(html).not.toContain("secret-token");
    expect(html).toContain('aria-label="Copy the script tag with your token"');
  });

  it("says the server is not running when there is no port", () => {
    expect(renderToStaticMarkup(<PageScript port={0} token="" />)).toContain("The local server is not running");
  });
});
