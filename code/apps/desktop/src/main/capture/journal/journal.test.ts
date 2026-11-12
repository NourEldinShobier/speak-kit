import { describe, expect, it } from "vitest";
import { createJournal, type JournalEntry, type JournalFs } from "./index";

function memoryFs(): JournalFs & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    write: async (f, t) => void files.set(f, t),
    read: async (f) => files.get(f),
    fileNames: async (dir) =>
      Array.from(files.keys())
        .filter((k) => k.startsWith(`${dir}/`))
        .map((k) => k.slice(dir.length + 1)),
    list: async (dir) => [
      ...new Set(
        Array.from(files.keys())
          .filter((k) => k.startsWith(`${dir}/`))
          .map((k) => k.slice(dir.length + 1).split("/")[0]!),
      ),
    ],
    exists: async (p) => [...files.keys()].some((k) => k === p || k.startsWith(`${p}/`)),
    removeDir: async (d) => {
      for (const k of Array.from(files.keys())) if (k.startsWith(`${d}/`)) files.delete(k);
    },
  };
}

describe("capture journal", () => {
  it("removes a capture that stopped while recording and streamed nothing", async () => {
    const fs = memoryFs();
    const j = createJournal(fs, "caps");
    await j.begin("a", 1);
    const report = await j.recover(async () => {});
    expect(report).toEqual({ finished: [], removed: ["a"], failed: [] });
    expect([...fs.files.keys()]).toEqual([]);
  });
  it("finishes a capture cut off while recording from the pictures already on disk", async () => {
    const fs = memoryFs();
    const j = createJournal(fs, "caps");
    await j.begin("a", 1);
    fs.files.set("caps/a/frames/f-00000000.jpg", "x");
    const finished: JournalEntry[] = [];
    expect(await j.recover(async (e) => void finished.push(e))).toEqual({ finished: ["a"], removed: [], failed: [] });
    expect(finished[0]).toMatchObject({ id: "a", stage: "recording" });
    expect(JSON.parse(fs.files.get("caps/a/journal.json")!).stage).toBe("complete");
  });
  it("finishes a capture cut off while recording from the video already on disk", async () => {
    const fs = memoryFs();
    const j = createJournal(fs, "caps");
    await j.begin("a", 1);
    fs.files.set("caps/a/video.webm", "x");
    expect((await j.recover(async () => {})).finished).toEqual(["a"]);
  });
  it("finishes a capture whose media was saved before the crash, then marks it complete", async () => {
    const fs = memoryFs();
    const j = createJournal(fs, "caps");
    await j.begin("a", 1);
    fs.files.set("caps/a/video.webm", "x");
    await j.stage("a", "media-saved", "video.webm");
    const finished: JournalEntry[] = [];
    expect(await j.recover(async (e) => void finished.push(e))).toEqual({ finished: ["a"], removed: [], failed: [] });
    expect(finished[0]).toMatchObject({ id: "a", stage: "media-saved", media: "video.webm" });
    expect(JSON.parse(fs.files.get("caps/a/journal.json")!).stage).toBe("complete");
    expect(
      await j.recover(async () => {
        throw new Error("must not run again");
      }),
    ).toEqual({ finished: [], removed: [], failed: [] });
  });
  it("removes a capture whose journal says media was saved but the file is gone", async () => {
    const fs = memoryFs();
    const j = createJournal(fs, "caps");
    await j.begin("a", 1);
    await j.stage("a", "media-saved", "video.webm");
    expect((await j.recover(async () => {})).removed).toEqual(["a"]);
  });
  it("keeps a capture that cannot be finished and reports it, so the next start tries again", async () => {
    const fs = memoryFs();
    const j = createJournal(fs, "caps");
    await j.begin("a", 1);
    fs.files.set("caps/a/video.webm", "x");
    await j.stage("a", "words-saved", "video.webm");
    expect(
      await j.recover(async () => {
        throw new Error("disk");
      }),
    ).toEqual({ finished: [], removed: [], failed: ["a"] });
    expect(fs.files.has("caps/a/video.webm")).toBe(true);
    expect(JSON.parse(fs.files.get("caps/a/journal.json")!).stage).toBe("words-saved");
  });
  it("leaves complete captures and folders without a journal alone", async () => {
    const fs = memoryFs();
    const j = createJournal(fs, "caps");
    await j.begin("done", 1);
    await j.stage("done", "complete");
    fs.files.set("caps/other/notes.txt", "mine");
    expect(await j.recover(async () => {})).toEqual({ finished: [], removed: [], failed: [] });
    expect(fs.files.has("caps/other/notes.txt")).toBe(true);
  });
  it("removes a folder whose journal is unreadable", async () => {
    const fs = memoryFs();
    fs.files.set("caps/a/journal.json", "{not json");
    expect((await createJournal(fs, "caps").recover(async () => {})).removed).toEqual(["a"]);
  });
  it("counts a failed removal as failed instead of throwing", async () => {
    const fs = memoryFs();
    fs.files.set("caps/a/journal.json", "{not json");
    fs.removeDir = async () => {
      throw new Error("locked");
    };
    expect((await createJournal(fs, "caps").recover(async () => {})).failed).toEqual(["a"]);
  });
});
