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
const openSettings = async (l: Launched, page = "General") => {
  const nav = l.page.getByRole("navigation", { name: "Settings" });
  if (!(await nav.isVisible())) {
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await l.page.getByRole("link", { name: "Settings" }).click();
  }
  await nav.getByRole("link", { name: page, exact: true }).click();
  await l.page.getByRole("heading", { name: page, exact: true, level: 1 }).waitFor();
};

describe("settings search and the Advanced fold", () => {
  it("a search result inside a closed fold opens the fold and rings the row", async () => {
    const l = await start({ config: DONE });
    await openSettings(l);
    expect(await l.page.getByRole("button", { name: "Advanced" }).getAttribute("aria-expanded")).toBe("false");
    await l.page.getByRole("searchbox", { name: "Search settings" }).fill("settings file");
    await l.page.keyboard.press("Enter");
    await l.page.locator('[data-setting-row="general/settings-file"][data-focus-ring]').waitFor();
    expect(await l.page.getByRole("button", { name: "Advanced" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("the fold is closed again on the next visit", async () => {
    const l = await start({ config: DONE });
    await openSettings(l);
    await l.page.getByRole("button", { name: "Advanced" }).click();
    await openSettings(l, "Privacy");
    await openSettings(l, "General");
    expect(await l.page.getByRole("button", { name: "Advanced" }).getAttribute("aria-expanded")).toBe("false");
  });
});

describe("automation", () => {
  it("shows the server, the command-line tool and the deep links; turning the server off shows the warning and Start server turns it back on", async () => {
    const l = await start({ config: DONE });
    await openSettings(l, "Automation");
    await l.page.getByText("speakkit status --json").waitFor();
    await l.page.getByRole("button", { name: "Copy speakkit://settings/shortcuts" }).waitFor();
    await l.page.getByRole("switch", { name: "Let AI apps use Speak Kit" }).click();
    await l.page.getByText("The local server is off").waitFor();
    expect(configOf(l).controlServer).toBe(false);
    await l.page.getByRole("button", { name: "Start server" }).click();
    await l.page.getByText("The local server is off").waitFor({ state: "detached" });
    expect(configOf(l).controlServer).toBe(true);
  });
});

describe("shell layout", () => {
  it("opening Dictation leaves the shell at the full window width", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await l.page.getByRole("link", { name: "Dictation", exact: true }).click();
    await l.page.getByRole("heading", { name: "Dictation", exact: true, level: 1 }).waitFor();
    const box = await l.page.evaluate(() => {
      const r = document.querySelector(".sk-body")!.getBoundingClientRect();
      return { x: r.x, w: r.width, win: window.innerWidth };
    });
    expect(box.x).toBe(0);
    expect(box.w).toBe(box.win);
  });
});

describe("experiments", () => {
  it("every card starts off; turning one on asks first, saves the flag and shows On", async () => {
    const l = await start({ config: DONE });
    await openSettings(l, "Experiments");
    const card = l.page.getByTestId("experiment-caption-export");
    await card.waitFor();
    expect(await card.getByRole("button").textContent()).toBe("Turn on");
    await card.getByRole("button", { name: "Turn on" }).click();
    await l.page
      .getByRole("dialog", { name: /Turn on Caption export/ })
      .getByRole("button", { name: "Turn on" })
      .click();
    await card.getByRole("button", { name: "Turn off" }).waitFor();
    expect(configOf(l).experiments).toEqual({ "caption-export": true });
  });
});

describe("accessibility", () => {
  it("choosing Reduce sets the motion attribute on the document and saves it", async () => {
    const l = await start({ config: DONE });
    await openSettings(l, "Accessibility");
    await l.page.getByRole("radio", { name: "Reduce" }).click();
    await l.page.waitForFunction(() => document.documentElement.getAttribute("data-reduce-motion") === "on");
    expect(configOf(l).reduceMotion).toBe("on");
  });
});

describe("diagnostics", () => {
  it("the copy preview shows redacted text and Copy puts it on the clipboard", async () => {
    const l = await start({ config: DONE });
    await openSettings(l, "Diagnostics");
    await l.page.getByRole("button", { name: "Copy diagnostics" }).click();
    const text = l.page.getByLabel("Diagnostics text");
    await text.waitFor();
    await l.page.waitForFunction(() => !document.querySelector('[aria-label="Diagnostics text"]')?.textContent?.startsWith("Building"));
    const body = (await text.textContent()) ?? "";
    expect(body).toContain("Speak Kit ");
    expect(body).not.toContain(process.env.USERNAME ?? "\u0000none");
    await l.page.getByRole("dialog").getByRole("button", { name: "Copy", exact: true }).click();
    await l.page.getByRole("dialog").getByRole("button", { name: "Copied" }).waitFor();
  });

  it("the activity log starts empty with Clear disabled", async () => {
    const l = await start({ config: DONE });
    await openSettings(l, "Diagnostics");
    await l.page.getByText("Nothing logged yet").waitFor();
    expect(await l.page.getByRole("button", { name: "Clear", exact: true }).isDisabled()).toBe(true);
  });

  it("the log view loads", async () => {
    const l = await start({ config: DONE });
    await openSettings(l, "Diagnostics");
    await l.page.waitForFunction(() => !document.querySelector('[data-testid="log-view"]')?.textContent?.startsWith("Loading"));
  });
});

describe("settings file notices", () => {
  it("an invalid saved field loads as default and shows a banner that can be dismissed", async () => {
    const l = await start({ config: { ...DONE, idleUnload: "soon" } });
    await openSettings(l);
    const banner = l.page.getByTestId("settings-notice");
    await banner.getByText("idleUnload").waitFor();
    await banner.getByRole("button", { name: "Dismiss" }).click();
    await banner.waitFor({ state: "detached" });
  });

  it("a file from a newer version is flagged and left unchanged", async () => {
    const l = await start({ config: { ...DONE, configVersion: 9 } });
    await openSettings(l);
    await l.page.getByTestId("settings-notice").getByText("newer version").first().waitFor();
    await openSettings(l, "Accessibility");
    await l.page.getByRole("radio", { name: "Reduce" }).click();
    expect(configOf(l).configVersion).toBe(9);
    expect(configOf(l).reduceMotion).toBeUndefined();
  });
});

describe("about and privacy", () => {
  it("About shows the channel, release notes and the network table; switching back to Stable asks first", async () => {
    const l = await start({ config: { ...DONE, updateChannel: "early" } });
    await openSettings(l, "About");
    expect(await l.page.getByTestId("about-channel").textContent()).toBe("Early");
    await l.page.getByRole("main").getByRole("button", { name: "Release notes" }).waitFor();
    await l.page.getByTestId("network-table").waitFor();
    await l.page.getByRole("combobox", { name: "Update channel" }).click();
    await l.page.getByRole("option", { name: "Stable" }).click();
    await l.page.getByRole("dialog", { name: "Go back to Stable?" }).getByRole("button", { name: "Switch to Stable" }).click();
    await l.page.waitForFunction(() => document.querySelector('[data-testid="about-channel"]')?.textContent === "Stable");
    expect(configOf(l).updateChannel).toBe("stable");
  });

  it("Privacy shows the microphone state and the network table", async () => {
    const l = await start({ config: DONE });
    await openSettings(l, "Privacy");
    await l.page.getByTestId("network-table").waitFor();
    await l.page.waitForFunction(() => document.querySelector('[data-testid="mic-status"]')?.textContent !== "Checking...");
  });
});

describe("the 960 px window and the tray", () => {
  it("every page of this package fits the narrow window without a horizontal scrollbar", async () => {
    const l = await start({ config: DONE });
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(960, 700));
    for (const name of ["General", "Notifications", "Accessibility", "Performance", "Storage", "Privacy", "Experiments", "Diagnostics", "About"]) {
      await openSettings(l, name);
      const over = await l.page.evaluate(() => {
        const m = document.querySelector("main")!;
        return m.scrollWidth - m.clientWidth;
      });
      expect(over, name).toBeLessThanOrEqual(0);
    }
  });

  it("a settings file from a newer app keeps its warning and cannot be dismissed", async () => {
    const l = await start({ config: { ...DONE, configVersion: 999 } });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await openSettings(l);
    const notice = l.page.getByTestId("settings-notice");
    await notice.getByText("are not saved").waitFor();
    expect(await notice.getByRole("button", { name: "Dismiss" }).count()).toBe(0);
  });

  it("with the tray icon hidden the close button quits the app", async () => {
    const l = await start({ config: { ...DONE, hideTrayIcon: true } });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    const closed = l.app.waitForEvent("close", { timeout: 10_000 });
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
    await closed;
  });
});
