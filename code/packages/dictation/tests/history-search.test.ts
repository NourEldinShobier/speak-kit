import { describe, expect, it } from "vite-plus/test";
import { createDictation, normalize, rank } from "../src";
import { fakeClock, fakeInserter, fakeKeyboard, fakeRecorder, fakeStorage, fakeTranscriber } from "./fakes";

describe("normalize", () => {
  it("lower-cases and removes accents", () => {
    expect(normalize("Café ÜBER")).toBe("cafe uber");
  });
});

describe("rank", () => {
  it("finds words that are also members of Object.prototype", () => {
    for (const word of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
      expect(rank(normalize(`the ${word} of a class`), word)).toBe(4);
    }
    expect(rank(normalize("nothing here"), "constructor")).toBe(0);
  });
  it("is 1 for a blank search and 0 when a word is missing", () => {
    expect(rank("hello world", "  ")).toBe(1);
    expect(rank("hello world", "hello moon")).toBe(0);
  });
  it("scores a whole word above a word start above part of a word above a near miss", () => {
    const key = "meeting notes";
    const whole = rank(key, "notes");
    const start = rank(key, "meet");
    const part = rank(key, "eting");
    const near = rank(key, "nates");
    expect(whole).toBe(4);
    expect(start).toBe(3);
    expect(part).toBe(2);
    expect(near).toBe(1);
  });
  it("tolerates one wrong, missing or extra letter in words of four letters or more", () => {
    expect(rank("schedule", "schedle")).toBe(1);
    expect(rank("schedule", "scheduule")).toBe(1);
    expect(rank("schedule", "schedxle")).toBe(1);
    expect(rank("schedule", "sxxedule")).toBe(0);
    expect(rank("cat", "cut")).toBe(0);
  });
  it("sums the words and needs all of them", () => {
    expect(rank("buy milk and eggs", "milk eggs")).toBe(8);
  });
  it("matches through an alias from the vocabulary", () => {
    expect(rank("ask kubernetes team", "k8s", { k8s: ["Kubernetes"] })).toBe(4);
    expect(rank("ask kubernetes team", "k8s")).toBe(0);
  });
  it("finds an accented word with plain letters", () => {
    expect(rank(normalize("Café am Markt"), "cafe")).toBe(4);
  });
});

describe("history through the dictation", () => {
  async function seeded() {
    const time = fakeClock();
    const dictation = createDictation({
      clock: time.clock,
      recorder: fakeRecorder().recorder,
      transcriber: fakeTranscriber().transcriber,
      inserter: fakeInserter().inserter,
      hotkeys: fakeKeyboard().source,
      storage: fakeStorage([
        { id: "a", at: 3, text: "Notes from the café", raw: "x", durationMs: 1000, app: "notepad.exe" },
        { id: "b", at: 2, text: "Call Anna", raw: "x", durationMs: 2000, displayName: "Microsoft Teams", app: "ms-teams.exe" },
        { id: "c", at: 1, text: "Notes notes notes", raw: "x", durationMs: 3000 },
      ]).storage,
      settings: { retention: "forever" },
    });
    await dictation.ready();
    return dictation;
  }

  it("ranks the better match first and uses the program's display name", async () => {
    const d = await seeded();
    expect((await d.history.list({ search: "teams" })).map((e) => e.id)).toEqual(["b"]);
    expect((await d.history.list({ search: "cafe" })).map((e) => e.id)).toEqual(["a"]);
    expect((await d.history.list({ search: "notes" })).map((e) => e.id)).toEqual(["a", "c"]);
  });
  it("removes several entries at once", async () => {
    const d = await seeded();
    await d.history.removeMany(["a", "c", "missing"]);
    expect((await d.history.list()).map((e) => e.id)).toEqual(["b"]);
  });
});
