import { describe, expect, it, vi } from "vite-plus/test";
import { DEFAULT_DICTATION } from "../../shared/dictation/settings";

vi.mock("electron", () => ({ powerSaveBlocker: {}, clipboard: {}, shell: {} }));
vi.mock("../system/clipboard", () => ({ electronClipboard: {} }));
let release: () => void = () => undefined;
const runs: number[] = [];
vi.mock("./transform-run", () => ({
  runTransform: () => {
    runs.push(runs.length);
    return new Promise((r) => (release = () => r({ status: "changed" })));
  },
  transformToast: () => ({ text: "done", tone: "ok" }),
}));
const { cleanField } = await import("./service-extras");

describe("cleanField", () => {
  it("runs one clean-up at a time: a second press while one is running does nothing, a press after it finishes runs again", async () => {
    const toasts: string[] = [];
    const presenter = { toast: (t: string) => toasts.push(t) } as never;
    const cfg = { ...DEFAULT_DICTATION, enabled: true, transformHotkey: "ctrl+alt+c" } as never;
    const os = {} as never;
    const first = cleanField(os, cfg, presenter);
    await cleanField(os, cfg, presenter);
    expect(runs).toHaveLength(1);
    release();
    await first;
    expect(toasts).toEqual(["done"]);
    const again = cleanField(os, cfg, presenter);
    expect(runs).toHaveLength(2);
    release();
    await again;
  });
});
