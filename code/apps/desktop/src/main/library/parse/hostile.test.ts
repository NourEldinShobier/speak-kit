import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vite-plus/test";
import { ImportError, parseFile } from ".";
import { parseInWorker } from "./parse-runner";

/** A zip with only a central directory: what the guard reads, and what a bomb or a traversal archive lies about. */
function zipOf(entries: { name: string; packed?: number; unpacked?: number }[]): Uint8Array {
  const names = entries.map((e) => new TextEncoder().encode(e.name));
  const dir = entries.reduce((n, _e, i) => n + 46 + names[i]!.length, 0);
  const out = new Uint8Array(dir + 22);
  const view = new DataView(out.buffer);
  let at = 0;
  entries.forEach((e, i) => {
    view.setUint32(at, 0x02014b50, true);
    view.setUint32(at + 20, e.packed ?? 10, true);
    view.setUint32(at + 24, e.unpacked ?? 10, true);
    view.setUint16(at + 28, names[i]!.length, true);
    out.set(names[i]!, at + 46);
    at += 46 + names[i]!.length;
  });
  view.setUint32(at, 0x06054b50, true);
  view.setUint16(at + 10, entries.length, true);
  view.setUint32(at + 16, 0, true);
  return out;
}

const reasonOf = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (e) {
    return e instanceof ImportError ? e.reason : `not an ImportError: ${e}`;
  }
  return "no error";
};
const fixture = (name: string) => new Uint8Array(readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url))));

describe("hostile documents", () => {
  // The first PDF parse imports pdfjs, which takes seconds on a loaded machine; the test below checks the refusal, not the import.
  beforeAll(() => import("pdfjs-dist/legacy/build/pdf.mjs"), 60_000);

  it.each(["docx", "epub"])("refuses a %s that unpacks to 150 MB from 1 MB (ratio 150)", async (ext) => {
    expect(await reasonOf(() => parseFile(`bomb.${ext}`, zipOf([{ name: "word/document.xml", packed: 1_000_000, unpacked: 150_000_000 }])))).toBe("too-large");
  });

  it("refuses more than 200 MB unpacked even at a low ratio", async () => {
    expect(
      await reasonOf(() =>
        parseFile(
          "big.docx",
          zipOf([
            { name: "a", packed: 100_000_000, unpacked: 120_000_000 },
            { name: "b", packed: 100_000_000, unpacked: 120_000_000 },
          ]),
        ),
      ),
    ).toBe("too-large");
  });

  it("refuses more than 10,000 entries", async () => {
    expect(await reasonOf(() => parseFile("many.epub", zipOf(Array.from({ length: 10_001 }, (_, i) => ({ name: `f${i}` })))))).toBe("too-large");
  });

  it.each(["../evil.xml", "ok/../../evil.xml", "/etc/passwd", "C:\\evil.xml", "..\\evil.xml"])("refuses the part name %s", async (name) => {
    expect(await reasonOf(() => parseFile("trav.docx", zipOf([{ name }])))).toBe("unreadable");
  });

  it("refuses a docx that is not a zip, and a truncated one", async () => {
    expect(await reasonOf(() => parseFile("junk.docx", new TextEncoder().encode("not a zip at all, just text")))).toBe("unreadable");
    expect(await reasonOf(() => parseFile("cut.docx", fixture("sample.docx").slice(0, 600)))).toBe("unreadable");
  });

  it("refuses a truncated PDF", async () => {
    expect(await reasonOf(() => parseFile("cut.pdf", fixture("sample.pdf").slice(0, 300)))).toBe("unreadable");
  });

  it("still reads the honest sample documents", async () => {
    expect((await parseFile("sample.docx", fixture("sample.docx"))).parsed.blocks.length).toBeGreaterThan(0);
    expect((await parseFile("sample.epub", fixture("sample.epub"))).parsed.blocks.length).toBeGreaterThan(0);
  });

  it("reads an 8 MB HTML page in bounded time", async () => {
    const html = `<html><body>${"<p>Some words in a paragraph of the page. </p>".repeat((8 * 1024 * 1024) / 46)}</body></html>`;
    const started = performance.now();
    await parseFile("big.html", new TextEncoder().encode(html)).catch(() => {});
    expect(performance.now() - started).toBeLessThan(30_000);
  }, 60_000);
});

describe("parseInWorker", () => {
  const worker = new URL("./echo-worker.mjs", import.meta.url);
  const job = (name: string) => ({ type: "file" as const, name, bytes: new Uint8Array([1, 2, 3]) });

  it("returns the worker's result and leaves the caller's bytes intact", async () => {
    const job1 = job("a.txt");
    const out = await parseInWorker(worker)(job1);
    expect(out.parsed.blocks).toEqual([{ kind: "paragraph", text: "3" }]);
    expect(job1.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("turns a reported failure into an ImportError with its reason", async () => {
    expect(await reasonOf(() => parseInWorker(worker)(job("fail.txt")))).toBe("empty");
  });

  it("turns a crash into an ImportError", async () => {
    expect(await reasonOf(() => parseInWorker(worker)(job("crash.txt")))).toBe("unreadable");
  });

  it("ends a worker that does not answer", async () => {
    expect(await reasonOf(() => parseInWorker(worker, 200)(job("hang.txt")))).toBe("unreadable");
  });
});
