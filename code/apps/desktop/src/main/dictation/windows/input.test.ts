import { describe, expect, it } from "vite-plus/test";
import type { Foreground } from "./foreground";
import { createInput } from "./input";
import type { Win32 } from "./native";

function input(formats: (number | string)[], count = formats.length) {
  const added: (readonly string[])[] = [];
  const w = {
    clipboardHas: (f: number | string) => formats.includes(f),
    clipboardFormatCount: () => count,
    clipboardAdd: (names: readonly string[]) => (added.push(names), true),
  } as unknown as Win32;
  return { input: createInput(w, {} as Foreground), added };
}

describe("clipboard traits", () => {
  it("sees a copied file list, by CF_HDROP or by the shell's own formats", () => {
    expect(input([15]).input.clipboardTraits().files).toBe(true);
    expect(input(["Shell IDList Array"]).input.clipboardTraits().files).toBe(true);
    expect(input(["FileGroupDescriptorW"]).input.clipboardTraits().files).toBe(true);
    expect(input([13]).input.clipboardTraits().files).toBe(false);
  });

  it("lists the privacy marks the owner set, and counts the formats", () => {
    const t = input([13, "CanIncludeInClipboardHistory", "ExcludeClipboardContentFromMonitorProcessing"], 5).input.clipboardTraits();
    expect(t).toEqual({ files: false, formats: 5, marks: ["CanIncludeInClipboardHistory", "ExcludeClipboardContentFromMonitorProcessing"] });
  });

  it("marks the clipboard through the system", async () => {
    const { input: i, added } = input([]);
    expect(await i.markClipboard(["CanUploadToCloudClipboard"])).toBe(true);
    expect(added).toEqual([["CanUploadToCloudClipboard"]]);
  });

  it("tries again while another program holds the clipboard, and gives up after five tries", async () => {
    const tries: number[] = [];
    const w = { clipboardAdd: () => (tries.push(1), tries.length >= 3) } as unknown as Win32;
    expect(await createInput(w, {} as Foreground).markClipboard(["x"])).toBe(true);
    expect(tries).toHaveLength(3);
    tries.length = 0;
    const never = { clipboardAdd: () => (tries.push(1), false) } as unknown as Win32;
    expect(await createInput(never, {} as Foreground).markClipboard(["x"])).toBe(false);
    expect(tries).toHaveLength(5);
  });
});

describe("typing", () => {
  type Ev = { vk: number; scan: number; flags: number };
  const rig = (accept = Infinity) => {
    const sent: Ev[][] = [];
    const w = {
      sendInput: (events: { u: { ki: { wVk: number; wScan: number; dwFlags: number } } }[]) => {
        sent.push(events.map((e) => ({ vk: e.u.ki.wVk, scan: e.u.ki.wScan, flags: e.u.ki.dwFlags })));
        return Math.min(events.length, accept);
      },
    } as unknown as Win32;
    return { input: createInput(w, {} as Foreground), sent };
  };
  const SHIFT = 0xa0;
  const RETURN = 0x0d;

  it("sends each character as a Unicode key down and up", async () => {
    const { input: i, sent } = rig();
    expect(await i.type("hé")).toBe("done");
    expect(sent.flat()).toEqual([
      { vk: 0, scan: 0x68, flags: 4 },
      { vk: 0, scan: 0x68, flags: 6 },
      { vk: 0, scan: 0xe9, flags: 4 },
      { vk: 0, scan: 0xe9, flags: 6 },
    ]);
  });

  it("sends a line break as Shift+Enter, for LF and CRLF alike", async () => {
    for (const text of ["a\nb", "a\r\nb"]) {
      const { input: i, sent } = rig();
      expect(await i.type(text)).toBe("done");
      expect(sent.flat().map((e) => [e.vk, e.flags])).toEqual([
        [0, 4],
        [0, 6],
        [SHIFT, 0],
        [RETURN, 0],
        [RETURN, 2],
        [SHIFT, 2],
        [0, 4],
        [0, 6],
      ]);
    }
  });

  it("sends a long text in pieces of 128 characters, whole characters only", async () => {
    const { input: i, sent } = rig();
    await i.type("x".repeat(300));
    expect(sent.map((p) => p.length / 2)).toEqual([128, 128, 44]);
    const { input: j, sent: pairs } = rig();
    await j.type("\u{1F600}".repeat(130));
    expect(pairs.map((p) => p.length / 4)).toEqual([128, 2]);
  });

  it("reports a refusal and sends nothing more", async () => {
    const { input: i, sent } = rig(3);
    expect(await i.type("x".repeat(300))).toBe("rejected");
    expect(sent).toHaveLength(1);
  });

  it("stops between pieces when asked, after the pieces already sent", async () => {
    const { input: i, sent } = rig();
    let asked = 0;
    expect(await i.type("x".repeat(300), () => ++asked > 1)).toBe("stopped");
    expect(sent).toHaveLength(1);
  });

  it("types nothing for empty text", async () => {
    const { input: i, sent } = rig();
    expect(await i.type("")).toBe("done");
    expect(sent).toEqual([]);
  });
});
