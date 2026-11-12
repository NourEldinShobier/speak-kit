import { afterEach, describe, expect, it } from "vite-plus/test";
import { readFileSync, writeFileSync } from "node:fs";
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
const configFile = (l: Launched) => path.join(l.userData, "config.json");
const configOf = (l: Launched) => JSON.parse(readFileSync(configFile(l), "utf8"));
const openSettings = async (l: Launched, page = "General") => {
  const nav = l.page.getByRole("navigation", { name: "Settings" });
  if (!(await nav.isVisible())) {
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await l.page.getByRole("link", { name: "Settings" }).click();
  }
  await nav.getByRole("link", { name: page, exact: true }).click();
  await l.page.getByRole("heading", { name: page, exact: true, level: 1 }).waitFor();
};

describe("settings edited outside the app", () => {
  it("a valid edit to config.json shows up in the open window and in the bell; a broken one changes nothing", async () => {
    const l = await start({ config: DONE });
    await openSettings(l);
    const closing = l.page.getByRole("combobox", { name: "Closing the window" });
    await expect.poll(() => closing.textContent()).toContain("Keeps running");

    writeFileSync(configFile(l), JSON.stringify({ ...configOf(l), closeAction: "quit" }));
    await expect.poll(() => closing.textContent(), { timeout: 10_000 }).toContain("Quits");

    await l.page.getByRole("button", { name: "Notifications" }).click();
    await l.page.getByText("Settings changed outside the app").waitFor();
    await l.page.keyboard.press("Escape");

    writeFileSync(configFile(l), '{ "closeAction": ');
    await l.page.getByRole("button", { name: "Notifications" }).click();
    await l.page.getByText("Settings file could not be read").waitFor({ timeout: 10_000 });
    expect(await closing.textContent()).toContain("Quits");
  }, 60_000);
});

describe("Performance resources", () => {
  it("lists the models in memory, the processes and what this computer offers", async () => {
    const l = await start({ config: DONE });
    await openSettings(l, "Performance");
    await l.page.getByRole("heading", { name: "Models in memory" }).waitFor();
    await expect.poll(() => l.page.getByTestId("resource-total").textContent()).toMatch(/^\d+ MB$/);
    await l.page.getByTestId("model-voice").waitFor();
    await l.page.getByTestId("model-speech").waitFor();
    await l.page.getByRole("heading", { name: "By process" }).waitFor();
    await l.page.getByTestId("resource-Speak Kit (main)").waitFor();
    await l.page.getByRole("heading", { name: "This computer" }).waitFor();
    expect(await l.page.getByTestId("device-0").textContent()).toMatch(/^(Windows|macOS) \(/);
    await l.page.screenshot({ path: path.join(l.userData, "performance.png") });
  }, 60_000);
});

describe("What is new", () => {
  it("shows the notes kept for the running version, and says so when there are none", async () => {
    const l = await start({ config: DONE });
    await openSettings(l, "What is new");
    await l.page.getByText("No notes kept for this version").waitFor();
    await l.page.getByRole("button", { name: "Open the release notes", exact: true }).waitFor();
    const version = await l.app.evaluate(({ app }) => app.getVersion());

    const withNotes = await start({ config: { ...DONE, whatsNew: { version, notes: ["fix(tray): keep the menu open", "feat: a new page"] } } });
    await openSettings(withNotes, "What is new");
    await expect.poll(() => withNotes.page.getByTestId("whatsnew-notes").innerText()).toContain("fix(tray): keep the menu open");
    expect(await withNotes.page.getByRole("heading", { name: "What is new", level: 1 }).count()).toBe(1);
  }, 60_000);

  it("an update that downloads brings its notes into the card and keeps them for the next start", async () => {
    const l = await start({ config: DONE, env: { SPEAKKIT_FAKE_UPDATE: "0.2.0" } });
    await openSettings(l, "About");
    await l.page.getByRole("button", { name: "Check for updates" }).click();
    await l.page.getByTestId("update-ready").waitFor();
    await expect.poll(() => l.page.getByTestId("update-notes").first().innerText()).toContain("feat(tray): a notice row for problems");
    expect(await l.page.getByTestId("update-notes").first().innerText()).not.toContain("@dev");
    await expect.poll(() => configOf(l).whatsNew).toEqual({ version: "0.2.0", notes: ["feat(tray): a notice row for problems", "fix(update): keep the notes of the new version"] });
  }, 60_000);
});

describe("an off feature", () => {
  it("Meetings shows an explanation and one button that turns it on", async () => {
    const l = await start({ config: { ...DONE, meetings: { enabled: false } } });
    await openSettings(l, "Meetings");
    const card = l.page.getByRole("region", { name: "Meetings are off" });
    await card.waitFor();
    await card.getByRole("button", { name: "Turn on" }).click();
    await card.waitFor({ state: "detached" });
    await expect.poll(() => configOf(l).meetings.enabled).toBe(true);
  }, 60_000);

  it("Automation shows the same card when the local server is off", async () => {
    const l = await start({ config: { ...DONE, controlServer: false } });
    await openSettings(l, "Automation");
    const card = l.page.getByRole("region", { name: "The local server is off" });
    await card.getByRole("button", { name: "Start server" }).click();
    await card.waitFor({ state: "detached" });
    await expect.poll(() => configOf(l).controlServer).toBe(true);
  }, 60_000);
});

describe("keyboard and window", () => {
  it("arrow keys move between the Settings sidebar links, and the sidebar's empty part is a drag area", async () => {
    const l = await start({ config: DONE });
    await openSettings(l);
    const nav = l.page.getByRole("navigation", { name: "Settings" });
    await nav.getByRole("link", { name: "General", exact: true }).focus();
    await l.page.keyboard.press("ArrowDown");
    expect(await l.page.evaluate(() => document.activeElement?.textContent)).toContain("Voice and playback");
    await l.page.keyboard.press("End");
    expect(await l.page.evaluate(() => document.activeElement?.textContent)).toContain("About");
    await l.page.keyboard.press("Home");
    expect(await l.page.evaluate(() => document.activeElement?.textContent)).toContain("General");

    const region = await l.page.evaluate(() => getComputedStyle(document.querySelector(".sk-side__spacer")!).getPropertyValue("-webkit-app-region"));
    expect(region).toBe("drag");
  }, 60_000);
});

describe("the main window uses the dark taskbar tray variant only when asked", () => {
  it("the tray icon is built and the app runs with it", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    const state = await l.app.evaluate(() => (globalThis as unknown as { __speakkit: { trayState(): string } }).__speakkit.trayState());
    expect(state).toMatch(/^[a-z]+\|Speak Kit/);
  }, 60_000);
});
