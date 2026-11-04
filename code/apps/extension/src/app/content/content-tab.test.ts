/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test } from "vite-plus/test";
import { base, deliver, engage, sent, st, startPage, contentSession } from "../../testing/content-page";

const { open } = contentSession();
const count = (page: any, sel: string): Promise<number> => page.locator(sel).count();
const surfaces = "[data-sk=launcher-tab],[data-sk=launcher-pill],[data-sk=dock],[data-sk=gutter-play],[data-sk=back-to-current]";

/** A reading in progress with the pill open. */
async function reading(page: any) {
  const doc = await startPage(page);
  await deliver(page, { t: "state", state: st({ docId: doc.docId, url: "http://sk.test/page" }) });
  await page.hover("[data-sk=launcher-tab]");
  await page.waitForSelector("[data-sk=launcher-pill]");
  return doc;
}

describe("close for this tab", () => {
  test("the pill's x stops the reading and removes every surface from this tab", async () => {
    const page = await open();
    await reading(page);
    await page.hover("[data-sk=launcher-close]");
    expect(await page.locator("[data-sk=launcher-tooltip]").textContent()).toBe("Close for this tab");
    await page.click("[data-sk=launcher-close]");
    expect((await sent(page)).filter((m) => m.t === "player").at(-1)).toEqual({ t: "player", command: { cmd: "stop" } });
    await page.waitForFunction((s: string) => !document.querySelector("speakkit-ui")?.shadowRoot?.querySelector(s), surfaces);
    expect(await count(page, "speakkit-ui")).toBe(1);
    expect(await page.evaluate(() => (CSS as any).highlights.get("sk-sentence")?.size ?? 0)).toBe(0);
    await page.context().close();
  });

  test("a closed tab shows no paragraph button and no selection bubble", async () => {
    const page = await open();
    await engage(page);
    await page.hover("#p2");
    await page.waitForSelector("[data-sk=gutter-play]");
    await page.hover("[data-sk=launcher-tab]");
    await page.waitForSelector("[data-sk=launcher-close]");
    await page.click("[data-sk=launcher-close]");
    await page.hover("#p3");
    await page.waitForTimeout(250);
    expect(await count(page, "[data-sk=gutter-play]")).toBe(0);
    await page.evaluate(() => {
      const t = document.getElementById("p3")!.firstChild as Text;
      const r = document.createRange();
      r.setStart(t, 0);
      r.setEnd(t, 26);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
    });
    await page.mouse.up();
    await page.waitForTimeout(250);
    expect(await count(page, "[data-sk=bubble]")).toBe(0);
    await page.context().close();
  });

  test("late states of the closed reading do not bring the UI back; asking for a reading does", async () => {
    const page = await open();
    const doc = await reading(page);
    await page.click("[data-sk=launcher-close]");
    await deliver(page, { t: "state", state: st({ docId: doc.docId, url: "http://sk.test/page" }) });
    await page.waitForTimeout(200);
    expect(await count(page, "[data-sk=launcher-tab]")).toBe(0);
    expect((await deliver(page, { t: "tab-ui", action: "get" })).dismissed).toBe(true);
    await deliver(page, { t: "extract", mode: "page" });
    await page.waitForSelector("[data-sk=launcher-tab]");
    expect((await deliver(page, { t: "tab-ui", action: "get" })).dismissed).toBe(false);
    await page.context().close();
  });

  test("the popup's Show on this page brings the UI back", async () => {
    const page = await open();
    await reading(page);
    await page.click("[data-sk=launcher-close]");
    expect(await deliver(page, { t: "tab-ui", action: "show" })).toEqual({ dismissed: false });
    await page.waitForSelector("[data-sk=launcher-tab]");
    await page.context().close();
  });

  test("Hide for this tab in the More menu closes an idle pill", async () => {
    const page = await open();
    await page.hover("[data-sk=launcher-tab]");
    await page.click("[data-sk=launcher-more]");
    await page.click("[data-sk=menu-hide-tab]");
    await page.waitForFunction(() => !document.querySelector("speakkit-ui")?.shadowRoot?.querySelector("[data-sk=launcher-tab],[data-sk=launcher-pill]"));
    await page.context().close();
  });

  test("a page nobody interacted with reports nothing dismissed", async () => {
    const page = await open(base({ launcher: { enabled: false } }));
    expect(await deliver(page, { t: "tab-ui", action: "get" })).toEqual({ dismissed: false });
    await page.context().close();
  });
});

describe("page lifetime", () => {
  test("a same-document navigation stops the old reading and clears the page", async () => {
    const page = await open();
    await reading(page);
    await page.evaluate(() => history.pushState({}, "", "/other"));
    await page.waitForFunction(() => (window as any).__sent.some((m: any) => m.t === "player" && m.command.cmd === "stop"));
    await page.waitForFunction(() => document.querySelector("speakkit-ui")?.shadowRoot?.querySelector("[data-sk=launcher-tab],[data-sk=launcher-pill]")?.getAttribute("data-state") === "idle");
    await page.context().close();
  });

  test("a hash change is not a new page", async () => {
    const page = await open();
    await reading(page);
    await page.evaluate(() => (location.hash = "#section"));
    await page.waitForTimeout(200);
    expect((await sent(page)).filter((m) => m.t === "player" && m.command.cmd === "stop")).toEqual([]);
    await page.context().close();
  });

  test("another page's running reading is not adopted", async () => {
    const page = await open();
    await page.waitForSelector("[data-sk=launcher-tab]");
    await deliver(page, { t: "state", state: st({ status: "idle" }) });
    expect(await page.locator("[data-sk=launcher-tab]").getAttribute("data-state")).toBe("idle");
    await page.context().close();
  });

  test("after the extension is reloaded under the page the first event removes every element and listener without errors", async () => {
    const page = await open();
    await page.waitForSelector("[data-sk=launcher-tab]");
    await page.evaluate(() => (window as any).__orphan());
    await page.mouse.move(300, 300);
    await page.mouse.move(320, 320);
    await page.waitForFunction(() => !document.querySelector("speakkit-ui"));
    expect(await page.evaluate(() => (window as any).__listeners.length)).toBe(0);
    await page.context().close();
  });
});
