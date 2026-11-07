import { describe, expect, it } from "vite-plus/test";
import { classifyUrl } from "./urls";

describe("classifyUrl", () => {
  it.each([
    ["https://example.com/a", "ok"],
    ["http://localhost:3000/", "ok"],
    ["file:///C:/notes/a.html", "file"],
    ["file:///C:/notes/a.pdf", "unreadable"],
    ["https://example.com/paper.PDF", "unreadable"],
    ["chrome://extensions", "unreadable"],
    ["chrome-extension://abc/popup.html", "unreadable"],
    ["about:blank", "unreadable"],
    ["view-source:https://example.com", "unreadable"],
    ["https://chromewebstore.google.com/detail/x", "unreadable"],
    ["https://chrome.google.com/webstore/detail/x", "unreadable"],
    ["https://chrome.google.com/other", "ok"],
    [undefined, "unreadable"],
    ["", "unreadable"],
  ])("%s -> %s", (url, expected) => {
    expect(classifyUrl(url)).toBe(expected);
  });
});
