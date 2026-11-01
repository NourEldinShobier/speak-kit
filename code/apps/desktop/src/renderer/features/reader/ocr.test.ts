import { describe, expect, it } from "vite-plus/test";
import { recognizeAll, type OcrEngine, type OcrProgress } from "./ocr";

const engine = (pages: string[]) => {
  const state = { closed: false, asked: [] as number[] };
  const e: OcrEngine = {
    pageCount: pages.length,
    recognize: async (n) => (state.asked.push(n), pages[n - 1]!),
    close: async () => void (state.closed = true),
  };
  return { e, state };
};

describe("recognizeAll", () => {
  it("returns paragraphs tagged with their page, reporting progress and closing the engine", async () => {
    const { e, state } = engine(["First line\nsecond line.\n\nNew paragraph.", "Page two."]);
    const seen: OcrProgress[] = [];
    let t = 0;
    const blocks = await recognizeAll(
      e,
      (p) => seen.push(p),
      new AbortController().signal,
      () => (t += 1000),
    );
    expect(blocks).toEqual([
      { kind: "paragraph", text: "First line second line.", page: 1 },
      { kind: "paragraph", text: "New paragraph.", page: 1 },
      { kind: "paragraph", text: "Page two.", page: 2 },
    ]);
    expect(seen.map((p) => [p.page, p.total])).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(seen[1]!.leftMs).toBeGreaterThan(0);
    expect(state.closed).toBe(true);
  });

  it("stops at the next page when cancelled and still closes the engine", async () => {
    const { e, state } = engine(["One.", "Two.", "Three."]);
    const ac = new AbortController();
    const run = recognizeAll(e, (p) => p.page === 2 && ac.abort(), ac.signal);
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(state.asked).toEqual([1, 2]);
    expect(state.closed).toBe(true);
  });
});
