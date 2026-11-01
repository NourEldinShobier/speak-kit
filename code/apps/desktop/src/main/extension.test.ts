import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("electron", () => ({ app: { isPackaged: false }, shell: {} }));
const { openExtensionsPage } = await import("./extension");

describe("openExtensionsPage", () => {
  it("uses Chrome when it starts", async () => {
    const run = vi.fn(async () => 0);
    expect(await openExtensionsPage(run)).toBe("chrome");
    expect(run).toHaveBeenCalledWith("chrome", "chrome://extensions");
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("falls back to Edge, then gives up", async () => {
    expect(await openExtensionsPage(async (exe) => (exe === "msedge" ? 0 : 1))).toBe("msedge");
    expect(await openExtensionsPage(async () => 1)).toBeNull();
  });
});
