import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ElectronApplication, Page } from "@playwright/test";
import { nodeBuild } from "../node-build";
import { _electron, appDir, electronPath, removeDir } from "./harness";
import { loadWin32 } from "../src/main/dictation/windows/native";
import type { VisionApi } from "./support/vision-host";

/**
 * Screen vision against real Windows. A stand-in program shows a window with known text; the app side (real capture, OCR helper, indicator,
 * consent card) runs in another Electron process and looks at it the way the voice chat does. Takes the foreground for a few seconds.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (f: () => Promise<boolean> | boolean, ms = 15_000) => {
  for (const end = Date.now() + ms; Date.now() < end;) {
    if (await f()) return;
    await sleep(50);
  }
  expect(await f()).toBe(true);
};

let outDir: string;
let userData: string[];
let host: ElectronApplication;
let target: ElectronApplication;

type Call = { [K in keyof VisionApi]: (...a: Parameters<VisionApi[K]>) => Promise<Awaited<ReturnType<VisionApi[K]>>> };
const call = new Proxy({} as Call, {
  get:
    (_, name: string) =>
    (...args: unknown[]) =>
      host.evaluate((_electron, [n, a]) => (globalThis as unknown as { __vision: Record<string, (...x: unknown[]) => unknown> }).__vision[n]!(...(a as unknown[])), [name, args] as const),
});

const launchApp = (script: string) => {
  const dir = mkdtempSync(path.join(tmpdir(), "speakkit-vision-"));
  userData.push(dir);
  const env = Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined && e[0] !== "ELECTRON_RUN_AS_NODE"));
  return _electron.launch({ executablePath: electronPath, args: [path.join(outDir, script), `--user-data-dir=${dir}`], env });
};

/** The stand-in window in front, the way a user's click puts it there. */
async function focusTarget() {
  for (let i = 0; i < 12 && (await call.foregroundTitle()) !== "SKVISION Target"; i++) {
    await target.evaluate(() => (globalThis as unknown as { __target: { raise(): void } }).__target.raise());
    await sleep(300);
  }
  expect(await call.foregroundTitle()).toBe("SKVISION Target");
}

const CARD_TITLE = encodeURIComponent("Let the voice chat");
/** The consent card as a page of the app process, once it has loaded. */
async function cardPage(): Promise<Page> {
  let page: Page | undefined;
  await until(() => !!(page = host.windows().find((p) => p.url().startsWith("data:text/html") && p.url().includes(CARD_TITLE))));
  await page!.waitForLoadState("domcontentloaded");
  await sleep(150); // the buttons are wired once the page finished loading
  return page!;
}

if (process.platform !== "win32")
  it("needs Windows: screen capture with its own-window exclusion and the OCR helper are not implemented elsewhere", () => {
    expect(process.platform).not.toBe("win32");
  });
else visionSpec();

function visionSpec() {
  describe("screen vision on Windows", () => {
    beforeAll(async () => {
      userData = [];
      outDir = path.join(appDir, "dist-screen-vision");
      await nodeBuild("tests/support/vision-host.ts", outDir, "es", "host.js");
      await nodeBuild("tests/support/vision-target.ts", outDir, "es", "target.js", { empty: false });
      target = await launchApp("target.js");
      await until(() => target.evaluate(() => "__target" in globalThis));
      host = await launchApp("host.js");
      await until(() => host.evaluate(() => "__vision" in globalThis));
      await focusTarget();
    }, 90_000);

    afterAll(async () => {
      await call.dispose().catch(() => {});
      await Promise.all([host?.close(), target?.close()].map((p) => p?.catch(() => {})));
      await removeDir(outDir);
      await Promise.all(userData.map(removeDir));
    });

    it("captures the window in front and reads its text at full resolution", async () => {
      await focusTarget();
      const first = await call.look({ session: "w1", scope: "window" });
      const second = await call.look({ session: "w1", scope: "window" });
      console.log(`screen vision: first look ${first.ms} ms (starts the OCR helper), next look ${second.ms} ms`);
      expect(first).toMatchObject({ ok: true, scope: "window", target: "SKVISION Target", ocr: "ok", jpeg: "ffd8ff" });
      expect(first.ok && first.text).toContain("Invoice 48213 total 129.50 EUR");
      expect(first.ok && first.text).toContain("Order SpeakKit-7731 shipped to Berlin");
      expect(first.ok && first.text).toContain("The quick brown fox jumps over the lazy dog");
      if (!first.ok) return;
      expect(first.bytes).toBeGreaterThan(1000);
      expect(first.bytes).toBeLessThanOrEqual(190_000);
      expect(first.size).toEqual({ width: first.width, height: first.height });
      expect(Math.max(first.width, first.height)).toBeLessThanOrEqual(1280);
      // the window is 900x420 in logical units: its picture has that shape, not the screen's
      expect(first.width / first.height).toBeGreaterThan(1.8);
      expect(first.width / first.height).toBeLessThan(2.5);
      expect(second.ok && second.text).toBe(first.text);
    });

    it("keeps Speak Kit's own windows out of the picture", async () => {
      await call.ownWindow(true);
      await sleep(600);
      expect(await call.rawMagenta()).toBeGreaterThan(0.03); // without the exclusion the magenta window is in the capture
      const r = await call.look({ session: "own", scope: "screen" });
      await call.ownWindow(false);
      expect(r).toMatchObject({ ok: true, scope: "screen", target: "screen", jpeg: "ffd8ff" });
      expect(r.ok && r.magenta).toBeLessThan(0.001);
      expect(r.ok && r.bytes).toBeLessThanOrEqual(190_000);
    });

    it("shows a notice that ignores the mouse and cannot take focus while it looks and a moment after, then removes it", async () => {
      await call.look({ session: "ind", scope: "screen" });
      const notice = (await call.windows()).filter((w) => w.url.startsWith("data:text/html"));
      expect(notice).toEqual([expect.objectContaining({ visible: true, focusable: false, onTop: true })]);
      await until(async () => !(await call.windows()).some((w) => w.url.startsWith("data:text/html")), 4000);
    });

    describe("consent card", () => {
      const start = (session: string) => call.start({ session, scope: "screen" });
      beforeEach(() => call.setCard({ real: true }));
      // a failed test must not leave a card open and a look pending for the next one
      afterEach(async () => {
        await call.cancel();
        await call.setCard({ real: false });
      });

      it("asks once per conversation: Allow lets the look through and the next look in that conversation does not ask again", async () => {
        const before = await call.asked();
        await start("card-yes");
        const page = await cardPage();
        expect(await page.locator("h1").textContent()).toBe("Let the voice chat look at your screen?");
        expect(await page.evaluate(() => document.activeElement?.getAttribute("data-choice"))).toBe("yes");
        await page.locator("button[data-choice=yes]").click();
        expect(await call.result()).toMatchObject({ ok: true, target: "screen" });
        await start("card-yes");
        expect(await call.result()).toMatchObject({ ok: true });
        expect(await call.asked()).toBe(before + 1);
        expect(host.windows().some((p) => p.url().includes(CARD_TITLE))).toBe(false);
      });

      it("Not now declines, and the user is asked again at the next look", async () => {
        await start("card-no");
        await (await cardPage()).locator("button[data-choice=no]").click();
        expect(await call.result()).toEqual({ ok: false, code: "declined" });
        await start("card-no");
        await (await cardPage()).locator("button[data-choice=no]").click();
        expect(await call.result()).toEqual({ ok: false, code: "declined" });
      });

      it("Escape declines", async () => {
        await start("card-esc");
        await cardPage();
        // The app is not the program in front when the card opens, so the card shows but the keyboard stays with the browser until the user clicks it; the test raises the card the way a click would.
        const w = await loadWin32();
        for (let i = 0; i < 12 && w.address(w.foregroundWindow()) !== (await call.cardHandle()); i++) {
          await call.raiseCard();
          await sleep(300);
        }
        expect(w.address(w.foregroundWindow())).toBe(await call.cardHandle());
        // a real key press: the card reads it before the page does
        const esc = (up: boolean) => ({ type: 1 as const, u: { ki: { wVk: 0x1b, wScan: w.mapVirtualKey(0x1b, w.keyboardLayout(0)), dwFlags: (up ? 2 : 0) | 8, time: 0 as const, dwExtraInfo: 0 } } });
        w.sendInput([esc(false), esc(true)]);
        expect(await call.result()).toEqual({ ok: false, code: "declined" });
      });

      it("closing the window declines", async () => {
        await start("card-close");
        await cardPage();
        await host.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((w) => w.title === "Speak Kit")
            ?.close(),
        );
        expect(await call.result()).toEqual({ ok: false, code: "declined" });
      });
    });
  });
}
