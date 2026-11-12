import { describe, expect, it } from "vitest";
import type { CaptureRecord } from "../store";
import { runCaptureCli } from "./index";

const r = (id: string, extra: Partial<CaptureRecord> = {}): CaptureRecord => ({
  id,
  kind: "recording",
  title: `Title ${id}`,
  at: Date.UTC(2026, 10, 12, 9, 30),
  dir: id,
  bytes: 1,
  media: "m",
  frames: [],
  chips: [],
  durationMs: 125_000,
  ...extra,
});
const ports = (items: CaptureRecord[]) => ({ list: async (q?: string) => items.filter((i) => !q || i.title.includes(q)), get: async (id: string) => items.find((i) => i.id === id) });

describe("capture cli", () => {
  it("lists captures one per line", async () => {
    const res = await runCaptureCli(["list"], ports([r("a"), { ...r("b", { kind: "screenshot" }), durationMs: undefined } as never]));
    expect(res).toEqual({ code: 0, out: "a\t2026-11-12T09:30:00.000Z\trecording\t2:05\tTitle a\nb\t2026-11-12T09:30:00.000Z\tscreenshot\t-\tTitle b" });
  });
  it("lists as json and passes the search", async () => {
    const res = await runCaptureCli(["list", "--json", "Title b"], ports([r("a"), r("b")]));
    expect(JSON.parse(res.out)).toEqual([{ id: "b", kind: "recording", title: "Title b", at: Date.UTC(2026, 10, 12, 9, 30), durationMs: 125_000 }]);
  });
  it("shows one capture with its words", async () => {
    const res = await runCaptureCli(
      ["show", "a"],
      ports([
        r("a", {
          words: [
            { text: "hello", startMs: 0, endMs: 1 },
            { text: "world", startMs: 1, endMs: 2 },
          ],
        }),
      ]),
    );
    expect(res.code).toBe(0);
    expect(res.out).toContain("hello world");
  });
  it("reports a missing id and a missing argument", async () => {
    expect(await runCaptureCli(["show", "zzz"], ports([]))).toEqual({ code: 1, out: "No capture with id zzz" });
    expect((await runCaptureCli(["show"], ports([]))).code).toBe(2);
  });
  it("offers list and show only", async () => {
    for (const cmd of [["delete", "a"], ["start"], []]) expect((await runCaptureCli(cmd, ports([r("a")]))).code).toBe(2);
  });
  it("prints an empty list as empty text", async () => {
    expect(await runCaptureCli(["list"], ports([]))).toEqual({ code: 0, out: "" });
  });
});
