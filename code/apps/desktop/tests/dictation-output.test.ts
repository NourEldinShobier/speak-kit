import { afterEach, describe, expect, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { launch, type Launched } from "./harness";

const running: Launched[] = [];
const start = async (dictation: object = {}) => {
  const l = await launch({ config: { setupDone: true, setupSkipped: false, preferredPort: 0, dictation }, env: { SPEAKKIT_TEST: "1" } });
  running.push(l);
  await l.page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Dictation" }).click();
  await l.page.getByRole("heading", { name: "Dictation shortcut" }).waitFor();
  return l;
};
afterEach(async () => {
  await Promise.all(running.splice(0).map((l) => l.cleanup()));
});

const saved = (l: Launched) => JSON.parse(readFileSync(path.join(l.userData, "config.json"), "utf8")).dictation;
const until = async (f: () => boolean) => {
  for (const end = Date.now() + 8000; Date.now() < end;) {
    if (f()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  expect(f()).toBe(true);
};

describe("Dictation output settings page", () => {
  it("shows the shortcut status and no last problem when dictation is off and nothing failed", async () => {
    const l = await start();
    expect(await l.page.getByRole("status", { name: "Shortcut status: Stopped" }).isVisible()).toBe(true);
    expect(await l.page.getByText("Last problem", { exact: true }).count()).toBe(0);
  });

  it("saves the indicator position, and the volume row appears only while sounds are on", async () => {
    const l = await start();
    expect(await l.page.getByRole("slider", { name: "Volume" }).count()).toBe(0);
    await l.page.getByRole("switch", { name: "Sounds" }).click();
    await l.page.getByRole("slider", { name: "Volume" }).waitFor();
    await until(() => saved(l).sounds?.enabled === true);
    await l.page.getByRole("combobox", { name: "Recording indicator" }).click();
    await l.page.getByRole("option", { name: "Top of the screen" }).click();
    await until(() => saved(l).indicator === "top");
    expect(saved(l).sounds).toEqual({ enabled: true, volume: 50 });
  });

  it("saves what happens to other audio, and the speakers-only switch appears only when something is done", async () => {
    const l = await start();
    expect(await l.page.getByRole("switch", { name: "Only for speakers" }).count()).toBe(0);
    await l.page.getByRole("combobox", { name: "Other audio while dictating" }).click();
    await l.page.getByRole("option", { name: "Lower the volume" }).click();
    await until(() => saved(l).duckAudio === "lower");
    const only = l.page.getByRole("switch", { name: "Only for speakers" });
    expect(await only.getAttribute("aria-checked")).toBe("true");
    await only.click();
    await until(() => saved(l).duckSpeakersOnly === false);
  });

  it("saves smart spacing from the Output card", async () => {
    const l = await start();
    const toggle = l.page.getByRole("switch", { name: "Space before the text" });
    expect(await toggle.getAttribute("aria-checked")).toBe("false");
    await toggle.click();
    await until(() => saved(l).smartSpacing === true);
  });

  it("records a shortcut for cleaning up the field and clears it again", async () => {
    const l = await start();
    await l.page.getByRole("button", { name: "Add shortcut: Clean up the field" }).click();
    await l.page.getByText("Press the new keys").waitFor();
    await l.page.keyboard.down("F7");
    await l.page.keyboard.up("F7");
    await until(() => saved(l).transformHotkey === "F7");
    await l.page.getByRole("button", { name: "Remove Clean up the field" }).click();
    await until(() => saved(l).transformHotkey === "");
  });

  it("refuses a clean-up shortcut that another one already uses and says which", async () => {
    const l = await start({ rawHotkey: "F8" });
    await l.page.getByRole("button", { name: "Add shortcut: Clean up the field" }).click();
    await l.page.getByText("Press the new keys").waitFor();
    await l.page.keyboard.down("F8");
    await l.page.keyboard.up("F8");
    await l.page.getByText(/already the Dictate without processing/).waitFor();
    expect(saved(l).transformHotkey ?? "").toBe("");
  });

  it("keeps the layout inside a 960 px window with the new cards", async () => {
    const l = await start();
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(960, 800));
    const overflow = await l.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
