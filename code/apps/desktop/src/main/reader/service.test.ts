import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Ctx } from "../context";
import { parseConfig } from "../../shared/schemas";
import { IDLE_READER, type ReaderState } from "../../shared/reader";
import type { ToastCenter } from "../toasts";

const mocks = vi.hoisted(() => {
  const mini = {
    opened: [] as unknown[][],
    closed: 0,
    ui: [] as { type: string; [k: string]: unknown }[],
    states: [] as unknown[],
    alwaysOnTop: [] as unknown[][],
    window: { setAlwaysOnTop: (...a: unknown[]) => mini.alwaysOnTop.push(a) },
  };
  return { mini, readText: vi.fn(async () => ""), capture: vi.fn(async (): Promise<string> => ""), copyKeys: vi.fn(async () => {}) };
});
vi.mock("electron", () => ({ clipboard: { readText: mocks.readText } }));
vi.mock("../windows", () => ({
  cornerOf: () => "corner",
  FloatWindow: class {
    window = mocks.mini.window;
    open(...a: unknown[]) {
      mocks.mini.opened.push(a);
    }
    close() {
      mocks.mini.closed++;
    }
    sendUi(e: { type: string }) {
      mocks.mini.ui.push(e);
    }
    sendState(s: unknown) {
      mocks.mini.states.push(s);
    }
    owns = (c: unknown) => c === "mini-contents";
  },
}));
vi.mock("../system/selection", () => ({ captureSelection: mocks.capture }));
vi.mock("../system/keys", () => ({ sendCopyKeys: mocks.copyKeys }));
vi.mock("../system/clipboard", () => ({ electronClipboard: {} }));

import { createReading } from "./service";

const audio = { sampleRate: 24000, chunks: [new Int16Array(10)] };

function setup() {
  const states: ReaderState[] = [];
  const sinks = new Set<(s: unknown) => void>();
  const ctx = {
    state: { reader: IDLE_READER },
    config: { ...parseConfig({}), voice: "bf_emma", speed: 1.25 },
    sinks,
    publish: vi.fn(),
    showWindow: vi.fn(),
    log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
    server: { speak: vi.fn(async () => audio) },
  } as unknown as Ctx;
  const notify = vi.fn();
  const reading = createReading(ctx, { notify } as unknown as ToastCenter, (s) => states.push(s));
  return { ctx, reading, notify, states, sinks };
}
const until = async (f: () => boolean) => {
  for (let i = 0; i < 200 && !f(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(f()).toBe(true);
};

beforeEach(() => {
  Object.assign(mocks.mini, { opened: [], closed: 0, ui: [], states: [], alwaysOnTop: [] });
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

describe("createReading", () => {
  it("reads text with the configured voice and speed and sends the audio to the mini player without taking focus", async () => {
    const t = setup();
    expect(t.reading.readText("Hello there.", "text")).toBe(true);
    await until(() => mocks.mini.ui.some((e) => e.type === "chunk"));
    expect(t.ctx.server.speak).toHaveBeenCalledWith({ text: "Hello there.", voice: "bf_emma", speed: 1.25 }, expect.any(AbortSignal));
    expect(mocks.mini.opened[0]).toEqual(["corner", false]);
    expect(t.ctx.state.reader).toMatchObject({ status: "preparing", source: "text", title: "Hello there.", total: 1 });
    expect(t.ctx.publish).toHaveBeenCalled();
    expect(t.states.at(-1)).toBe(t.ctx.state.reader);
  });

  it("text with nothing to say fails with a message instead of opening the player silently", () => {
    const t = setup();
    expect(t.reading.readText("   ", "text")).toBe(false);
    expect(t.ctx.state.reader).toMatchObject({ status: "error", error: "There is no text to read." });
  });

  it("stop closes the mini player", async () => {
    const t = setup();
    t.reading.readText("One. Two.", "text");
    t.reading.command({ type: "stop" });
    expect(t.ctx.state.reader.status).toBe("idle");
    expect(mocks.mini.closed).toBeGreaterThan(0);
  });

  it("finishing raises one toast, and the player goes away six seconds later", async () => {
    vi.useFakeTimers();
    const t = setup();
    t.reading.readText("Only one.", "text");
    await vi.waitFor(() => expect(mocks.mini.ui.some((e) => e.type === "chunk")).toBe(true));
    const { epoch } = mocks.mini.ui.find((e) => e.type === "chunk") as unknown as { epoch: number };
    t.reading.started(epoch, 0);
    t.reading.done(epoch, 0);
    expect(t.ctx.state.reader.status).toBe("finished");
    expect(t.notify).toHaveBeenCalledTimes(1);
    expect(t.notify.mock.calls[0]![0]).toMatchObject({ event: "reading-finished", title: "Finished reading", body: "Only one." });
    const closedBefore = mocks.mini.closed;
    await vi.advanceTimersByTimeAsync(5999);
    expect(t.ctx.state.reader.status).toBe("finished");
    await vi.advanceTimersByTimeAsync(1);
    expect(t.ctx.state.reader.status).toBe("idle");
    expect(mocks.mini.closed).toBeGreaterThan(closedBefore);
  });

  it("readClipboard reads the clipboard text, and reports an empty clipboard", async () => {
    const t = setup();
    mocks.readText.mockResolvedValueOnce("From the clipboard.");
    expect(await t.reading.readClipboard()).toBe(true);
    expect(t.ctx.state.reader).toMatchObject({ source: "clipboard", title: "From the clipboard." });
    mocks.readText.mockResolvedValueOnce("  ");
    expect(await t.reading.readClipboard()).toBe(false);
    expect(t.ctx.state.reader).toMatchObject({ status: "error", error: "The clipboard has no text." });
  });

  it("readSelection reads what the capture found", async () => {
    const t = setup();
    mocks.capture.mockResolvedValueOnce("Selected words.");
    await t.reading.readSelection();
    expect(t.ctx.state.reader).toMatchObject({ source: "selection", title: "Selected words." });
  });

  it("readSelection says so when nothing is selected, and when capturing fails", async () => {
    const t = setup();
    mocks.capture.mockResolvedValueOnce("");
    await t.reading.readSelection();
    expect(t.ctx.state.reader.error).toBe("No text is selected. Select some text, then try again.");
    mocks.capture.mockRejectedValueOnce(new Error("Reading the selection is only available on Windows."));
    await t.reading.readSelection();
    expect(t.ctx.state.reader.error).toBe("Reading the selection is only available on Windows.");
    expect(t.ctx.log.warn).toHaveBeenCalledWith("reading the selection failed", "Reading the selection is only available on Windows.");
  });

  it("ignores a second selection shortcut while the first is still capturing", async () => {
    const t = setup();
    let release!: (s: string) => void;
    mocks.capture.mockImplementationOnce(() => new Promise<string>((r) => (release = r)));
    const first = t.reading.readSelection();
    await t.reading.readSelection();
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    release("Done.");
    await first;
    expect(t.ctx.state.reader.title).toBe("Done.");
  });

  it("keep-on-top and open-app are handled here; playback commands go to the controller", () => {
    const t = setup();
    t.reading.command({ type: "keep-on-top", on: true });
    expect(mocks.mini.alwaysOnTop).toEqual([[true, "floating"]]);
    t.reading.command({ type: "open-app" });
    expect(t.ctx.showWindow).toHaveBeenCalledTimes(1);
    t.reading.readText("One. Two.", "text");
    t.reading.command({ type: "pause" });
    expect(t.ctx.state.reader.status).toBe("paused");
    expect(mocks.mini.ui).toContainEqual({ type: "player", op: "pause" });
  });

  it("forwards published state to the mini player and owns only its contents", () => {
    const t = setup();
    [...t.sinks][0]!({ marker: 1 });
    expect(mocks.mini.states).toEqual([{ marker: 1 }]);
    expect(t.reading.owns("mini-contents" as never)).toBe(true);
    expect(t.reading.owns("x" as never)).toBe(false);
  });
});
