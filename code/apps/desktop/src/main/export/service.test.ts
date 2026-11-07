import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ExportJob } from "@speakkit/protocol";
import type { Ctx } from "../context";
import { parseConfig } from "../../shared/schemas";
import type { ToastCenter } from "../toasts";

const electron = vi.hoisted(() => ({
  showItemInFolder: vi.fn(),
  openPath: vi.fn(async () => ""),
  showOpenDialog: vi.fn(),
}));
vi.mock("electron", () => ({ dialog: { showOpenDialog: electron.showOpenDialog }, shell: { showItemInFolder: electron.showItemInFolder, openPath: electron.openPath } }));
vi.mock("./mp3-runner", () => ({ mp3InWorker: () => async () => new Uint8Array([0xff, 0xfb]) }));

import { createExports } from "./service";

/** 1 s of 16-bit mono silence as WAV. */
const wav = () => {
  const b = Buffer.alloc(44 + 48000);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + 48000, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(24000, 24);
  b.writeUInt32LE(48000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(48000, 40);
  return new Uint8Array(b);
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "speakkit-exports-"));
  vi.clearAllMocks();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function setup() {
  const done: ExportJob = { id: "srv", state: "done", done: 1, total: 1, durationMs: 1000 };
  const ctx = {
    state: { exports: [], exportDir: dir },
    config: parseConfig({}),
    saveConfig: vi.fn(),
    publish: vi.fn(),
    addActivity: vi.fn(),
    server: { startExport: async () => done, exportStatus: async () => done, exportAudio: async () => wav(), cancelExport: async () => {} },
  } as unknown as Ctx;
  const notify = vi.fn();
  const changed = vi.fn();
  const parent = vi.fn(() => null);
  const ex = createExports(ctx, { notify } as unknown as ToastCenter, { parent, workerFile: new URL("file:///x/mp3-worker.js"), onChange: changed });
  return { ctx, ex, notify, changed, parent };
}
const until = async (f: () => boolean) => {
  for (let i = 0; i < 400 && !f(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(f()).toBe(true);
};
const options = (over = {}) => ({ text: "One sentence.", voice: "af_heart", speed: 1, format: "wav" as const, mp3Kbps: 192 as const, dir: "", name: "note", ...over });

describe("createExports", () => {
  it("checks a name against the default folder when none is given", async () => {
    const t = setup();
    expect(await t.ex.handlers.exportCheck("", "My note", "wav")).toEqual({ path: path.join(dir, "My note.wav"), exists: false, alternative: path.join(dir, "My note.wav") });
  });

  it("starts into the default folder, remembers the format and bitrate, and keeps the folder setting empty for the default", async () => {
    const t = setup();
    const view = await t.ex.handlers.exportStart(options({ format: "mp3", mp3Kbps: 256 }));
    expect(view).toMatchObject({ name: "note.mp3", stage: "rendering" });
    expect(t.ctx.config.exportPrefs).toEqual({ format: "mp3", mp3Kbps: 256, folder: "" });
    expect(t.ctx.saveConfig).toHaveBeenCalledTimes(1);
    await until(() => readdirSync(dir).includes("note.mp3"));
  });

  it("remembers a custom folder and creates it", async () => {
    const t = setup();
    const custom = path.join(dir, "deep", "er");
    await t.ex.handlers.exportStart(options({ dir: custom }));
    expect(t.ctx.config.exportPrefs.folder).toBe(custom);
    await until(() => readdirSync(custom).includes("note.wav"));
  });

  it("publishes each change, counts running exports, and raises a toast with a bell line when one finishes", async () => {
    const t = setup();
    await t.ex.handlers.exportStart(options());
    expect(t.ex.runningCount()).toBe(1);
    await until(() => t.notify.mock.calls.length === 1);
    expect(t.ctx.state.exports[0]).toMatchObject({ stage: "done", name: "note.wav" });
    expect(t.ex.runningCount()).toBe(0);
    expect(t.ctx.addActivity).toHaveBeenCalledWith("export", "Export finished", "note.wav is saved.");
    expect(t.notify.mock.calls[0]![0]).toMatchObject({ event: "export-done", title: "Export finished", body: "note.wav is saved. Click to show it in its folder." });
    expect(t.changed).toHaveBeenCalled();
    t.notify.mock.calls[0]![0].onClick();
    expect(electron.showItemInFolder).toHaveBeenCalledWith(path.join(dir, "note.wav"));
  });

  it("reveals or opens only files this session exported", async () => {
    const t = setup();
    await t.ex.handlers.exportStart(options());
    await until(() => t.ctx.state.exports[0]?.stage === "done");
    const file = path.join(dir, "note.wav");
    await t.ex.handlers.exportReveal(file, false);
    await t.ex.handlers.exportReveal(file, true);
    expect(electron.showItemInFolder).toHaveBeenCalledWith(file);
    expect(electron.openPath).toHaveBeenCalledWith(file);
    await expect(t.ex.handlers.exportReveal("C:/Windows/system32/cmd.exe", true)).rejects.toMatchObject({ error: { code: "not-exported" } });
    expect(electron.openPath).toHaveBeenCalledTimes(1);
  });

  it("the folder picker starts in the current folder and returns the choice, or null when cancelled", async () => {
    const t = setup();
    electron.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ["D:/Audio"] });
    expect(await t.ex.handlers.pickFolder("")).toBe("D:/Audio");
    expect(electron.showOpenDialog).toHaveBeenCalledWith({ defaultPath: dir, properties: ["openDirectory", "createDirectory"] });
    electron.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    expect(await t.ex.handlers.pickFolder("D:/Audio")).toBeNull();
  });

  it("the folder picker is attached to the window when there is one", async () => {
    const t = setup();
    const win = { id: "main" };
    t.parent.mockReturnValue(win as never);
    electron.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    await t.ex.handlers.pickFolder("D:/Audio");
    expect(electron.showOpenDialog).toHaveBeenCalledWith(win, { defaultPath: "D:/Audio", properties: ["openDirectory", "createDirectory"] });
  });
});
