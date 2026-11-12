import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("electron", () => ({ net: { fetch: () => "browser-engine-fetch" } }));

import { net } from "electron";
import { modelFetch } from "./download-fetch";

describe("modelFetch", () => {
  it("is the browser engine's fetch in the app, so the system proxy and certificate store apply", () => {
    expect(modelFetch(false)).toBe(net.fetch);
  });
  it("is left to the engine's default (plain fetch) in a test run, where servers are local", () => {
    expect(modelFetch(true)).toBeUndefined();
  });
});
