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

  it("marks the clipboard through the system", () => {
    const { input: i, added } = input([]);
    expect(i.markClipboard(["CanUploadToCloudClipboard"])).toBe(true);
    expect(added).toEqual([["CanUploadToCloudClipboard"]]);
  });
});
