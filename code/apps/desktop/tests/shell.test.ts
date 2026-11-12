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

describe("shell", () => {
  it("measures: title bar 38, sidebar 248, search 420x30, content panel 8 px from the right and bottom edges, no footer band, no stroke", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    expect((await box(l, ".sk-title")).height).toBe(38);
    expect((await box(l, ".sk-side")).width).toBe(248);
    const search = await box(l, ".sk-search");
    expect([search.width, search.height]).toEqual([420, 30]);
    const main = await box(l, ".sk-main");
    const inner = await l.page.evaluate(() => [innerWidth, innerHeight]);
    expect(main.x).toBe(252);
    expect(main.x + main.width).toBe(inner[0]! - 8);
    expect(main.y + main.height).toBe(inner[1]! - 8);
    // Panel: no stroke, a card shadow instead.
    expect(await l.page.locator(".sk-main").evaluate((e) => getComputedStyle(e).borderTopWidth)).toBe("0px");
    // Sidebar: Menu title, the four groups, Recent and Settings; no New reading and no Browser.
    const nav = l.page.getByRole("navigation", { name: "Main" });
    for (const n of ["Home", "Library", "Voices", "Voice chat", "Engines", "Dictation", "Modes", "Vocabulary", "History", "Capture", "Settings"])
      expect(await nav.getByRole("link", { name: n }).count()).toBe(1);
    for (const n of ["New reading", "Browser"]) expect(await nav.getByText(n, { exact: true }).count()).toBe(0);
    expect(await nav.getByText("Recent").count()).toBe(1);
    // A ready engine shows nothing in the title bar (the sidebar card says it); the bell lives there.
    await l.page.getByTestId("title-engine-status").waitFor({ state: "detached" });
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

  it("setup window: white page, 20 px under the stepper, unclipped card rings, 16 px footer buttons", async () => {
    const l = await start();
    await l.page.getByRole("heading", { name: "Read anything out loud." }).waitFor();
    const style = (sel: string, props: string[]) =>
      l.page
        .locator(sel)
        .first()
        .evaluate((e, ps) => ps.map((p) => getComputedStyle(e).getPropertyValue(p)), props);
    expect(await style(".sk-setup", ["background-color"])).toEqual(["rgb(255, 255, 255)"]);
    await l.page.getByRole("button", { name: /Get started/ }).click();
    await l.page.getByRole("heading", { name: /Kokoro-82M/ }).waitFor();
    // Headline 20 px under the stepper (stepper ends at 84).
    expect((await box(l, ".sk-setup__col h1")).y).toBe(104);
    // The scroller spans the window and the column does not clip, so the ring of a card (1 px outside it) shows at both sides.
    expect(await style(".sk-setup__scroll", ["overflow-y"])).toEqual(["auto"]);
    expect(await style(".sk-setup__col", ["overflow-x", "overflow-y"])).toEqual(["visible", "visible"]);
    const [scroll, card] = [await box(l, ".sk-setup__scroll"), await box(l, ".sk-setup .lm-card")];
    expect([scroll.x < card.x - 1, scroll.x + scroll.width > card.x + card.width + 1, card.width]).toEqual([true, true, 720]);
    // Footer: Back's box 12 from the left, the primary 20 from the right, both 16 from the bottom.
    const [h, w] = await l.page.evaluate(() => [innerHeight, innerWidth] as const);
    const back = await box(l, ".sk-setup__foot .lm-btn--ghost");
    const next = await box(l, ".sk-setup__foot .lm-btn--primary");
    expect([back.x, w - (next.x + next.width), h - (back.y + back.height), h - (next.y + next.height), next.height]).toEqual([12, 20, 16, 16, 36]);
  });

  it("test connection waits for the extension's first authenticated call", async () => {
    const l = await start();
    await l.page.getByRole("button", { name: /Get started/ }).click();
    await l.page.getByRole("button", { name: /^Continue/ }).click();
    await l.page.getByRole("button", { name: "Skip dictation" }).click();
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
    const input = l.page.getByRole("combobox", { name: "Type a command or search" });
    await input.waitFor();
    expect(await l.page.getByRole("option").count()).toBeGreaterThan(8);
    await input.fill("idle");
    expect(await l.page.getByRole("option").count()).toBe(1);
    await l.page.keyboard.press("Enter");
    await l.page.getByRole("heading", { name: "Performance" }).waitFor();
    expect(await input.count()).toBe(0);
    // The title-bar search opens it too; voices are searchable; Escape closes.
    await l.page.getByRole("button", { name: "Search readings, voices and commands" }).click();
    await input.fill("bella");
    await l.page.getByRole("option", { name: /Bella/ }).waitFor();
    await l.page.keyboard.press("Escape");
    expect(await input.count()).toBe(0);
  });
});

describe("command palette states", () => {
  it("shows Best match, the count and Clear while searching, and the no-results state with chips", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await l.page.keyboard.press("Control+K");
    const input = l.page.getByRole("combobox", { name: "Type a command or search" });
    await input.waitFor();
    // Opened without a query: no count, no Clear, no Best match.
    expect(await l.page.getByText("Best match", { exact: true }).count()).toBe(0);
    expect(await l.page.getByRole("button", { name: "Clear" }).count()).toBe(0);
    await input.fill("idle");
    await l.page.getByText("Best match", { exact: true }).waitFor();
    expect(await l.page.getByText("1 result", { exact: true }).count()).toBe(1);
    await l.page.getByRole("button", { name: "Clear" }).click();
    expect(await input.inputValue()).toBe("");
    expect(await l.page.getByRole("button", { name: "Clear" }).count()).toBe(0);
    await input.fill("zzzzqqqq");
    await l.page.getByText("No matches for “zzzzqqqq”").waitFor();
    expect(await l.page.getByRole("option").count()).toBe(0);
    expect(await l.page.locator(".sk-pal__chip").count()).toBeGreaterThan(0);
  });

  it("arrow keys move the highlight and Enter runs the highlighted row; the run is remembered under Recent", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await l.page.keyboard.press("Control+K");
    const input = l.page.getByRole("combobox", { name: "Type a command or search" });
    await input.waitFor();
    const active = () => input.getAttribute("aria-activedescendant");
    const first = await active();
    await l.page.keyboard.press("ArrowDown");
    const second = await active();
    expect(second).not.toBe(first);
    await l.page.keyboard.press("ArrowUp");
    expect(await active()).toBe(first);
    await l.page.keyboard.press("ArrowUp");
    expect(await active()).not.toBe(first); // wraps to the last row
    await l.page.keyboard.press("ArrowDown");
    await l.page.keyboard.press("Enter");
    const saved = await l.page.evaluate(() => JSON.parse(localStorage.getItem("speakkit.palette-recent") ?? "[]"));
    expect(saved).toHaveLength(1);
  });

  it("Tab stays inside the dialog and Escape closes it even after Tab", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await l.page.keyboard.press("Control+K");
    await l.page.getByRole("combobox", { name: "Type a command or search" }).waitFor();
    for (let i = 0; i < 3; i++) {
      await l.page.keyboard.press("Tab");
      expect(await l.page.evaluate(() => !!document.activeElement?.closest(".sk-pal"))).toBe(true);
    }
    await l.page.keyboard.press("Escape");
    expect(await l.page.locator(".sk-pal").count()).toBe(0);
  });
});

describe("settings sidebar search and Recent", () => {
  it("the search field filters the Settings rows and shows an empty state", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await l.page.getByRole("link", { name: "Settings" }).click();
    const nav = l.page.getByRole("navigation", { name: "Settings" });
    const find = nav.getByRole("searchbox", { name: "Search settings" });
    await find.fill("shortcuts");
    await nav.getByRole("group", { name: "Shortcuts" }).waitFor();
    expect(await nav.getByRole("link").count()).toBe(0);
    await find.fill("zzzz");
    await nav.getByText("No settings match").waitFor();
    await find.fill("");
    expect(await nav.getByRole("link").count()).toBe(14);
  });

  it("Recent shows its empty hint when no reading was opened", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await l.page.getByText("Readings you open appear here.").waitFor();
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
    await l.page.getByRole("link", { name: "Performance" }).click();
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

  it("Performance: idle unload, load at startup and battery saver persist to config.json; engine state and RAM are shown", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("link", { name: "Settings" }).click();
    await l.page.getByRole("link", { name: "Performance" }).click();
    await l.page.getByRole("heading", { name: "Performance" }).waitFor();
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
      ["Performance", "Performance"],
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

  it("Engines page: Kokoro unloaded wakes on play", async () => {
    const l = await start({ config: DONE, env: { SPEAKKIT_FAKE_STATE: "unloaded" } });
    await l.page.getByRole("link", { name: "Engines" }).click();
    await l.page.getByRole("heading", { name: "Engines", level: 1 }).waitFor();
    const kokoro = await l.page.locator("[data-engine=kokoro]").textContent();
    expect(kokoro).toContain("Unloaded");
    expect(kokoro).toContain("Not in memory (0 MB)");
    expect(await l.page.getByTestId("title-engine-status").textContent()).toBe("Unloaded · Wakes on play");
    // Not ready: a grey 8 px dot and one line of text, no pill and no fill.
    const look = await l.page.getByTestId("title-engine-status").evaluate((e) => {
      const c = getComputedStyle(e);
      const d = getComputedStyle(e, "::before");
      return [c.backgroundColor, c.color, c.fontSize, c.fontWeight, c.columnGap, d.width, d.height, d.backgroundColor];
    });
    expect(look).toEqual(["rgba(0, 0, 0, 0)", "rgb(71, 84, 103)", "13px", "500", "6px", "8px", "8px", "rgb(201, 204, 210)"]);
  });
});

describe("tray and lifecycle", () => {
  it("native tray menu is short, the icon follows engine state, Quit asks what stops", async () => {
    const l = await start({ config: DONE, env: { SPEAKKIT_FAKE_STATE: "unloaded" } });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    const hook = <T>(fn: string, ...a: unknown[]) => l.app.evaluate((_, [f, args]) => (globalThis as any).__speakkit[f as string](...(args as unknown[])) as T, [fn, a] as const);
    const items = await hook<{ label: string; enabled: boolean; type: string }[]>("trayItems");
    // Dictation rows come and go with the OS and the dictation setting; the rest of the menu is fixed.
    const labels = items.filter((i) => i.type !== "separator").map((i) => i.label);
    expect(labels.filter((n) => !/^(Dictation|Hold |Paste last|Pause all shortcuts|Speech model)/.test(n))).toEqual([
      "Open Speak Kit",
      "Record a conversation",
      "Record a meeting",
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
    await first.page.getByRole("heading", { name: "Browser integration", level: 1 }).waitFor();
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
