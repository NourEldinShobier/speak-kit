/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { ARTICLE_PAGE } from "../../testing/fixtures";
import { launch, type Session } from "../../testing/harness";

let s: Session;
beforeAll(async () => {
  s = await launch();
}, 90000);
afterAll(async () => {
  await s?.close();
});

const launcher = (side: "left" | "right") => ({ launcher: { enabled: true, side, idle: "peek", openOn: "hover", closeDelayMs: 300, widerWhileReading: true, y: 0.42 } });
const open = async (settings: any) => {
  const page = await s.page(ARTICLE_PAGE, { settings });
  page.setDefaultTimeout(5000);
  return page;
};
const warms = async (page: any): Promise<any[]> => (await page.evaluate(() => (window as any).__sent)).filter((m: any) => m.t === "warm");

describe("warming the model before the click", () => {
  test("loading a page does not wake the model", async () => {
    const page = await open(launcher("right"));
    await page.waitForTimeout(600);
    expect(await warms(page)).toEqual([]);
    await page.context().close();
  });

  test("the pointer approaching the launcher edge warms once; moving elsewhere does not", async () => {
    const page = await open(launcher("right"));
    const { width, height } = page.viewportSize()!;
    await page.mouse.move(width / 2, height * 0.42);
    await page.mouse.move(width - 300, height * 0.9);
    expect(await warms(page)).toEqual([]);
    await page.mouse.move(width - 40, height * 0.42);
    await page.mouse.move(width - 20, height * 0.45);
    expect(await warms(page)).toEqual([{ t: "warm", reason: "hover" }]);
    await page.context().close();
  });

  test("a launcher on the left warms near the left edge", async () => {
    const page = await open(launcher("left"));
    const { width, height } = page.viewportSize()!;
    await page.mouse.move(width - 20, height * 0.42);
    expect(await warms(page)).toEqual([]);
    await page.mouse.move(15, height * 0.42);
    expect(await warms(page)).toEqual([{ t: "warm", reason: "hover" }]);
    await page.context().close();
  });

  test("no launcher, no edge warming", async () => {
    const page = await open({ launcher: { enabled: false } });
    const { width, height } = page.viewportSize()!;
    await page.mouse.move(width - 20, height * 0.42);
    expect(await warms(page)).toEqual([]);
    await page.context().close();
  });
});
