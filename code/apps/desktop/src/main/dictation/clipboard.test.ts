import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createElectronClipboard } from "./clipboard";
import { CLIPBOARD_PRIVACY_MARKS, type InputPort } from "./types";

const electron = vi.hoisted(() => {
  const state = { items: [] as { types: string[]; getType(t: string): Promise<unknown> }[], log: [] as string[] };
  class ClipboardItem {
    types: string[];
    parts: Record<string, unknown>;
    constructor(parts: Record<string, unknown>) {
      this.parts = parts;
      this.types = Object.keys(parts);
    }
    getType = async (t: string) => this.parts[t];
  }
  const clipboard = {
    read: async () => state.items,
    writeText: (t: string) => void state.log.push(`text ${t}`),
    write: async (items: ClipboardItem[]) => void state.log.push(`write ${JSON.stringify(items.map((i) => i.parts))}`),
    clear: () => void state.log.push("clear"),
  };
  return { state, ClipboardItem, clipboard };
});
vi.mock("electron", () => ({ clipboard: electron.clipboard, ClipboardItem: electron.ClipboardItem }));

const item = (parts: Record<string, unknown>) => new electron.ClipboardItem(parts);

function setup(traits: Partial<ReturnType<InputPort["clipboardTraits"]>> = {}) {
  const marked: (readonly string[])[] = [];
  const port = createElectronClipboard({
    clipboardSequence: () => 7,
    clipboardTraits: () => ({ files: false, formats: 0, marks: [], ...traits }),
    markClipboard: (marks) => (electron.state.log.push(`marks ${marks.length}`), marked.push(marks), true),
  });
  return { port, marked };
}

beforeEach(() => {
  electron.state.items = [];
  electron.state.log = [];
});

describe("electron clipboard", () => {
  it("writes dictated text with all three privacy marks, after the text", async () => {
    const { port, marked } = setup();
    await port.writeText("hello");
    expect(electron.state.log).toEqual(["text hello", "marks 3"]);
    expect(marked).toEqual([CLIPBOARD_PRIVACY_MARKS]);
  });

  it("snapshots every readable format and the marks its owner had set, and puts both back", async () => {
    const { port, marked } = setup({ marks: ["CanIncludeInClipboardHistory", "CanUploadToCloudClipboard"] });
    electron.state.items = [item({ "text/plain": "secret", "text/html": "<b>secret</b>" })];
    const snapshot = await port.snapshot();
    await port.restore(snapshot);
    expect(electron.state.log).toEqual([`write ${JSON.stringify([{ "text/plain": "secret", "text/html": "<b>secret</b>" }])}`, "marks 2"]);
    expect(marked).toEqual([["CanIncludeInClipboardHistory", "CanUploadToCloudClipboard"]]);
  });

  it("restores a clipboard without marks without adding any", async () => {
    const { port, marked } = setup();
    electron.state.items = [item({ "text/plain": "plain" })];
    await port.restore(await port.snapshot());
    expect(marked).toEqual([]);
  });

  it("clears the clipboard when it was empty before", async () => {
    const { port } = setup();
    await port.restore(await port.snapshot());
    expect(electron.state.log).toEqual(["clear"]);
  });

  it("has no snapshot when the clipboard cannot be read", async () => {
    const { port } = setup();
    electron.clipboard.read = async () => {
      throw new Error("busy");
    };
    expect(await port.snapshot()).toBeNull();
    electron.clipboard.read = async () => electron.state.items;
  });

  describe("restorable", () => {
    it("is false for a copied file list, which Electron cannot keep", async () => {
      expect(await setup({ files: true, formats: 3 }).port.restorable!()).toBe(false);
    });

    it("is true for an empty clipboard and for one whose formats can be read", async () => {
      expect(await setup().port.restorable!()).toBe(true);
      electron.state.items = [item({ "text/plain": "x" })];
      expect(await setup({ formats: 4 }).port.restorable!()).toBe(true);
    });

    it("is false when the clipboard has formats but none can be read: restoring would empty it", async () => {
      expect(await setup({ formats: 2 }).port.restorable!()).toBe(false);
    });
  });

  it("reports the system's clipboard sequence number", () => {
    expect(setup().port.sequence()).toBe(7);
  });
});
