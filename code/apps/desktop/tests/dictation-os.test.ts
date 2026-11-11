import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ElectronApplication, Page } from "@playwright/test";
import { nodeBuild } from "../node-build";
import { createForeground } from "../src/main/dictation/windows/foreground";
import { loadWin32, type KeyInput, type Win32 } from "../src/main/dictation/windows/native";
import { VK } from "../src/main/dictation";
import { _electron, appDir, electronPath, removeDir } from "./harness";
import type { HostApi } from "./support/dictation-host";

/**
 * The dictation OS layer against real Windows. This test process plays the user: it injects key presses with SendInput and watches which window is
 * in front. The app side (hook, paste, HUD) runs in one Electron process and the program being dictated into is another, so a paste crosses a
 * process boundary and the hook is a real system-wide hook. Takes over the keyboard and the foreground for a few seconds.
 */
const KEYUP = 0x2;
const SCANCODE = 0x8;
const EXTENDED = 0x1;
const VK_SHIFT = 0x10;
const KEY_X = 0x58;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => Promise<boolean> | boolean, ms = 10_000) => {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (await f()) return;
    await sleep(20);
  }
  expect(await f()).toBe(true);
};

let w: Win32;
let outDir: string;
let userData: string[];
let host: ElectronApplication;
let target: ElectronApplication;
let targetPage: Page;
let targetPid = 0;

const fg = () => createForeground(w).info();
const key = (vk: number, up: boolean, extended = false): KeyInput => {
  const scan = extended ? 0 : w.mapVirtualKey(vk, w.keyboardLayout(0));
  return { type: 1, u: { ki: { wVk: vk, wScan: scan, dwFlags: (up ? KEYUP : 0) | (extended ? EXTENDED : 0) | (scan ? SCANCODE : 0), time: 0, dwExtraInfo: 0 } } };
};
const press = (vk: number, extended = false) => w.sendInput([key(vk, false, extended)]);
const release = (vk: number, extended = false) => w.sendInput([key(vk, true, extended)]);
const tap = (vk: number) => w.sendInput([key(vk, false), key(vk, true)]);

type Call = { [K in keyof HostApi]: (...a: Parameters<HostApi[K]>) => Promise<Awaited<ReturnType<HostApi[K]>>> };
const call = new Proxy({} as Call, {
  get:
    (_, name: string) =>
    (...args: unknown[]) =>
      host.evaluate((_electron, [n, a]) => (globalThis as unknown as { __dictation: Record<string, (...x: unknown[]) => unknown> }).__dictation[n]!(...(a as unknown[])), [name, args] as const),
});

/** Hotkey events the app has reported so far, waiting until there are at least `n`. */
async function events(n: number) {
  const got: Awaited<ReturnType<Call["takeEvents"]>> = [];
  await until(async () => (got.push(...(await call.takeEvents())), got.length >= n));
  await sleep(60);
  got.push(...(await call.takeEvents()));
  return got;
}

const typed = () => targetPage.evaluate(() => (document.getElementById("t") as HTMLTextAreaElement).value);
const keysSeen = () => targetPage.evaluate(() => (window as unknown as { keys: { code: string; key: string; shift: boolean }[] }).keys);
const resetTarget = () =>
  targetPage.evaluate(() => {
    const t = document.getElementById("t") as HTMLTextAreaElement;
    t.value = "";
    t.focus();
    (window as unknown as { keys: unknown[] }).keys = [];
  });

/** Brings the target window to the front the way a user would: any key press first, so Windows lets a background process take the foreground. */
async function focusTarget() {
  for (let i = 0; i < 12 && fg()?.pid !== targetPid; i++) {
    await target.evaluate(() => (globalThis as unknown as { __target: { raise(): void } }).__target.raise());
    await sleep(300);
  }
  expect(fg()?.pid).toBe(targetPid);
  await resetTarget();
}

const launchApp = (script: string) => {
  const dir = mkdtempSync(path.join(tmpdir(), "speakkit-dictation-"));
  userData.push(dir);
  const env = Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined && e[0] !== "ELECTRON_RUN_AS_NODE"));
  return _electron.launch({ executablePath: electronPath, args: [path.join(outDir, script), `--user-data-dir=${dir}`], env });
};

// A plain `if`, not describe.runIf: the key hook and key injection exist only on Windows, and a skipped block would count against the test-integrity baseline.
if (process.platform !== "win32")
  it("needs Windows: key hook, key injection and foreground control are not implemented elsewhere", () => {
    expect(process.platform).not.toBe("win32");
  });
else dictationOsSpec();

function dictationOsSpec() {
  describe("dictation OS layer on Windows", () => {
    beforeAll(async () => {
      userData = [];
      outDir = path.join(appDir, "dist-dictation-os");
      await nodeBuild("tests/support/dictation-host.ts", outDir, "es", "host.js");
      await nodeBuild("tests/support/dictation-target.ts", outDir, "es", "target.js", { empty: false });
      w = await loadWin32();
      target = await launchApp("target.js");
      targetPage = await target.firstWindow();
      await until(() => target.evaluate(() => "__target" in globalThis));
      targetPid = await target.evaluate(() => process.pid);
      host = await launchApp("host.js");
      await until(() => host.evaluate(() => "__dictation" in globalThis));
      await focusTarget();
    }, 90_000);

    afterAll(async () => {
      await call.stop().catch(() => {});
      await Promise.all([host?.close(), target?.close()].map((p) => p?.catch(() => {})));
      await removeDir(outDir);
      await Promise.all(userData.map(removeDir));
    });

    afterEach(async () => {
      // A failed test must not leave a key held on the real keyboard.
      release(VK_SHIFT);
      release(VK.rightCtrl, true);
      await call.stop();
      await call.stall(0);
      await call.poison(false);
    });

    describe("foreground window", () => {
      it("reports the program, window class and rights of the window in front", async () => {
        await focusTarget();
        expect(await call.foreground()).toMatchObject({ pid: targetPid, exe: "electron.exe", className: "Chrome_WidgetWin_1", elevated: false });
      });
    });

    describe("hotkey", () => {
      it("reports press and release of the chord and keeps the chord away from the focused window, while other keys get through", async () => {
        await focusTarget();
        expect(await call.start()).toEqual({ ok: true });
        press(VK.rightCtrl, true);
        release(VK.rightCtrl, true);
        expect(await events(2)).toEqual([{ kind: "down" }, { kind: "up" }]);
        tap(KEY_X);
        await until(async () => (await typed()) === "x");
        expect((await keysSeen()).map((k) => k.key)).toEqual(["x"]);
        await call.stop();
      });

      it("reports another key pressed during the hold and still delivers it", async () => {
        await focusTarget();
        await call.start();
        await call.takeEvents();
        press(VK.rightCtrl, true);
        await sleep(50);
        tap(KEY_X);
        await until(async () => (await typed()) === "x");
        release(VK.rightCtrl, true);
        expect(await events(3)).toEqual([{ kind: "down" }, { kind: "other", vk: KEY_X }, { kind: "up" }]);
        expect((await keysSeen()).map((k) => k.code)).toEqual(["KeyX"]);
        await call.stop();
      });

      it("a grabbed key is swallowed and reported until it is released from the list", async () => {
        await focusTarget();
        await call.start();
        await call.takeEvents();
        await call.grab([VK.escape]);
        tap(VK.escape);
        expect(await events(1)).toEqual([{ kind: "grabbed", vk: VK.escape }]);
        await call.grab([]);
        tap(VK.escape);
        await until(async () => (await keysSeen()).some((k) => k.code === "Escape"));
        expect((await keysSeen()).filter((k) => k.code === "Escape")).toHaveLength(1);
        await call.stop();
      });

      it("refuses a second start", async () => {
        await call.start();
        expect(await call.start()).toEqual({ ok: false, reason: "already-running" });
        await call.stop();
      });

      it("a handler that blocks the main thread for 700 ms does not stop other programs from receiving keys, and the hook works afterwards", async () => {
        await focusTarget();
        await call.start();
        await call.takeEvents();
        await call.stall(700);
        press(VK.rightCtrl, true);
        await sleep(20);
        const t0 = Date.now();
        tap(KEY_X);
        await until(async () => (await keysSeen()).some((k) => k.code === "KeyX"), 5000);
        const delay = Date.now() - t0;
        release(VK.rightCtrl, true);
        await call.stall(0);
        await sleep(1200);
        // Whatever Windows did to the hook during the stall, it is working again: a fresh press and release are reported.
        await call.takeEvents();
        press(VK.rightCtrl, true);
        release(VK.rightCtrl, true);
        expect(await events(2)).toEqual([{ kind: "down" }, { kind: "up" }]);
        expect(delay).toBeLessThan(2500);
        await call.stop();
      });

      it("a callback that throws lets the key through, removes the hook and reports the fault, and the keyboard keeps working", async () => {
        await focusTarget();
        expect(await call.start(true)).toEqual({ ok: true });
        await call.poison(true);
        tap(KEY_X);
        await until(async () => (await typed()) === "x");
        await until(async () => (await call.faults()).length === 1);
        expect((await call.faults())[0]).toContain("poisoned");
        expect((await call.active()).poisonable).toBe(false);
        // The hook is gone: the chord key now reaches the window.
        press(VK.rightCtrl, true);
        release(VK.rightCtrl, true);
        await until(async () => (await keysSeen()).some((k) => k.key === "Control"));
        // And it can be started again once the fault is fixed.
        await call.poison(false);
        expect(await call.start(true)).toEqual({ ok: true });
        await call.stop();
      });
    });

    describe("paste", () => {
      const clipboardCases = ["text", "html", "image", "empty"] as const;

      it.each(clipboardCases)("pastes into the other program's field, leaves the foreground alone and restores a %s clipboard", async (kind) => {
        await focusTarget();
        const front = fg()!.hwnd;
        await call.setClipboard(kind);
        const before = await call.clipboardNow();
        const seen = new Set<string>();
        // GetForegroundWindow returns NULL for a moment while the system switches windows; that is not another window.
        const watcher = setInterval(() => {
          const now = fg()?.hwnd;
          if (now) seen.add(now);
        }, 10);
        const result = await call.insert("Hello from dictation", { target: front });
        await call.settled();
        clearInterval(watcher);
        expect(result).toEqual({ status: "pasted" });
        await until(async () => (await typed()) === "Hello from dictation");
        expect([...seen]).toEqual([front]);
        expect(await call.clipboardNow()).toEqual(before);
      });

      it("does not trigger or swallow its own Ctrl+V when that is the chord the hook is waiting for", async () => {
        await focusTarget();
        await call.setClipboard("text");
        expect(await call.startChord([VK.leftCtrl, VK.v])).toEqual({ ok: true });
        await call.takeEvents();
        expect(await call.insert("own keys")).toEqual({ status: "pasted" });
        await until(async () => (await typed()) === "own keys");
        await sleep(200);
        expect(await call.takeEvents()).toEqual([]);
      });

      it("sends exactly Ctrl+V as left Ctrl and V, with no Shift", async () => {
        await focusTarget();
        await call.setClipboard("text");
        await call.insert("abc");
        await call.settled();
        expect((await keysSeen()).map((k) => ({ code: k.code, shift: k.shift }))).toEqual([
          { code: "ControlLeft", shift: false },
          { code: "KeyV", shift: false },
        ]);
      });

      it("waits for the user to let go of Shift before pasting", async () => {
        await focusTarget();
        await call.setClipboard("text");
        press(VK_SHIFT);
        const t0 = Date.now();
        const pending = call.insert("after shift");
        await sleep(250);
        expect(await typed()).toBe("");
        release(VK_SHIFT);
        expect(await pending).toEqual({ status: "pasted" });
        await call.settled();
        expect(Date.now() - t0).toBeGreaterThanOrEqual(250);
        await until(async () => (await typed()) === "after shift");
        expect((await keysSeen()).find((k) => k.code === "KeyV")?.shift).toBe(false);
      });

      it("only copies when the window in front is not the one the key was pressed in", async () => {
        await focusTarget();
        await call.setClipboard("text");
        expect(await call.insert("not pasted", { target: "1" })).toEqual({ status: "copied", reason: "foreground-changed" });
        await sleep(700);
        expect(await typed()).toBe("");
        expect((await call.clipboardNow()).text).toBe("not pasted");
      });

      it("copy mode sends no keys; keep mode pastes and leaves the text on the clipboard", async () => {
        await focusTarget();
        await call.setClipboard("text");
        expect(await call.insert("copied", { mode: "copy" })).toEqual({ status: "copied", reason: "copy-only" });
        expect(await keysSeen()).toEqual([]);
        expect(await call.insert("kept", { mode: "keep" })).toEqual({ status: "pasted" });
        await until(async () => (await typed()) === "kept");
        await sleep(800);
        expect((await call.clipboardNow()).text).toBe("kept");
      });

      it("types Unicode without touching the clipboard when a rule says so", async () => {
        await focusTarget();
        await call.setClipboard("text");
        const text = "Größe ✓ مرحبا 👍\nline two";
        expect(await call.insertTyping(text)).toEqual({ status: "typed" });
        await until(async () => (await typed()).replaceAll("\r\n", "\n") === text);
        expect((await call.clipboardNow()).text).toBe("the old clipboard");
      });
    });

    describe("password fields", () => {
      // A real Windows Forms password box in its own process; the foreground is taken the way the target window does it, by tapping a key first.
      const PASSWORD_FORM = [
        "Add-Type -AssemblyName System.Windows.Forms",
        "Add-Type -Name K -Namespace W -MemberDefinition '[DllImport(\"user32.dll\")] public static extern void keybd_event(byte vk, byte scan, uint flags, System.UIntPtr extra);'",
        "$f = New-Object System.Windows.Forms.Form; $f.Text = 'Password test'; $f.Width = 300; $f.Height = 120; $f.TopMost = $true",
        "$t = New-Object System.Windows.Forms.TextBox; $t.UseSystemPasswordChar = $true; $t.Dock = 'Top'; $f.Controls.Add($t)",
        "$f.Add_Shown({ [W.K]::keybd_event(0x12,0,0,[UIntPtr]::Zero); [W.K]::keybd_event(0x12,0,2,[UIntPtr]::Zero); $f.Activate(); $t.Focus() })",
        "[void]$f.ShowDialog()",
      ].join("; ");

      it("refuses to paste or copy when a password box has the focus", async () => {
        await call.setClipboard("text");
        const form = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(PASSWORD_FORM, "utf16le").toString("base64")], { windowsHide: true, stdio: "ignore" });
        try {
          await until(() => fg()?.pid === form.pid || fg()?.exe === "powershell.exe", 20_000);
          await sleep(500);
          expect(await call.insert("my dictated secret")).toEqual({ status: "refused", reason: "password-field" });
          expect(await call.insertTyping("my dictated secret")).toEqual({ status: "refused", reason: "password-field" });
          expect((await call.clipboardNow()).text).toBe("the old clipboard");
        } finally {
          form.kill();
        }
      });
    });

    describe("HUD", () => {
      it("is created on demand, shows without taking the foreground, lets the mouse through, and goes away after the idle time", async () => {
        await focusTarget();
        const front = fg()!.hwnd;
        expect(await call.windowCount()).toBe(0);
        await call.hudShow({ kind: "recording", level: 0.5 });
        await until(async () => (await call.hudInfo())?.visible === true);
        expect(await call.hudInfo()).toMatchObject({
          visible: true,
          focused: false,
          focusable: false,
          alwaysOnTop: true,
          noActivate: true,
          topmost: true,
          clickThrough: true,
          layered: true,
          page: { kind: "recording", level: "0.5" },
        });
        expect(fg()?.hwnd).toBe(front);
        // Typing while it is visible still goes to the program in front.
        await resetTarget();
        expect(await call.insertTyping("typed under the HUD")).toEqual({ status: "typed" });
        await until(async () => (await typed()) === "typed under the HUD");
        await call.hudUpdate({ kind: "notice", tone: "error", text: "Copied, press Ctrl+V" });
        await until(async () => (await call.hudInfo())?.page.text === "Copied, press Ctrl+V");
        expect((await call.hudInfo())?.page).toMatchObject({ kind: "notice", tone: "error" });
        await call.hudHide();
        expect((await call.hudInfo())?.visible).toBe(false);
        expect(fg()?.hwnd).toBe(front);
        await until(async () => (await call.windowCount()) === 0, 3000);
        expect(await call.hudExists()).toBe(false);
        await call.hudShow({ kind: "transcribing" });
        await until(async () => (await call.hudInfo())?.visible === true);
        expect(fg()?.hwnd).toBe(front);
        await call.hudHide();
      });
    });
  });
}
