import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { launch, removeDir, type Launched } from "./harness";

const running: Launched[] = [];
const dirs: string[] = [];
const start = async (o: Parameters<typeof launch>[0] = {}) => {
  const l = await launch({ ...o, env: { SPEAKKIT_TEST: "1", ...o.env } });
  running.push(l);
  return l;
};
afterEach(async () => {
  await Promise.all(running.splice(0).map((l) => l.cleanup()));
  await Promise.all(dirs.splice(0).map(removeDir));
});
const DONE = { setupDone: true, setupSkipped: false, preferredPort: 0 };
const hook = (app: ElectronApplication, fn: string, ...a: unknown[]) =>
  app.evaluate((_, [f, args]) => (globalThis as unknown as Record<string, Record<string, (...x: unknown[]) => unknown>>).__speakkit![f as string]!(...(args as unknown[])), [fn, a] as const);

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  b: number;
}
/** Rectangle of the n-th element that matches, rounded to 0.1 px. */
const box = (p: Page, sel: string, nth = 0): Promise<Box> =>
  p.evaluate(
    ([s, n]) => {
      const e = document.querySelectorAll(s as string)[n as number];
      if (!e) throw new Error(`no element for ${s as string}`);
      const r = e.getBoundingClientRect();
      const f = (v: number) => Math.round(v * 10) / 10;
      return { x: f(r.x), y: f(r.y), w: f(r.width), h: f(r.height), r: f(r.right), b: f(r.bottom) };
    },
    [sel, nth] as const,
  );
const style = (p: Page, sel: string, prop: string, nth = 0): Promise<string> =>
  p.evaluate(([s, pr, n]) => getComputedStyle(document.querySelectorAll(s as string)[n as number]!).getPropertyValue(pr as string), [sel, prop, nth] as const);

/** Waits for the finite animations (a dialog scales in) so rectangles are measured at rest. */
const settle = (p: Page) =>
  p.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); // let the style of a freshly opened dialog start its animation
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
/** Height of a row without its 1 px divider (a divider is 1 device pixel: 0.667 CSS px on a 150 % display). */
const rowHeight = async (p: Page, sel: string) => (await box(p, sel)).h - Number.parseFloat(await style(p, sel, "border-top-width"));
const hairline = (p: Page) => p.evaluate(() => 1 / devicePixelRatio);

const openSettings = async (l: Launched, page: string) => {
  await l.page.getByRole("heading", { name: "Home" }).waitFor();
  await l.page.getByRole("link", { name: "Settings" }).click();
  await l.page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: page }).click();
  await l.page.getByRole("heading", { name: page === "Voice" ? "Voice and playback" : page, level: 1 }).waitFor();
};

describe("settings control rows (2.19)", () => {
  it("General: the Language row is 68 high with a 36 px dropdown 16 px from the top, bottom and right; toggle-only cards get 4 px more under the last row", async () => {
    const l = await start({ config: DONE });
    await openSettings(l, "General");
    const sel = await box(l.page, ".lm-select__trigger");
    const row = await box(l.page, ".lm-row:has(.lm-select)");
    expect([row.h, sel.h, sel.y - row.y, row.b - sel.b, row.r - sel.r]).toEqual([68, 36, 16, 16, 16]);
    const startup = await l.page.evaluate(() => {
      const card = [...document.querySelectorAll(".lm-card")].find((c) => c.querySelector(".lm-toggle") && !c.querySelector(".lm-select, .lm-btn, .lm-input"))!;
      return Number.parseFloat(getComputedStyle(card).paddingBottom);
    });
    expect(startup).toBe(4);
  });

  it("Storage: Models, Logs and Delete are 36 px buttons in 68 px rows; Delete is the destructive style (red text on white)", async () => {
    const l = await start({ config: DONE });
    await openSettings(l, "Storage");
    for (const name of ["Models", "Logs"]) expect((await l.page.getByRole("button", { name }).boundingBox())!.height).toBe(36);
    const del = l.page.getByRole("button", { name: "Delete..." });
    await expect.poll(() => del.isEnabled()).toBe(true); // disabled until the sizes are measured
    await settle(l.page);
    expect((await del.boundingBox())!.height).toBe(36);
    expect(await del.evaluate((e) => [getComputedStyle(e).color, getComputedStyle(e).backgroundColor])).toEqual(["rgb(198, 40, 40)", "rgb(255, 255, 255)"]);
    expect(await rowHeight(l.page, ".lm-row:has(.lm-btn--danger)")).toBeCloseTo(68, 1);
    expect(await rowHeight(l.page, ".lm-row:has(.sk-row-actions)")).toBeCloseTo(68, 1);
  });

  it("Voice and Memory: dropdown rows are 68 high", async () => {
    const l = await start({ config: DONE });
    await openSettings(l, "Voice");
    expect((await box(l.page, ".lm-row:has(.lm-select)")).h).toBe(68);
    await l.page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Memory" }).click();
    await l.page.getByRole("heading", { name: "Memory", level: 1 }).waitFor();
    expect((await box(l.page, ".lm-row:has(.lm-select)")).h).toBe(68);
  });
});

describe("voices toolbar (2.18)", () => {
  it("search 264x36 at the left, one 36 px 'Voices: all' dropdown at the right with the five filters in its menu", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("link", { name: "Voices" }).click();
    await l.page.getByRole("heading", { name: "Voices", exact: true }).waitFor();
    await l.page.getByTestId("voices").waitFor();
    const search = await box(l.page, ".sk-voice-search .lm-input");
    const filter = await box(l.page, ".sk-voice-filter .lm-select__trigger");
    const tools = await box(l.page, ".sk-tools");
    expect([search.w, search.h, search.x - tools.x]).toEqual([264, 36, 0]);
    expect([filter.h, tools.r - filter.r]).toEqual([36, 0]);
    expect(await l.page.locator(".lm-seg").count()).toBe(0);
    const trigger = l.page.getByRole("combobox", { name: "Filter voices" });
    expect(await trigger.textContent()).toBe("Voices: all");
    expect(await style(l.page, ".sk-voice-filter .lm-select__trigger", "font-weight")).toBe("500");
    await trigger.click();
    expect(await l.page.getByRole("option").allTextContents()).toEqual(["All", "US English", "UK English", "Female", "Male"]);
    await l.page.getByRole("option", { name: "UK English" }).click();
    expect(await trigger.textContent()).toBe("Voices: UK English");
  });

  it("grade pills have no outline", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("link", { name: "Voices" }).click();
    await l.page.getByTestId("voices").locator(".lm-pill").first().waitFor();
    expect(await style(l.page, ".sk-voice__f .lm-pill", "border-top-width")).toBe("0px");
    expect(await style(l.page, ".sk-voice__f .lm-pill", "box-shadow")).toBe("none");
  });
});

const openLibrary = async (l: Launched) => {
  await l.page.getByRole("heading", { name: "Home" }).waitFor();
  await l.page.getByRole("link", { name: "Library" }).click();
  await l.page.getByRole("heading", { name: "Library" }).waitFor();
  await l.page.evaluate(() => window.speakkitLibrary.importBytes("notes.md", new TextEncoder().encode("# Notes\n\nOne short sentence here. A second sentence follows it.")));
  await l.page.getByRole("link", { name: "Home" }).click();
  await l.page.getByRole("link", { name: "Library" }).click();
  await l.page.getByTestId("doc-row").waitFor();
};

describe("library (2.18)", () => {
  it("the row menu button is a 28 px white button with a 1 px #E5E5E5 ring, radius 8, 16 px from the row's right edge", async () => {
    const l = await start({ config: DONE });
    await openLibrary(l);
    const row = await box(l.page, ".lib-row");
    const kebab = await box(l.page, ".lib-row .lm-btn--icon");
    expect([kebab.w, kebab.h, row.r - kebab.r]).toEqual([28, 28, 16]);
    expect(await style(l.page, ".lib-row .lm-btn--icon", "border-top-color")).toBe("rgb(229, 229, 229)");
    expect(await style(l.page, ".lib-row .lm-btn--icon", "background-color")).toBe("rgb(255, 255, 255)");
    expect(await style(l.page, ".lib-row .lm-btn--icon", "border-top-left-radius")).toBe("8px");
    expect(Number.parseFloat(await style(l.page, ".lib-row .lm-btn--icon", "border-top-width"))).toBeCloseTo(await hairline(l.page), 3);
  });

  it("the New pill text is #1B2230 on the grey fill", async () => {
    const l = await start({ config: DONE });
    await openLibrary(l);
    expect(await style(l.page, ".lib-badge--new", "color")).toBe("rgb(27, 34, 48)");
    expect(await style(l.page, ".lib-badge--new", "background-color")).toBe("rgb(240, 240, 240)");
  });

  it("the drag-and-drop frame is 8 px inside the content panel on all four sides", async () => {
    const l = await start({ config: DONE });
    await openLibrary(l);
    await l.page.evaluate(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(["x"], "a.txt"));
      document.querySelector(".lib-wrap")!.dispatchEvent(new DragEvent("dragenter", { dataTransfer: dt, bubbles: true }));
    });
    await l.page.getByTestId("drop-overlay").waitFor();
    const drop = await box(l.page, ".lib-drop");
    const panel = await box(l.page, ".sk-main");
    expect([drop.x - panel.x, drop.y - panel.y, panel.r - drop.r, panel.b - drop.b]).toEqual([8, 8, 8, 8]);
    expect(await style(l.page, ".lib-drop", "border-top-style")).toBe("dashed");
  });

  it("the sort dropdown is 36 px high", async () => {
    const l = await start({ config: DONE });
    await openLibrary(l);
    expect((await box(l.page, ".lib-bar .lm-select__trigger")).h).toBe(36);
  });

  it("Add pasted text: 36 px voice dropdown at the left of the footer, Cancel, Add and Add and play grouped at the right, 16 px from the right and bottom", async () => {
    const l = await start({ config: DONE });
    await openLibrary(l);
    await l.page.getByRole("button", { name: "Add", exact: true }).click();
    await l.page.getByRole("menuitem", { name: "Paste text" }).click();
    const dialog = l.page.getByRole("dialog", { name: "Add pasted text" });
    await dialog.waitFor();
    await dialog.getByRole("combobox", { name: "Voice" }).waitFor();
    await settle(l.page);
    const d = await box(l.page, ".lm-dialog");
    const voice = await box(l.page, ".lib-foot .lm-select__trigger");
    const play = await box(l.page, ".lib-foot__actions .lm-btn--primary");
    const cancel = await box(l.page, ".lib-foot__actions .lm-btn", 0);
    expect(voice.h).toBe(36);
    expect([voice.x - d.x, d.r - play.r, d.b - play.b]).toEqual([16, 16, 16]);
    expect(cancel.x).toBeGreaterThan(voice.r);
    expect(await dialog.locator(".lib-foot__actions button").allTextContents()).toEqual(["Cancel", "Add", "Add and play"]);
  });
});

const outDir = () => {
  const d = mkdtempSync(path.join(tmpdir(), "speakkit-screens-"));
  dirs.push(d);
  return d;
};
const openExport = async (l: Launched) => {
  await l.page.getByRole("heading", { name: "Home" }).waitFor();
  await l.page.getByRole("button", { name: "New reading" }).click();
  await l.page.getByRole("textbox", { name: "Text to read" }).fill("Exporting is simple. Each sentence is rendered once. Then the file is saved.");
  await l.page.getByRole("button", { name: "Export audio" }).click();
  await l.page.getByRole("dialog", { name: "Export audio" }).waitFor();
};

describe("export (2.19)", () => {
  it("options: Format, bitrate, Voice, File name and Browse are all 36 px high", async () => {
    const dir = outDir();
    const l = await start({ config: { ...DONE, exportPrefs: { format: "mp3", mp3Kbps: 128, folder: dir } } });
    await openExport(l);
    const heights = () =>
      l.page.evaluate(() => [...document.querySelectorAll(".sk-export .lm-select__trigger, .sk-export .lm-input, .sk-export .lm-btn")].map((e) => e.getBoundingClientRect().height));
    await expect.poll(heights).toEqual([36, 36, 36, 36, 36]);
  });

  it("rendering: a full-width 4 px bar (#ECECEC track, #201E25 fill); the sidebar pill has the light ring and a dark progress line", async () => {
    const dir = outDir();
    const l = await start({ config: { ...DONE, exportPrefs: { format: "wav", mp3Kbps: 192, folder: dir } }, env: { SPEAKKIT_FAKE_LATENCY_MS: "700" } });
    await openExport(l);
    await l.page.getByRole("button", { name: "Export", exact: true }).click();
    await l.page.getByTestId("export-progress").waitFor();
    await settle(l.page);
    const body = await box(l.page, ".sk-export__job");
    const bar = await box(l.page, ".sk-export__bar");
    expect([bar.x - body.x, body.r - bar.r, bar.h]).toEqual([0, 0, 4]);
    expect(await style(l.page, ".sk-export__bar", "background-color")).toBe("rgb(236, 236, 236)");
    expect(await style(l.page, ".sk-export__bar .lm-progress__bar", "background-color")).toBe("rgb(32, 30, 37)");
    const dlg = await box(l.page, ".lm-dialog");
    const foot = await box(l.page, ".lm-dialog__foot .lm-btn", 0);
    expect(dlg.b - foot.b).toBe(16);
    await l.page.getByRole("button", { name: "Run in background" }).click();
    await l.page.getByTestId("export-pill").waitFor();
    expect(await style(l.page, ".sk-exportpill__row", "box-shadow")).toContain("rgb(229, 229, 229) 0px 0px 0px 1px");
    expect(await style(l.page, ".sk-exportpill__row .lm-progress__bar", "background-color")).toBe("rgb(32, 30, 37)");
  });
});

describe("mini player (2.19)", () => {
  const openMini = async (l: Launched) => {
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    const win = l.app.waitForEvent("window", { predicate: (w) => w.url().includes("mini.html"), timeout: 15_000 });
    await hook(l.app, "readText", "One short sentence here. A second sentence follows it. A third one ends it.");
    const m = await win;
    await m.getByTestId("mini").waitFor();
    return m;
  };

  it("card 360x112; progress bar 4 px high inset 14 with a dark fill; lock and close level with the title, 14 px from the right edge", async () => {
    const l = await start({ config: DONE, env: { SPEAKKIT_FAKE_LATENCY_MS: "400" } });
    const m = await openMini(l);
    const card = await box(m, ".mini");
    const win = await m.evaluate(() => [innerWidth, innerHeight]);
    expect([card.w, card.h]).toEqual([win[0]! - 48, win[1]! - 48]);
    const bar = await box(m, ".mini__bar");
    expect([bar.x - card.x, card.r - bar.r, bar.h]).toEqual([14, 14, 4]);
    expect(await style(m, ".mini__bar .lm-progress__bar", "background-color")).toBe("rgb(32, 30, 37)");
    const title = await box(m, ".mini__title b");
    const close = await box(m, ".mini__head .lm-btn", 1);
    expect(card.r - close.r).toBe(14);
    expect(Math.abs(close.y + close.h / 2 - (title.y + title.h / 2))).toBeLessThanOrEqual(0.5);
  });

  it("the pause button is two 3 px bars with a 3 px gap", async () => {
    const l = await start({ config: DONE, env: { SPEAKKIT_FAKE_LATENCY_MS: "400" } });
    const m = await openMini(l);
    await m.locator(".mini__pause").waitFor();
    const a = await box(m, ".mini__pause i", 0);
    const b = await box(m, ".mini__pause i", 1);
    expect([a.w, b.w, b.x - a.r]).toEqual([3, 3, 3]);
  });
});
