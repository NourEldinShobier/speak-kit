import { describe, expect, it } from "vite-plus/test";
import { createLook, type ConsentCard, type Indicator, type ScreenPlatform, type Shot } from "./look";
import type { Ocr, OcrResult } from "./ocr";
import type { Bitmap, Rect } from "./plan";

const live = new AbortController().signal;
const ask = { session: "s1", scope: "window" } as const;

/** A picture of size w x h whose pieces are recorded; `grey` is the level of the small version. */
function shot(width: number, height: number, o: { grey?: number; jpegBytes?: (w: number, q: number) => number; log?: string[] } = {}): Shot {
  const log = o.log ?? [];
  return {
    width,
    height,
    crop: (r: Rect) => (log.push(`crop ${r.x},${r.y},${r.width},${r.height}`), shot(r.width, r.height, o)),
    png: () => (log.push(`png ${width}x${height}`), new Uint8Array([1, 2, 3])),
    jpeg: (w, h, q) => (log.push(`jpeg ${w}x${h} q${q}`), new Uint8Array(o.jpegBytes?.(w, q) ?? 1000).fill(65)),
    small: (w, h): Bitmap => ({ width: w, height: h, bgra: new Uint8Array(w * h * 4).fill(o.grey ?? 200) }),
  };
}

function setup(o: { platform?: Partial<ScreenPlatform>; ocr?: OcrResult; allow?: boolean | (() => Promise<boolean>); log?: string[] } = {}) {
  const log = o.log ?? [];
  const displays = [{ id: "1", bounds: { x: 0, y: 0, width: 2560, height: 1600 } }];
  const platform: ScreenPlatform = {
    supported: true,
    displays: () => displays,
    cursor: () => ({ x: 10, y: 10 }),
    windows: async () => [{ id: "window:7:0", name: "Report.docx - Word", rect: { x: 100, y: 100, width: 1400, height: 900 } }],
    foreground: () => undefined,
    grab: async () => (log.push("grab"), shot(2560, 1600, { log })),
    hideOwnWindows: async (run) => (log.push("hide"), run().finally(() => log.push("unhide"))),
    ...o.platform,
  };
  const ocr: Ocr = {
    recognize: async () => o.ocr ?? { ok: true, lang: "en-US", lines: [{ t: "Quarterly revenue", x: 0, y: 0, w: 100, h: 20 }] },
    dispose() {},
  };
  const cards: string[] = [];
  const card: ConsentCard = {
    ask: async (_signal, scope) => {
      cards.push(scope);
      return typeof o.allow === "function" ? o.allow() : (o.allow ?? true);
    },
  };
  const indicator: Indicator = { show: () => void log.push("show"), hide: () => void log.push("hidden") };
  return { look: createLook({ platform, ocr, card, indicator, settleMs: 0 }).look, cards, log };
}

describe("look", () => {
  it("captures the window of the user, reads its full-size text and sends a small JPEG", async () => {
    const { look, log } = setup();
    const r = await look(ask, live);
    expect(r).toEqual({
      ok: true,
      look: { scope: "window", target: "Report.docx - Word", image: Buffer.from(new Uint8Array(1000).fill(65)).toString("base64"), width: 1280, height: 823, text: "Quarterly revenue", ocr: "ok" },
    });
    // the capture is cut to the window first, the text is read from that native-size picture and the JPEG is the small one
    expect(log).toEqual(["show", "hide", "grab", "unhide", "crop 100,100,1400,900", "png 1400x900", "jpeg 1280x823 q80", "hidden"]);
  });

  it("takes the whole display for the screen scope", async () => {
    const { look, log } = setup();
    const r = await look({ session: "s1", scope: "screen" }, live);
    expect(r).toMatchObject({ ok: true, look: { scope: "screen", target: "screen", width: 1280, height: 800 } });
    expect(log.filter((l) => l.startsWith("crop"))).toEqual([]);
  });

  it("shows the indicator for the whole look and hides it afterwards, also when the capture fails", async () => {
    const log: string[] = [];
    const { look } = setup({
      log,
      platform: {
        grab: async () => {
          log.push("grab");
          throw new Error("denied");
        },
      },
    });
    expect(await look(ask, live)).toEqual({ ok: false, code: "capture-failed" });
    expect(log).toEqual(["show", "hide", "grab", "unhide", "hidden"]);
  });

  it("keeps Speak Kit's own windows out of the picture only while the display is grabbed", async () => {
    const { look, log } = setup();
    await look(ask, live);
    expect(log.slice(log.indexOf("hide"), log.indexOf("unhide") + 1)).toEqual(["hide", "grab", "unhide"]);
  });

  describe("consent", () => {
    it("asks once per conversation", async () => {
      const { look, cards } = setup();
      await look(ask, live);
      await look(ask, live);
      await look({ session: "s2", scope: "screen" }, live);
      expect(cards).toHaveLength(2);
    });

    it("asks again for the whole screen after a window was allowed, and says which one it asks about", async () => {
      const { look, cards, log } = setup();
      await look(ask, live);
      expect(await look({ session: "s1", scope: "screen" }, live)).toMatchObject({ ok: true });
      expect(cards).toEqual(["window", "screen"]);
      expect(log.filter((l) => l === "grab")).toHaveLength(2);
    });

    it("captures nothing of the screen when the user only allowed the window and says no to the screen", async () => {
      const answers = [true, false];
      const { look, log } = setup({ allow: async () => answers.shift()! });
      await look(ask, live);
      log.length = 0;
      expect(await look({ session: "s1", scope: "screen" }, live)).toEqual({ ok: false, code: "declined" });
      expect(log).toEqual([]);
    });

    it("a screen consent covers later window looks without asking", async () => {
      const { look, cards } = setup();
      await look({ session: "s1", scope: "screen" }, live);
      await look(ask, live);
      expect(cards).toEqual(["screen"]);
    });

    it("captures nothing when the user says no, and asks again at the next look", async () => {
      const { look, cards, log } = setup({ allow: false });
      expect(await look(ask, live)).toEqual({ ok: false, code: "declined" });
      expect(await look(ask, live)).toEqual({ ok: false, code: "declined" });
      expect(cards).toHaveLength(2);
      expect(log).toEqual([]);
    });

    it("gives up quietly when the extension goes away while the card is open", async () => {
      const ac = new AbortController();
      const { look, log } = setup({ allow: async () => (ac.abort(), false) });
      expect(await look(ask, ac.signal)).toEqual({ ok: false, code: "capture-failed" });
      expect(log).toEqual([]);
    });

    it("does not capture when the extension went away while the card was answered yes", async () => {
      const ac = new AbortController();
      const { look, log } = setup({ allow: async () => (ac.abort(), true) });
      expect((await look(ask, ac.signal)).ok).toBe(false);
      expect(log).toEqual([]);
    });
  });

  it("refuses a second look while one is running", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { look } = setup({ allow: () => gate.then(() => true) });
    const first = look(ask, live);
    expect(await look({ session: "s9", scope: "screen" }, live)).toEqual({ ok: false, code: "busy" });
    release();
    expect((await first).ok).toBe(true);
    expect((await look(ask, live)).ok).toBe(true);
  });

  it("is unsupported where capture is not built, without touching anything", async () => {
    const { look, cards, log } = setup({ platform: { supported: false } });
    expect(await look(ask, live)).toEqual({ ok: false, code: "unsupported" });
    expect([cards.length, log.length]).toEqual([0, 0]);
  });

  it("says no-window when there is no window to look at", async () => {
    const { look } = setup({ platform: { windows: async () => [] } });
    expect(await look(ask, live)).toEqual({ ok: false, code: "no-window" });
  });

  describe("text", () => {
    it("still sends the picture when no recognizer is installed or it fails", async () => {
      for (const reason of ["no-language", "failed", "unsupported"] as const) {
        const r = await setup({ ocr: { ok: false, reason } }).look(ask, live);
        expect(r).toMatchObject({ ok: true, look: { ocr: "unavailable", text: "" } });
        expect(r.ok && r.look.image.length).toBeGreaterThan(0);
      }
    });

    it("marks a picture without text as empty", async () => {
      const r = await setup({ ocr: { ok: true, lang: "en-US", lines: [] } }).look(ask, live);
      expect(r).toMatchObject({ ok: true, look: { ocr: "empty", text: "" } });
    });
  });

  describe("black pictures", () => {
    it("sends no picture and no text for a black capture", async () => {
      const log: string[] = [];
      const { look } = setup({ log, platform: { grab: async () => shot(2560, 1600, { grey: 0, log }) } });
      expect(await look({ session: "s1", scope: "screen" }, live)).toEqual({
        ok: true,
        look: { scope: "screen", target: "screen", image: "", width: 0, height: 0, text: "", ocr: "empty", black: "black" },
      });
      expect(log.some((l) => l.startsWith("jpeg") || l.startsWith("png"))).toBe(false);
    });
  });

  describe("size", () => {
    it("lowers quality until the picture is at most 190000 bytes", async () => {
      const { look } = setup({ platform: { grab: async () => shot(2560, 1600, { jpegBytes: (_, q) => ({ 80: 250_000, 65: 200_000 })[q] ?? 120_000 }) } });
      const r = await look({ session: "s1", scope: "screen" }, live);
      expect(r).toMatchObject({ ok: true, look: { width: 1280, height: 800 } });
      expect(r.ok && Buffer.from(r.look.image, "base64").length).toBe(120_000);
    });

    it("fails when even the smallest picture is too big", async () => {
      const { look } = setup({ platform: { grab: async () => shot(2560, 1600, { jpegBytes: () => 500_000 }) } });
      expect(await look({ session: "s1", scope: "screen" }, live)).toEqual({ ok: false, code: "capture-failed" });
    });
  });
});
