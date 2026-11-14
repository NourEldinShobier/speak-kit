import { execFileSync } from "node:child_process";
import { app, BrowserWindow, clipboard, ClipboardItem, nativeImage } from "electron";
import { DEFAULT_DICTATION } from "../../src/shared/dictation/settings";
import { runTransform } from "../../src/main/dictation/transform-run";
import { createDictationOs, VK, type HotkeyEvent, type HudState, type InsertOptions } from "../../src/main/dictation";
import { createKeyboardHook } from "../../src/main/dictation/keyboard-hook";
import { CLIPBOARD_PRIVACY_MARKS } from "../../src/main/dictation/types";
import { installKeyboardHook } from "../../src/main/dictation/windows/hook";
import { OWN_INPUT_MARKER } from "../../src/main/dictation/windows/input";
import { loadWin32 } from "../../src/main/dictation/windows/native";

/** The app side of the dictation spec: the real module, driven from the test through globalThis.__dictation. */
app.on("window-all-closed", () => {});

async function build() {
  const w = await loadWin32();
  const os = await createDictationOs({ hud: { idleMs: 500 } });
  const osTyping = await createDictationOs({ overrides: [{ exe: "electron", profile: { shortcut: "type" } }] });

  const state = { stallMs: 0, poisoned: false };
  const events: HotkeyEvent[] = [];
  const faults: string[] = [];
  const handlers = {
    onEvent(e: HotkeyEvent) {
      events.push(e);
      if (e.kind === "down" && state.stallMs) for (const end = Date.now() + state.stallMs; Date.now() < end;) continue;
    },
    onFault: (e: unknown) => void faults.push(String(e)),
  };

  // The same hook as the app's, with a switch that makes its decision code throw, to prove the keyboard survives that.
  const poisonable = createKeyboardHook(
    {
      install: (onKey, onFault) =>
        installKeyboardHook(
          w,
          (key) => {
            if (state.poisoned) throw new Error("poisoned");
            return onKey(key);
          },
          onFault,
        ),
      keyIsDown: w.keyIsDown,
    },
    { marker: OWN_INPUT_MARKER },
  );

  const user32 = w.koffi.load("user32.dll");
  const GetWindowLongW = user32.func("int32 __stdcall GetWindowLongW(void *h, int i)");
  const hudWindow = () => BrowserWindow.getAllWindows()[0];

  const PIXELS = Buffer.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]);

  const api = {
    start: (poison = false) => (poison ? poisonable : os.hotkey).start({ keys: [VK.rightCtrl] }, handlers),
    startChord: (keys: number[]) => os.hotkey.start({ keys }, handlers),
    stop: () => (poisonable.stop(), os.hotkey.stop()),
    grab: (keys: number[]) => os.hotkey.grab(keys),
    active: () => ({ os: os.hotkey.active, poisonable: poisonable.active }),
    takeEvents: () => events.splice(0),
    faults: () => [...faults],
    stall: (ms: number) => void (state.stallMs = ms),
    poison: (on: boolean) => void (state.poisoned = on),
    foreground: () => os.foreground(),
    insert: (text: string, options?: InsertOptions) => os.insert(text, options),
    insertTyping: (text: string) => osTyping.insert(text),
    transform: (extra: { replacements?: { from: string; to: string }[] } = {}) => runTransform(os, { ...DEFAULT_DICTATION, language: "en", ...extra }),
    settled: () => os.settled(),
    hudShow: (s: HudState) => os.hud.show(s),
    hudUpdate: (s: HudState) => os.hud.update(s),
    hudHide: () => os.hud.hide(),
    hudExists: () => os.hud.exists,
    windowCount: () => BrowserWindow.getAllWindows().length,
    hudInfo: async () => {
      const win = hudWindow();
      if (!win) return null;
      const ex = GetWindowLongW(w.koffi.decode(win.getNativeWindowHandle(), "void *"), -20) >>> 0;
      const page = (await win.webContents.executeJavaScript(
        `({ kind: document.body.dataset.kind, tone: document.body.dataset.tone, text: document.body.dataset.text, level: document.documentElement.style.getPropertyValue("--hud-level") })`,
      )) as { kind: string; tone: string; text: string; level: string };
      return {
        page,
        visible: win.isVisible(),
        focused: win.isFocused(),
        focusable: win.isFocusable(),
        alwaysOnTop: win.isAlwaysOnTop(),
        // WS_EX_NOACTIVATE, WS_EX_TOPMOST, WS_EX_TRANSPARENT (what click-through sets), WS_EX_LAYERED.
        noActivate: !!(ex & 0x08000000),
        topmost: !!(ex & 0x8),
        clickThrough: !!(ex & 0x20),
        layered: !!(ex & 0x80000),
      };
    },
    /** Puts a known clipboard in place: nothing, plain text, HTML with its text, or a 2x2 image. */
    setClipboard: async (kind: "empty" | "text" | "html" | "image") => {
      if (kind === "empty") return clipboard.clear();
      if (kind === "text") return clipboard.writeText("the old clipboard");
      if (kind === "html") return clipboard.write([new ClipboardItem({ "text/html": "<b>the old html</b>", "text/plain": "the old html" })]);
      const png = nativeImage.createFromBitmap(PIXELS, { width: 2, height: 2 }).toPNG();
      return clipboard.write([new ClipboardItem({ "image/png": new Blob([new Uint8Array(png)], { type: "image/png" }) })]);
    },
    /** Which of the clipboard-history privacy marks the clipboard carries. */
    clipboardMarks: () => CLIPBOARD_PRIVACY_MARKS.filter((m) => w.clipboardHas(m)),
    /** A copy the way a password manager makes it: text, marked as not for clipboard history. */
    setMarkedClipboard: () => (clipboard.writeText("the secret"), w.clipboardAdd(["CanIncludeInClipboardHistory"])),
    /** Copies a file the way Explorer does (a file list, which Electron cannot read back). */
    setClipboardFiles: (file: string) => void execFileSync("powershell", ["-NoProfile", "-Command", `Set-Clipboard -Path '${file}'`]),
    clipboardHasFiles: () => w.clipboardHas(15),
    /** What is on the clipboard, in a form that can be compared. */
    clipboardNow: async () => {
      const items = await clipboard.read();
      const types = items.flatMap((i) => i.types).sort();
      const text = types.includes("text/plain") ? await clipboard.readText() : null;
      const htmlItem = items.find((i) => i.types.includes("text/html"));
      const html = htmlItem ? await (await htmlItem.getType("text/html")).text() : null;
      const imageItem = items.find((i) => i.types.includes("image/png"));
      const png = imageItem ? Buffer.from(await (await imageItem.getType("image/png")).arrayBuffer()) : null;
      return { types, text, html, pixels: png ? nativeImage.createFromBuffer(png).toBitmap().toString("hex") : null };
    },
  };

  return api;
}

export type HostApi = Awaited<ReturnType<typeof build>>;
// Playwright cannot attach to an app whose main module is still waiting for ready at its top level.
void app.whenReady().then(async () => ((globalThis as Record<string, unknown>).__dictation = await build()));
