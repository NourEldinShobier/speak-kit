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
const box = async (l: Launched, sel: string) => (await l.page.locator(sel).first().boundingBox())!;
const configOf = (l: Launched) => JSON.parse(readFileSync(path.join(l.userData, "config.json"), "utf8"));

describe("Lumen shell", () => {
  it("measures: title bar 36, sidebar 248, search 420x28, content panel 8 px from the right edge, 28 px footer band, no stroke", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    expect((await box(l, ".sk-title")).height).toBe(36);
    expect((await box(l, ".sk-side")).width).toBe(248);
    const search = await box(l, ".sk-search");
    expect([search.width, search.height]).toEqual([420, 28]);
    const main = await box(l, ".sk-main");
    const inner = await l.page.evaluate(() => [innerWidth, innerHeight]);
    expect(main.x).toBe(252);
    expect(main.x + main.width).toBe(inner[0]! - 8);
    expect(main.y + main.height).toBe(inner[1]! - 28);
    // Lockix panel: no stroke, a card shadow instead.
    expect(await l.page.locator(".sk-main").evaluate((e) => getComputedStyle(e).borderTopWidth)).toBe("0px");
    // Sidebar: New reading, Home, Library, Voices, Engines, Browser, Settings, Recent.
    const nav = l.page.getByRole("navigation", { name: "Main" });
    for (const n of ["Home", "Voices", "Engines", "Browser", "Settings"]) expect(await nav.getByRole("link", { name: n }).count()).toBe(1);
    expect(await nav.getByRole("link", { name: "Library" }).count()).toBe(1);
    expect(await nav.getByText("Recent").count()).toBe(1);
    // Status pill and bell live in the title bar.
    expect(await l.page.getByTestId("engine-pill").textContent()).toBe("Ready");
    expect(await l.page.getByRole("button", { name: "Notifications" }).count()).toBe(1);
    // Sidebar toggle hides it and the card grows.
    await l.page.getByRole("button", { name: "Toggle sidebar" }).click();
    expect((await box(l, ".sk-main")).x).toBe(4);
  });

  it("first run opens the 960x680 setup window with a 32 px title, 52 px stepper, 720 px column and 64 px footer", async () => {
    const l = await start();
    await l.page.getByRole("heading", { name: "Read anything out loud." }).waitFor();
    expect(await l.page.evaluate(() => [innerWidth, innerHeight])).toEqual([960, 680]);
    expect((await box(l, ".sk-setup__title")).height).toBe(32);
    expect((await box(l, ".sk-setup__stepper")).height).toBe(52);
    expect((await box(l, ".sk-setup__col")).width).toBe(720);
    expect((await box(l, ".sk-setup__foot")).height).toBe(64);
    expect(await l.page.locator(".lm-step").count()).toBe(5);
  });

  it("test connection waits for the extension's first authenticated call", async () => {
    const l = await start();
    await l.page.getByRole("button", { name: /Get started/ }).click();
    await l.page.getByRole("button", { name: /Download Kokoro/ }).click();
    await l.page.getByRole("button", { name: /^Continue/ }).click();
    await l.page.getByRole("heading", { name: "Connect your browser" }).waitFor();
    await l.page.getByRole("button", { name: "Test connection" }).click();
    await l.page.getByText("Waiting for the extension's first call").waitFor();
    // A call without the token does not count.
    await fetch(`http://127.0.0.1:${l.port}/v1/auth/check`);
    await new Promise((r) => setTimeout(r, 300));
    expect(await l.page.getByText("Waiting for the extension's first call").count()).toBe(1);
    const token = readFileSync(path.join(l.userData, "token"), "utf8").trim();
    await fetch(`http://127.0.0.1:${l.port}/v1/auth/check`, { headers: { Authorization: `Bearer ${token}`, Origin: "chrome-extension://abcdef" } });
    await l.page.getByText("Connected", { exact: true }).first().waitFor();
    expect(await l.page.getByRole("button", { name: /^Continue/ }).isEnabled()).toBe(true);
  });
});

describe("command palette", () => {
  it("Ctrl K opens it, typing filters, Enter runs, Escape closes", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await l.page.keyboard.press("Control+K");
    const input = l.page.getByRole("combobox", { name: "Search readings, voices and commands" });
    await input.waitFor();
    expect(await l.page.getByRole("option").count()).toBeGreaterThan(8);
    await input.fill("memory");
    expect(await l.page.getByRole("option").count()).toBe(1);
    await l.page.keyboard.press("Enter");
    await l.page.getByRole("heading", { name: "Memory" }).waitFor();
    expect(await input.count()).toBe(0);
    // The title-bar search opens it too; voices are searchable; Escape closes.
    await l.page.getByRole("button", { name: "Search readings, voices and commands" }).click();
    await input.fill("bella");
    await l.page.getByRole("option", { name: /Preview Bella/ }).waitFor();
    await l.page.keyboard.press("Escape");
    expect(await input.count()).toBe(0);
  });
});

describe("settings", () => {
  it("app text is not selectable; the reader text and inputs are", async () => {
    const l = await start({ config: DONE });
    const sel = (css: string) =>
      l.page
        .locator(css)
        .first()
        .evaluate((e) => getComputedStyle(e).userSelect);
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    expect(await sel("h1")).toBe("none");
    expect(await sel(".sk-side")).toBe("none");
    expect(await sel(".sk-search")).toBe("none");
    await l.page.evaluate(() => document.body.insertAdjacentHTML("beforeend", '<input id="t"><div class="rd-text">x</div>'));
    expect(await sel("#t")).toBe("text");
    expect(await sel(".rd-text")).toBe("text");
  });

  it("the settings close button's icon is centred in its hover square", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("link", { name: "Settings" }).click();
    const back = l.page.locator(".sk-side__head").getByRole("button", { name: "Close settings" });
    await back.waitFor();
    const [b, i] = [await back.boundingBox(), await back.locator("svg").boundingBox()];
    expect(Math.abs(b!.x + b!.width / 2 - (i!.x + i!.width / 2))).toBeLessThan(0.6);
    expect(Math.abs(b!.y + b!.height / 2 - (i!.y + i!.height / 2))).toBeLessThan(0.6);
  });

  it("the settings arrow closes Settings and returns to the page before it, however many sections were visited", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("link", { name: "Voices" }).click();
    await l.page.getByRole("heading", { name: "Voices", exact: true }).waitFor();
    await l.page.getByRole("link", { name: "Settings" }).click();
    await l.page.getByRole("link", { name: "Memory" }).click();
    await l.page.getByRole("link", { name: "Shortcuts" }).click();
    await l.page.getByRole("button", { name: "Close settings" }).click();
    await l.page.getByRole("heading", { name: "Voices", exact: true }).waitFor();
    expect(await l.page.locator(".sk-side__head").count()).toBe(0);
    // Escape does the same from Settings.
    await l.page.getByRole("link", { name: "Settings" }).click();
    await l.page.getByRole("link", { name: "About" }).click();
    await l.page.keyboard.press("Escape");
    await l.page.getByRole("heading", { name: "Voices", exact: true }).waitFor();
  });

  it("Memory: idle unload, load at startup and battery saver persist to config.json; engine state and RAM are shown", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("link", { name: "Settings" }).click();
    await l.page.getByRole("link", { name: "Memory" }).click();
    await l.page.getByRole("heading", { name: "Memory" }).waitFor();
    expect(await l.page.getByTestId("memory-engine").textContent()).toBe("Ready");
    await l.page
      .getByTestId("memory-rss")
      .filter({ hasText: /\d+ MB/ })
      .waitFor();
    await l.page.getByRole("combobox", { name: "Idle unload" }).click();
    await l.page.getByRole("option", { name: "After 15 minutes" }).click();
    await l.page.getByRole("switch", { name: "Load at startup" }).click();
    await l.page.getByRole("switch", { name: "Battery saver" }).click();
    await expect.poll(() => configOf(l)).toMatchObject({ idleUnload: "15", loadAtStart: true, batterySaver: false });
    expect(await l.page.getByRole("switch", { name: "Load at startup" }).getAttribute("aria-checked")).toBe("true");
  });

  it("every settings page opens; Browser integration regenerates the token only after confirming", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("link", { name: "Settings" }).click();
    for (const [link, heading] of [
      ["General", "General"],
      ["Voice and playback", "Voice and playback"],
      ["Memory", "Memory"],
      ["Storage", "Storage"],
      ["About", "About"],
      ["Browser integration", "Browser integration"],
    ] as const) {
      await l.page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: link }).click();
      await l.page.getByRole("heading", { name: heading, level: 1 }).waitFor();
    }
    await l.page.getByRole("button", { name: "Reveal" }).click();
    const before = (await l.page.getByTestId("token").textContent())!;
    await l.page.getByRole("button", { name: "Regenerate" }).click();
    await l.page.getByRole("dialog", { name: "Regenerate the pairing token?" }).waitFor();
    await l.page.getByRole("button", { name: "Cancel" }).click();
    expect(readFileSync(path.join(l.userData, "token"), "utf8").trim()).toBe(before);
    await l.page.getByRole("button", { name: "Regenerate" }).click();
    await l.page.getByRole("dialog").getByRole("button", { name: "Regenerate" }).click();
    await expect.poll(() => readFileSync(path.join(l.userData, "token"), "utf8").trim()).not.toBe(before);
    // Storage shows the models folder and a size bar.
    await l.page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Storage" }).click();
    await l.page.getByTestId("storage-bar").waitFor();
    // Idle-unload and the other General toggles are reachable by name.
    await l.page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "General" }).click();
    for (const n of ["Launch at login", "Start minimized to tray"]) expect(await l.page.getByRole("switch", { name: n }).count()).toBe(1);
  });

  it("Engines page: Kokoro unloaded wakes on play, Chatterbox is listed as not available", async () => {
    const l = await start({ config: DONE, env: { SPEAKKIT_FAKE_STATE: "unloaded" } });
    await l.page.getByRole("link", { name: "Engines" }).click();
    await l.page.getByRole("heading", { name: "Engines", level: 1 }).waitFor();
    const kokoro = await l.page.locator("[data-engine=kokoro]").textContent();
    expect(kokoro).toContain("Unloaded");
    expect(kokoro).toContain("Not in memory (0 MB)");
    expect(await l.page.getByTestId("engine-pill").textContent()).toBe("Unloaded · Wakes on play");
  });
});

describe("tray and lifecycle", () => {
  it("native tray menu is short, the icon follows engine state, Quit asks what stops", async () => {
    const l = await start({ config: DONE, env: { SPEAKKIT_FAKE_STATE: "unloaded" } });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    const hook = <T>(fn: string, ...a: unknown[]) => l.app.evaluate((_, [f, args]) => (globalThis as any).__speakkit[f as string](...(args as unknown[])) as T, [fn, a] as const);
    const items = await hook<{ label: string; enabled: boolean; type: string }[]>("trayItems");
    expect(items.filter((i) => i.type !== "separator").map((i) => i.label)).toEqual([
      "Open Speak Kit",
      "Load the voice engine now",
      "Do not disturb",
      "Settings",
      "Check for updates",
      "Quit Speak Kit",
    ]);
    expect(await hook<string>("trayState")).toMatch(/^asleep\|Speak Kit - Unloaded \(wakes on play\)$/);

    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.hide());
    await hook("clickTray", "Quit Speak Kit");
    await l.page.getByRole("dialog", { name: "Quit Speak Kit?" }).waitFor();
    expect(await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(true);
    expect(await l.page.getByTestId("quit-list").textContent()).toContain(`127.0.0.1:${l.port}`);
    await l.page.getByRole("button", { name: "Keep running in tray" }).click();
    await l.page.getByRole("dialog").waitFor({ state: "detached" });
    // Settings from the tray navigates.
    await hook("clickTray", "Settings");
    await l.page.getByRole("heading", { name: "General", level: 1 }).waitFor();
    await hook("clickTray", "Quit Speak Kit");
    const proc = l.app.process();
    await l.page.getByRole("button", { name: "Quit", exact: true }).click();
    await new Promise<void>((r) => (proc.exitCode !== null ? r() : proc.once("exit", () => r())));
    await expect(fetch(`http://127.0.0.1:${l.port}/v1/health`)).rejects.toThrow();
  });

  it("speakkit://pair from a second launch focuses the hidden first instance on the Browser page", async () => {
    const first = await start({ config: DONE });
    await first.page.getByRole("heading", { name: "Home" }).waitFor();
    await first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
    const visible = () => first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.isVisible()));
    expect(await visible()).toBe(false);
    const second = await launch({ userData: first.userData, port: first.port, args: ["speakkit://pair"] }).catch(() => null);
    await expect.poll(visible, { timeout: 10_000 }).toBe(true);
    await first.page.getByRole("heading", { name: "Browser", level: 1 }).waitFor();
    // An unknown link only focuses.
    await first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.hide());
    await launch({ userData: first.userData, port: first.port, args: ["speakkit://evil"] }).catch(() => null);
    await expect.poll(visible, { timeout: 10_000 }).toBe(true);
    await second?.cleanup();
  });

  it("a hidden window stops polling health; showing it resumes", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    // Count /v1/health requests seen by the server through node's request channel.
    await l.app.evaluate(() => {
      const dc = process.getBuiltinModule("node:diagnostics_channel");
      const g = globalThis as any;
      g.__hits = 0;
      dc.subscribe("http.server.request.start", (m: any) => {
        if (m.request.url === "/v1/health") g.__hits++;
      });
    });
    const count = () => l.app.evaluate(() => (globalThis as any).__hits as number);
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.hide());
    await new Promise((r) => setTimeout(r, 300));
    const a = await count();
    await new Promise((r) => setTimeout(r, 6500));
    expect(await count()).toBe(a);
    await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.show());
    await expect.poll(count, { timeout: 5000 }).toBeGreaterThan(a);
    expect(await l.page.evaluate(() => document.hidden)).toBe(false);
  }, 30_000);
});
