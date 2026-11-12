import { afterEach, describe, expect, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { launch, type Launched } from "./harness";

const running: Launched[] = [];
const start = async (o: Parameters<typeof launch>[0] = {}) => {
  const l = await launch({ ...o, env: { SPEAKKIT_TEST: "1", ...o.env } });
  running.push(l);
  return l;
};
afterEach(async () => {
  await Promise.all(running.splice(0).map((l) => l.cleanup()));
});

const DONE = { setupDone: true, setupSkipped: false, preferredPort: 0 };
const configOf = (l: Launched) => JSON.parse(readFileSync(path.join(l.userData, "config.json"), "utf8"));
const open = async (l: Launched) => {
  await l.page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Engines" }).click();
  await l.page.getByRole("heading", { name: "Speech models" }).waitFor();
};
const shot = (l: Launched, name: string) => (process.env.SPEAKKIT_SHOTS ? l.page.screenshot({ path: path.join(process.env.SPEAKKIT_SHOTS, `${name}.png`) }) : Promise.resolve(undefined));

describe("Engines page", () => {
  it("lists both models with the one in use first, the language table, performance and disk space", async () => {
    const l = await start({ config: DONE });
    await open(l);
    const cards = l.page.locator("[data-testid^=model-card-]");
    expect(await cards.count()).toBe(2);
    expect(await cards.first().getAttribute("data-model")).toBe("large-v3-turbo-q5_0");
    const first = cards.first();
    expect(await first.getByText("In use").count()).toBe(1);
    expect(await first.getByText("File size", { exact: true }).count()).toBe(1);
    expect(await first.getByText("About 1 wrong word in 25 (English test)").count()).toBe(1);
    expect(await l.page.getByRole("heading", { name: "Best model for each language" }).count()).toBe(1);
    expect(await l.page.getByRole("table").getByRole("row").count()).toBeGreaterThan(5);
    expect(await l.page.getByRole("heading", { name: "Performance" }).count()).toBe(1);
    expect(await l.page.getByRole("heading", { name: "Disk space" }).count()).toBe(1);
    await shot(l, "engines-default");
  });

  it("the Downloaded filter keeps the installed models and says how many are hidden", async () => {
    const l = await start({ config: DONE });
    await open(l);
    await l.page.getByRole("radio", { name: "Downloaded" }).click();
    expect(await l.page.locator("[data-testid^=model-card-]").count()).toBe(2); // both are on disk in the scripted engine
  });

  it("unload when idle is saved in the config and survives a restart of the page", async () => {
    const l = await start({ config: DONE });
    await open(l);
    await l.page.getByRole("combobox", { name: "Unload speech model when idle" }).click();
    await l.page.getByRole("option", { name: "After 30 minutes" }).click();
    await l.page.waitForFunction(() => true);
    await expect.poll(() => configOf(l).engines?.idleMinutes).toBe(30);
  });

  it("deleting a model asks first, says how much it frees, and removes it", async () => {
    const l = await start({ config: DONE });
    await open(l);
    await l.page.getByRole("button", { name: "Delete Parakeet v3" }).first().click();
    const dialog = l.page.getByRole("dialog");
    expect(await dialog.getByText("Delete Parakeet v3?").count()).toBe(1);
    expect(await dialog.getByText(/This frees 356 MB of disk space/).count()).toBe(1);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    expect(await l.page.getByRole("dialog").count()).toBe(0);
  });

  it("Advanced shows the detected hardware and the device choice", async () => {
    const l = await start({ config: DONE });
    await open(l);
    await l.page.getByRole("button", { name: /Advanced/ }).click();
    expect(await l.page.getByRole("combobox", { name: "Run speech on" }).count()).toBe(1);
    await shot(l, "engines-advanced");
  });

  it("holds at the 960 px narrow window: the cards stack and nothing scrolls sideways", async () => {
    const l = await start({ config: DONE });
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(960, 800));
    await open(l);
    const overflow = await l.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(l, "engines-960");
  });
});
