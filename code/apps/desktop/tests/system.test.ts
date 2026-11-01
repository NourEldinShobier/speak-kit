import { afterEach, describe, expect, it } from "vite-plus/test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { launch, type Launched } from "./harness";

const running: Launched[] = [];
const tmpDirs: string[] = [];
const start = async (o: Parameters<typeof launch>[0] = {}) => {
  const l = await launch({ ...o, env: { SPEAKKIT_TEST: "1", ...o.env } });
  running.push(l);
  return l;
};
afterEach(async () => {
  await Promise.all(running.splice(0).map((l) => l.cleanup()));
  tmpDirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
});

const outDir = () => {
  const d = mkdtempSync(path.join(tmpdir(), "speakkit-out-"));
  tmpDirs.push(d);
  return d;
};
const DONE = { setupDone: true, setupSkipped: false, preferredPort: 0 };
const configOf = (l: Launched) => JSON.parse(readFileSync(path.join(l.userData, "config.json"), "utf8"));
const hook = <T>(l: Launched, fn: string, ...a: unknown[]) => l.app.evaluate((_, [f, args]) => (globalThis as any).__speakkit[f as string](...(args as unknown[])) as T, [fn, a] as const);
const hide = (l: Launched) => l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.hide());
const settings = async (l: Launched, link: string, heading = link) => {
  await l.page.getByRole("link", { name: "Settings" }).click();
  await l.page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: link }).click();
  await l.page.getByRole("heading", { name: heading, level: 1 }).waitFor();
};
const newWindow = (l: Launched, part: string) => l.app.waitForEvent("window", { predicate: (p) => p.url().includes(part), timeout: 15_000 });
const until = async (f: () => Promise<boolean> | boolean, ms = 15_000) => {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (await f()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  expect(await f()).toBe(true);
};

describe("global shortcuts (the OS is simulated; a real key press cannot be sent from here)", () => {
  it("the four defaults are registered", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    expect(await hook<string[]>(l, "registeredShortcuts")).toEqual(["Ctrl+Alt+C", "Ctrl+Alt+S", "Ctrl+Alt+Space", "Ctrl+Alt+X"]);
  });

  it("the recorder rebinds a key, rejects a bad combination, and Escape cancels", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await settings(l, "Shortcuts");
    const row = l.page.locator('[data-shortcut="stop"]');
    await row.getByRole("button", { name: "Change Stop shortcut" }).click();
    await l.page.getByTestId("recording").waitFor();
    await l.page.keyboard.press("Escape");
    await l.page.getByTestId("recording").waitFor({ state: "detached" });

    await row.getByRole("button", { name: "Change Stop shortcut" }).click();
    await l.page.keyboard.press("KeyA"); // no modifier
    await l.page.getByTestId("shortcut-problem").getByText("Use Ctrl or Alt together with another key.").waitFor();
    await l.page.keyboard.press("Control+Alt+KeyQ");
    await row.getByText("Q", { exact: true }).waitFor();
    await expect.poll(() => configOf(l).shortcuts.stop).toBe("Ctrl+Alt+Q");
    expect(await hook<string[]>(l, "registeredShortcuts")).toContain("Ctrl+Alt+Q");
    expect(await hook<string[]>(l, "registeredShortcuts")).not.toContain("Ctrl+Alt+X");

    await l.page.getByRole("button", { name: "Reset" }).click();
    await expect.poll(() => configOf(l).shortcuts.stop).toBe("Ctrl+Alt+X");
  });

  it("a combination another app owns is reported with one alternative and never taken silently", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await hook(l, "foreignShortcuts", ["Ctrl+Alt+Q"]);
    await settings(l, "Shortcuts");
    const row = l.page.locator('[data-shortcut="stop"]');
    await row.getByRole("button", { name: "Change Stop shortcut" }).click();
    await l.page.keyboard.press("Control+Alt+KeyQ");
    const problem = row.getByTestId("shortcut-problem");
    await problem.getByText("Another app is using it.").waitFor();
    await problem.getByRole("button", { name: "Use Ctrl+Alt+Shift+Q" }).click();
    await expect.poll(() => configOf(l).shortcuts.stop).toBe("Ctrl+Alt+Shift+Q");
  });

  it("a conflict at start-up shows on its row", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await hook(l, "foreignShortcuts", ["Ctrl+Alt+S"]);
    await settings(l, "Shortcuts");
    await l.page.locator('[data-shortcut="read-selection"]').getByText("Another app is using Ctrl+Alt+S.").waitFor();
  });

  it("pressing Read clipboard reads the clipboard in the mini player; an empty clipboard says so", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await l.app.evaluate(({ clipboard }) => clipboard.writeText("First sentence of the clipboard. Second sentence follows."));
    const mini = newWindow(l, "mini.html");
    await hook(l, "pressShortcut", "Ctrl+Alt+C");
    const page = await mini;
    await page.getByTestId("mini").waitFor();
    await page.getByText("First sentence of the clipboard. Second sentence follows.").first().waitFor();
    expect(await page.getByTestId("mini-status").textContent()).toMatch(/Sentence [12] of 2|Preparing the voice/);
    await hook(l, "pressShortcut", "Ctrl+Alt+X");
    await until(() => page.isClosed());

    await l.app.evaluate(({ clipboard }) => clipboard.clear());
    const again = newWindow(l, "mini.html");
    await new Promise((r) => setTimeout(r, 500)); // past the key-repeat guard
    await hook(l, "pressShortcut", "Ctrl+Alt+C");
    const empty = await again;
    await empty.getByText("The clipboard has no text.").first().waitFor();
  });
});

describe("mini player and tray", () => {
  const TEXT = "One short sentence here. Another short sentence here. A third short sentence here.";

  it("plays, pauses, resumes, steps, and the tray follows; finished goes away on its own", async () => {
    const l = await start({ config: DONE, env: { SPEAKKIT_FAKE_LATENCY_MS: "150" } });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    const mini = newWindow(l, "mini.html");
    await hook(l, "readText", TEXT);
    const m = await mini;
    await m.getByTestId("mini").waitFor();
    await until(async () => (await m.getByTestId("mini").getAttribute("data-status")) === "playing");
    expect(await hook<string>(l, "trayState")).toMatch(/^working\|SpeakKit - Reading \d of 3: One short sentence here\./);
    const labels = async () => (await hook<{ label: string }[]>(l, "trayItems")).map((i) => i.label);
    expect(await labels()).toEqual(expect.arrayContaining(["Pause", "Stop"]));

    await m.getByRole("button", { name: "Pause" }).click();
    await until(async () => (await m.getByTestId("mini").getAttribute("data-status")) === "paused");
    expect(await hook<string>(l, "trayState")).toMatch(/^paused\|SpeakKit - Paused:/);
    expect(await labels()).toContain("Resume");
    await m.getByRole("button", { name: "Play" }).click();
    await until(async () => (await m.getByTestId("mini").getAttribute("data-status")) === "playing");

    await m.getByRole("button", { name: "Next sentence" }).click();
    await until(async () => /Sentence [23] of 3/.test((await m.getByTestId("mini-status").textContent()) ?? ""));

    await until(async () => (await m.getByTestId("mini").getAttribute("data-status")) === "finished", 30_000);
    expect(await m.getByRole("button", { name: "Read again" }).count()).toBe(1);
    await until(() => m.isClosed(), 15_000); // the finished player leaves after a few seconds
    expect(await hook<string>(l, "trayState")).toMatch(/^normal\|/);
  }, 90_000);

  it("the tray panel shows the reading and its controls; clicking elsewhere closes it", async () => {
    const l = await start({ config: DONE, env: { SPEAKKIT_FAKE_LATENCY_MS: "150" } });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await hook(l, "readText", TEXT);
    const panelWin = newWindow(l, "panel.html");
    await hook(l, "togglePanel");
    const p = await panelWin;
    await p.getByTestId("tray-panel").waitFor();
    await p.getByText("Now playing").waitFor();
    await p
      .getByText(/One short sentence here\./)
      .first()
      .waitFor();
    await p.getByText("Next in queue").waitFor();
    await p.getByRole("button", { name: "Stop" }).click();
    await p.getByText(/Nothing is playing/).waitFor();
  }, 60_000);

  it("the tray menu has the short model: Do not disturb toggles, wake appears when the engine sleeps", async () => {
    const l = await start({ config: DONE, env: { SPEAKKIT_FAKE_STATE: "unloaded" } });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    const labels = async () => (await hook<{ label: string; checked?: boolean }[]>(l, "trayItems")).filter((i) => i.label);
    expect((await labels()).find((i) => i.label === "Do not disturb")!.checked).toBe(false);
    await hook(l, "clickTray", "Do not disturb");
    await expect.poll(() => configOf(l).doNotDisturb).toBe(true);
    await until(async () => (await labels()).find((i) => i.label === "Do not disturb")!.checked === true);
    expect((await labels()).map((i) => i.label)).toContain("Load the voice engine now");
  });
});

describe("notifications", () => {
  it("the table persists each switch and Do not disturb", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await settings(l, "Notifications");
    await l.page.getByRole("switch", { name: "Export finished: Sound" }).click();
    await l.page.getByRole("switch", { name: "Reading finished: Toast" }).click();
    await l.page.getByRole("switch", { name: "Do not disturb" }).click();
    await expect.poll(() => configOf(l)).toMatchObject({ doNotDisturb: true, notifications: { "export-done": { toast: true, bell: true, sound: true }, "reading-finished": { toast: true } } });
  });

  it("the clipboard prompt offers long copied text as a toast; clicking it reads the text", async () => {
    const l = await start({ config: { ...DONE, clipboardPrompt: true } });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await hide(l);
    await new Promise((r) => setTimeout(r, 1200));
    await l.app.evaluate(({ clipboard }) => clipboard.writeText("The quick brown fox jumps over the lazy dog while the sun sets slowly behind the distant hills and everyone goes home."));
    await until(async () => (await hook<{ title: string }[]>(l, "toasts")).some((t) => t.title === "Copied text: read it?"), 10_000);
    const mini = newWindow(l, "mini.html");
    await hook(l, "clickToast", 0);
    await (await mini).getByTestId("mini").waitFor();
  });
});

describe("export audio", () => {
  const writeNote = async (l: Launched) => {
    await l.page.getByRole("button", { name: "New reading" }).click();
    await l.page.getByRole("textbox", { name: "Text to read" }).fill("Exporting is simple. Each sentence is rendered once. Then the file is saved.");
    await l.page.getByRole("button", { name: "Export audio" }).click();
    await l.page.getByRole("dialog", { name: "Export audio" }).waitFor();
  };

  it("WAV: renders with progress, saves the file, shows where, and a toast follows when the window is hidden", async () => {
    const dir = outDir();
    const l = await start({ config: { ...DONE, exportPrefs: { format: "wav", mp3Kbps: 192, folder: dir } }, env: { SPEAKKIT_FAKE_LATENCY_MS: "250" } });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await writeNote(l);
    await l.page.getByRole("textbox", { name: "File name" }).fill("My note");
    expect(await l.page.getByTestId("export-estimate").textContent()).toMatch(/About \d+ KB/);
    await l.page.getByRole("button", { name: "Export", exact: true }).click();
    await l.page.getByTestId("export-progress").waitFor();
    await l.page.getByRole("button", { name: "Run in background" }).click();
    await l.page.getByTestId("export-pill").waitFor();
    await hide(l);
    await until(() => existsSync(path.join(dir, "My note.wav")), 20_000);
    const bytes = readFileSync(path.join(dir, "My note.wav"));
    expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString()).toBe("WAVE");
    expect(readdirSync(dir)).toEqual(["My note.wav"]); // no .part file left
    await until(async () => (await hook<{ title: string }[]>(l, "toasts")).some((t) => t.title === "Export finished"), 10_000);
  }, 60_000);

  it("MP3: encoded in the worker thread, with an MPEG frame header", async () => {
    const dir = outDir();
    const l = await start({ config: { ...DONE, exportPrefs: { format: "mp3", mp3Kbps: 128, folder: dir } } });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await writeNote(l);
    await l.page.getByRole("textbox", { name: "File name" }).fill("Spoken");
    await l.page.getByRole("button", { name: "Export", exact: true }).click();
    await l.page.getByTestId("export-done").waitFor();
    const mp3 = readFileSync(path.join(dir, "Spoken.mp3"));
    expect([mp3[0], mp3[1]! & 0xe0]).toEqual([0xff, 0xe0]);
    expect(mp3.length).toBeGreaterThan(1000);
    await l.page.getByRole("button", { name: "Show in folder" }).waitFor();
  }, 60_000);

  it("an existing file asks: Keep both writes beside it; Replace overwrites", async () => {
    const dir = outDir();
    const l = await start({ config: { ...DONE, exportPrefs: { format: "wav", mp3Kbps: 192, folder: dir } } });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await writeNote(l);
    await l.page.getByRole("textbox", { name: "File name" }).fill("Same");
    await l.page.getByRole("button", { name: "Export", exact: true }).click();
    await l.page.getByTestId("export-done").waitFor();
    await l.page.getByRole("button", { name: "Close" }).first().click();

    await writeNote(l);
    await l.page.getByRole("textbox", { name: "File name" }).fill("Same");
    await l.page.getByRole("button", { name: "Export", exact: true }).click();
    await l.page.getByTestId("export-exists").waitFor();
    await l.page.getByRole("button", { name: "Keep both" }).click();
    await l.page.getByTestId("export-done").waitFor();
    expect(readdirSync(dir).sort()).toEqual(["Same (2).wav", "Same.wav"]);
    await l.page.getByRole("button", { name: "Close" }).first().click();

    await writeNote(l);
    await l.page.getByRole("textbox", { name: "File name" }).fill("Same");
    await l.page.getByRole("button", { name: "Export", exact: true }).click();
    await l.page.getByRole("button", { name: "Replace" }).click();
    await l.page.getByTestId("export-done").waitFor();
    expect(readdirSync(dir).sort()).toEqual(["Same (2).wav", "Same.wav"]);
  }, 90_000);

  it("Cancel export stops the job and leaves no file; the palette opens the dialog too", async () => {
    const dir = outDir();
    const l = await start({ config: { ...DONE, exportPrefs: { format: "wav", mp3Kbps: 192, folder: dir } }, env: { SPEAKKIT_FAKE_LATENCY_MS: "700" } });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await l.page.keyboard.press("Control+K");
    await l.page.getByRole("combobox").fill("export audio");
    await l.page.keyboard.press("Enter");
    await l.page.getByRole("dialog", { name: "Export audio" }).waitFor();
    await l.page.getByRole("textbox", { name: "Text to export" }).fill("A long reading. With several sentences. Rendered slowly. For the cancel test.");
    await l.page.getByRole("button", { name: "Export", exact: true }).click();
    await l.page.getByTestId("export-progress").waitFor();
    await l.page.getByRole("button", { name: "Cancel export" }).click();
    await l.page.getByText("The export was cancelled. No file was written.").waitFor();
    expect(readdirSync(dir)).toEqual([]);
  }, 60_000);

  it("Quit lists the exports that would stop", async () => {
    const dir = outDir();
    const l = await start({ config: { ...DONE, exportPrefs: { format: "wav", mp3Kbps: 192, folder: dir } }, env: { SPEAKKIT_FAKE_LATENCY_MS: "700" } });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await writeNote(l);
    await l.page.getByRole("button", { name: "Export", exact: true }).click();
    await l.page.getByTestId("export-progress").waitFor();
    await l.page.getByRole("button", { name: "Run in background" }).click();
    await hook(l, "clickTray", "Quit SpeakKit");
    const list = l.page.getByRole("dialog", { name: "Quit SpeakKit?" });
    await list.getByText("1 export is rendering. Quitting stops:").waitFor();
    await list.getByText("The export is cancelled").waitFor();
  }, 60_000);
});

describe("updates (electron-updater is replaced by a fake that reports a new version)", () => {
  it("Check, download, Install when I quit, Restart now: never forced, one pill, one card", async () => {
    const l = await start({ config: DONE, env: { SPEAKKIT_FAKE_UPDATE: "0.2.0" } });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    expect(await l.page.getByTestId("update-pill").count()).toBe(0);
    await settings(l, "About");
    await l.page.getByRole("button", { name: "Check for updates" }).click();
    await l.page.getByTestId("update-ready").waitFor();
    await l.page.getByText("SpeakKit 0.2.0 is ready").waitFor();
    expect(await hook<number>(l, "installs")).toBe(0);

    await l.page.getByTestId("update-pill").click();
    await l.page.getByRole("dialog").getByRole("button", { name: "Install when I quit" }).click();
    await l.page.getByText("It installs when you quit SpeakKit.").first().waitFor();
    expect(await hook<number>(l, "installs")).toBe(0);

    await l.page.getByRole("button", { name: "Restart now" }).first().click();
    await l.page.getByTestId("updating-card").waitFor();
    await l.page.getByText("SpeakKit will reopen where you left off.").waitFor();
    await until(async () => (await hook<number>(l, "installs")) === 1);
  }, 60_000);

  it("a source checkout reports that it does not update itself", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await settings(l, "About");
    await l.page.getByText(/runs from a folder, so it does not update itself/).waitFor();
  });
});

describe("palette, engines and the extension", () => {
  it("system actions are in the palette: Do not disturb toggles the setting", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("heading", { name: "Home" }).waitFor();
    await l.page.keyboard.press("Control+K");
    await l.page.getByRole("combobox").fill("disturb");
    await l.page.keyboard.press("Enter");
    await expect.poll(() => configOf(l).doNotDisturb).toBe(true);
    await l.page.keyboard.press("Control+K");
    await l.page.getByRole("combobox").fill("clipboard");
    await l.page.getByRole("option", { name: /Read clipboard/ }).waitFor();
  });

  it("Engines lists the server's engines with their state and a Load now action", async () => {
    const l = await start({ config: DONE, env: { SPEAKKIT_FAKE_STATE: "unloaded" } });
    await l.page.getByRole("link", { name: "Engines" }).click();
    const kokoro = l.page.locator("[data-engine=kokoro]");
    await kokoro.getByText("Not in memory (0 MB). It loads when you press play.").waitFor();
    await kokoro.getByRole("button", { name: "Load now" }).click();
    await until(async () => (await kokoro.getAttribute("data-state")) === "ready" || (await kokoro.getAttribute("data-state")) === "loading");
  });

  it("Install the extension reveals the folder and shows the three steps", async () => {
    const l = await start({ config: DONE });
    await l.page.getByRole("link", { name: "Browser" }).click();
    await l.page.getByRole("button", { name: "Install from this app" }).click();
    const guide = l.page.getByTestId("install-guide");
    await guide.getByText("Load unpacked").waitFor();
    expect(await guide.locator("code").textContent()).toMatch(/extension[\\/]dist$/);
  });
});

describe("shutdown", () => {
  it("SpeakKit.exe --quit asks the running instance to exit and the port closes", async () => {
    const first = await start({ config: DONE });
    await first.page.getByRole("heading", { name: "Home" }).waitFor();
    const proc = first.app.process();
    const exited = new Promise<void>((r) => (proc.exitCode !== null ? r() : proc.once("exit", () => r())));
    await launch({ userData: first.userData, port: first.port, args: ["--quit"] }).catch(() => null);
    await exited;
    await expect(fetch(`http://127.0.0.1:${first.port}/v1/health`)).rejects.toThrow();
  }, 60_000);
});
