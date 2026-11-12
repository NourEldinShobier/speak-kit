import { describe, expect, it } from "vite-plus/test";
import { readStoredHistory } from "../src/history";

const now = 100 * 86_400_000;
const words = ["milk", "meeting", "invoice", "tomorrow", "call", "Anna", "report", "lunch", "budget", "review"];
const stored = Array.from({ length: 10_000 }, (_, i) => ({
  id: `e${i}`,
  at: now - i * 1000,
  text: `${words[i % 10]} ${words[(i * 7) % 10]} number ${i}`,
  raw: `${words[i % 10]} number ${i}`,
  durationMs: 1000,
}));

/** The number the History page's search budget is tracked by: a search over ten thousand stored entries. */
describe("history search on 10,000 entries", () => {
  it("finds the matches and stays under 400 ms", () => {
    const t = performance.now();
    const found = readStoredHistory(stored, { now, retention: "forever", search: "invoice call" });
    const ms = performance.now() - t;
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((e) => /invoice/i.test(e.text) && /call/i.test(e.text))).toBe(true);
    expect(ms).toBeLessThan(400);
  });
});
