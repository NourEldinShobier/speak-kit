import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { Page } from "@playwright/test";
import { launch, type Launched } from "./harness";

const running: Launched[] = [];
const start = async (config: object = {}) => {
  const l = await launch({ config: { setupDone: true, setupSkipped: false, preferredPort: 0, ...config }, env: { SPEAKKIT_TEST: "1" } });
  running.push(l);
  return l;
};
afterEach(async () => {
  await Promise.all(running.splice(0).map((l) => l.cleanup()));
});
const stored = (l: Launched) => JSON.parse(readFileSync(path.join(l.userData, "config.json"), "utf8"));
const openSettings = async (p: Page, page: string) => {
  await p.getByRole("link", { name: "Settings" }).click();
  await p.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: page, exact: true }).click();
};

/** Runs in the page: controls that have no accessible name. */
const unnamed = (p: Page) =>
  p.evaluate(() => {
    const sel = "button, input:not([type=hidden]), select, textarea, [role=switch], [role=checkbox], [role=combobox], [role=slider], [role=tab], [role=radio]";
    const name = (e: Element) => {
      const by = e.getAttribute("aria-labelledby");
      return (
        e.getAttribute("aria-label") ||
        (by &&
          by
            .split(" ")
            .map((i) => document.getElementById(i)?.textContent ?? "")
            .join("")
            .trim()) ||
        (e as HTMLInputElement).labels?.[0]?.textContent?.trim() ||
        e.getAttribute("title") ||
        e.textContent?.trim() ||
        ""
      );
    };
    return [...document.querySelectorAll(sel)].filter((e) => !name(e)).map((e) => e.outerHTML.slice(0, 120));
  });

describe("Experiments page", () => {
  it("switches a lab through its named switch and keeps it in the settings file", async () => {
    const l = await start();
    await openSettings(l.page, "Experiments");
    await l.page.getByRole("heading", { name: "Experiments" }).waitFor();
    const sw = l.page.getByRole("switch", { name: "Hide the tray icon" });
    expect(await sw.getAttribute("aria-checked")).toBe("false");
    await sw.click();
    await vi.waitFor(() => expect(stored(l).labs).toEqual({ "hide-tray-icon": true, "verbose-log": false }));
    expect(await l.page.getByRole("switch", { name: "Hide the tray icon" }).getAttribute("aria-checked")).toBe("true");
  });

  it("shows developer labs only after the developer switch is on", async () => {
    const l = await start();
    await openSettings(l.page, "Experiments");
    expect(await l.page.getByRole("switch", { name: "Detailed log" }).count()).toBe(0);
    await l.page.getByRole("switch", { name: "Show developer experiments" }).click();
    await l.page.getByRole("switch", { name: "Detailed log" }).waitFor();
  });

  it("keeps the stable test keys of the lab switches", async () => {
    const l = await start({ showDeveloperLabs: true });
    await openSettings(l.page, "Experiments");
    expect(await l.page.locator("[data-testid^=lab-]").evaluateAll((e) => e.map((x) => x.getAttribute("data-testid")))).toEqual(["lab-hide-tray-icon", "lab-verbose-log"]);
  });
});

describe("closing the window without a tray icon", () => {
  const close = (l: Launched) => l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
  const visible = (l: Launched) => l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible());

  it.skipIf(process.platform === "darwin")("asks whether to quit, because nothing could bring a hidden window back", async () => {
    const l = await start({ labs: { "hide-tray-icon": true } });
    await close(l);
    await l.page.getByText("Quit Speak Kit?").waitFor();
    expect(await l.page.getByRole("button", { name: "Cancel" }).count()).toBe(1);
    expect(await l.page.getByRole("button", { name: "Keep running in tray" }).count()).toBe(0);
    expect(await visible(l)).toBe(true);
    await l.page.getByRole("button", { name: "Cancel" }).click();
    expect(await visible(l)).toBe(true);
  });

  it("with the tray icon shown, closing hides the window to the tray as before", async () => {
    const l = await start();
    await close(l);
    await vi.waitFor(async () => expect(await visible(l)).toBe(false));
  });
});

describe("every control has a name", () => {
  it("on each Settings page", async () => {
    const l = await start({ showDeveloperLabs: true });
    await l.page.getByRole("link", { name: "Settings" }).click();
    const nav = l.page.getByRole("navigation", { name: "Settings" });
    const links = await nav.getByRole("link").allInnerTexts();
    expect(links.length).toBe(14);
    for (const name of links) {
      await nav.getByRole("link", { name, exact: true }).click();
      await l.page
        .getByRole("heading", { name: new RegExp(`^${name}`) })
        .first()
        .waitFor();
      expect({ page: name, unnamed: await unnamed(l.page) }).toEqual({ page: name, unnamed: [] });
    }
  });
});
