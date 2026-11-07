import { parseHTML } from "linkedom";
import { expect, test } from "vite-plus/test";
import { setPlatformEarly } from "./platform-attr";

test("sets data-platform on the root at once when it exists", () => {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  setPlatformEarly(document as unknown as Document, "win32");
  expect(document.documentElement.getAttribute("data-platform")).toBe("win32");
});

test("sets it when the root appears later", async () => {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  document.documentElement.remove();
  const observers: (() => void)[] = [];
  const g = globalThis as { MutationObserver?: unknown };
  const saved = g.MutationObserver;
  g.MutationObserver = class {
    constructor(cb: () => void) {
      observers.push(cb);
    }
    observe() {}
    disconnect() {}
  };
  try {
    setPlatformEarly(document as unknown as Document, "darwin");
    document.append(document.createElement("html"));
    observers.forEach((cb) => cb());
    expect(document.documentElement.getAttribute("data-platform")).toBe("darwin");
  } finally {
    g.MutationObserver = saved;
  }
});
