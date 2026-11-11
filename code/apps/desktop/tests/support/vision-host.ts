import { app, BrowserWindow, nativeImage, screen } from "electron";
import { loadWin32 } from "../../src/main/dictation/windows/native";
import type { LookRequest } from "@speakkit/protocol";
import { createConsentCard } from "../../src/main/screen-vision/card";
import { createIndicator } from "../../src/main/screen-vision/indicator";
import { createLook } from "../../src/main/screen-vision/look";
import { createOcr } from "../../src/main/screen-vision/ocr";
import { createElectronPlatform } from "../../src/main/screen-vision/platform";

/** The app side of the screen vision spec: the real capture, OCR helper, indicator and card, driven from the test through globalThis.__vision. */
app.on("window-all-closed", () => {});

function build() {
  const platform = createElectronPlatform();
  const ocr = createOcr();
  const realCard = createConsentCard();
  const state = { real: false, answer: true, asked: 0 };
  const card = {
    ask: (signal: AbortSignal, scope: LookRequest["scope"]) => {
      state.asked++;
      return state.real ? realCard.ask(signal, scope) : Promise.resolve(state.answer);
    },
  };
  const { look } = createLook({ platform, ocr, card, indicator: createIndicator(), settleMs: 50 });
  let pending: Promise<unknown> | undefined;
  let ac = new AbortController();

  /** Share of pixels that are magenta, from a base64 JPEG or a raw capture. */
  const magenta = (bgra: Buffer) => {
    let n = 0;
    for (let i = 0; i < bgra.length; i += 4) if (bgra[i + 2]! > 200 && bgra[i + 1]! < 90 && bgra[i]! > 200) n++;
    return n / (bgra.length / 4);
  };
  const lookTimed = async (req: LookRequest) => {
    const t = performance.now();
    const r = await look(req, ac.signal);
    return { r, ms: Math.round(performance.now() - t) };
  };

  return {
    foregroundTitle: async () => {
      const f = platform.foreground();
      return (await platform.windows()).find((w) => f && w.id.startsWith(`${f}:`))?.name;
    },
    ownWindow: (show: boolean) => {
      for (const w of BrowserWindow.getAllWindows()) if (w.title === "SKVISION own") w.destroy();
      if (!show) return;
      const area = screen.getPrimaryDisplay().workArea;
      const w = new BrowserWindow({ x: area.x + 40, y: area.y + 40, width: 700, height: 500, title: "SKVISION own", show: true, alwaysOnTop: true, backgroundColor: "#ff00ff" });
      w.setAlwaysOnTop(true, "screen-saver");
      void w.loadURL("data:text/html,<body style='background:%23f0f;margin:0'>own");
    },
    cardHandle: () =>
      String(
        BrowserWindow.getAllWindows()
          .find((w) => w.title === "Speak Kit")
          ?.getNativeWindowHandle()
          .readBigUInt64LE(0),
      ),
    /** Takes the foreground for the card the way a click would (any key press first, so Windows lets a background process do it). */
    raiseCard: async () => {
      const w = await loadWin32();
      const alt = (up: boolean) => ({ type: 1 as const, u: { ki: { wVk: 0x12, wScan: 0, dwFlags: up ? 2 : 0, time: 0 as const, dwExtraInfo: 0 } } });
      w.sendInput([alt(false), alt(true)]);
      app.focus({ steal: true });
      BrowserWindow.getAllWindows()
        .find((x) => x.title === "Speak Kit")
        ?.focus();
    },
    setCard: (o: { real?: boolean; answer?: boolean }) => Object.assign(state, o),
    asked: () => state.asked,
    /** One look; the picture is summarised (size, JPEG header, how much of it is magenta), not returned. */
    look: async (req: LookRequest) => {
      const { r, ms } = await lookTimed(req);
      if (!r.ok) return { ok: false as const, code: r.code, ms };
      const jpeg = Buffer.from(r.look.image, "base64");
      const img = jpeg.length ? nativeImage.createFromBuffer(jpeg) : undefined;
      return {
        ok: true as const,
        ms,
        ...r.look,
        image: undefined,
        bytes: jpeg.length,
        jpeg: jpeg.subarray(0, 3).toString("hex"),
        size: img?.getSize(),
        magenta: img ? magenta(img.toBitmap()) : 0,
      };
    },
    /** What a capture shows when Speak Kit's windows are not excluded: the control for the exclusion. */
    rawMagenta: async () => {
      const display = platform.displays().find((d) => platform.cursor().x >= d.bounds.x && platform.cursor().x < d.bounds.x + d.bounds.width) ?? platform.displays()[0]!;
      const shot = await platform.grab(display);
      return magenta(Buffer.from(shot.small(160, 100).bgra));
    },
    start: (req: LookRequest) => void (pending = look(req, ac.signal)),
    result: async () => {
      const r = (await pending) as Awaited<ReturnType<typeof look>>;
      return r.ok ? { ok: true as const, target: r.look.target } : r;
    },
    cancel: () => (ac.abort(), (ac = new AbortController()), undefined),
    windows: () =>
      BrowserWindow.getAllWindows().map((w) => ({ title: w.title, visible: w.isVisible(), focusable: w.isFocusable(), onTop: w.isAlwaysOnTop(), url: w.webContents.getURL().slice(0, 40) })),
    dispose: () => ocr.dispose(),
  };
}

export type VisionApi = ReturnType<typeof build>;
void app.whenReady().then(() => ((globalThis as Record<string, unknown>).__vision = build()));
