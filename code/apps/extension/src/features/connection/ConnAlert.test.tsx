import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { click, installDom, mount, text } from "../../testing/dom";
import { ConnAlert } from "./ConnAlert";

const g = globalThis as Record<string, unknown>;
const writeText = vi.fn(() => Promise.resolve());
const readText = vi.fn(() => Promise.resolve("secret"));

beforeEach(() => {
  installDom();
  writeText.mockClear();
  readText.mockClear();
  Object.defineProperty(g, "navigator", { value: { userAgent: "node", clipboard: { writeText, readText } }, configurable: true });
});
afterEach(() => Reflect.deleteProperty(g, "navigator"));

describe("ConnAlert", () => {
  test("the banner holds a Copy details button and no Details toggle", async () => {
    const m = await mount(<ConnAlert st="offline" port={47321} health={null} />);
    const banner = m.root.querySelector(".lm-banner")!;
    expect(text(banner.querySelector(".lm-banner__body"))).toBe("Open Speak Kit and this page reconnects by itself. If it doesn't, download the app first.");
    const buttons = [...banner.querySelectorAll("button")];
    expect(buttons.map(text)).toEqual(["Copy details"]);
    expect(buttons[0]!.className).toBe("lm-btn lm-btn--secondary");
    expect(m.root.querySelector("[aria-expanded]")).toBeNull();
    expect(m.root.querySelector("code")).toBeNull();
    expect(m.root.querySelector(".op-alert")!.getAttribute("role")).toBeNull();
    await m.unmount();
  });

  test("a click copies the diagnostic line and confirms with Copied; the clipboard is never read", async () => {
    const m = await mount(<ConnAlert st="offline" port={47321} health={null} />);
    await click(m.root.querySelector(".lm-banner button"));
    expect(writeText).toHaveBeenCalledWith("app-not-running · 127.0.0.1:47321");
    expect(text(m.root.querySelector(".lm-banner button"))).toBe("Copied");
    expect(readText).not.toHaveBeenCalled();
    await m.unmount();
  });

  test("a rejected token copies the error detail the app gave", async () => {
    const m = await mount(<ConnAlert st="token" port={4242} health={{ ok: false, error: "token-rejected", detail: "401 Unauthorized" }} />);
    expect(text(m.root.querySelector(".lm-banner__body"))).toBe("Speak Kit rejected the pairing token saved in this browser. Paste a new token below, or re-pair from scratch.");
    await click(m.root.querySelector(".lm-banner button"));
    expect(writeText).toHaveBeenCalledWith("token-rejected · 127.0.0.1:4242 · 401 Unauthorized");
    await m.unmount();
  });
});
