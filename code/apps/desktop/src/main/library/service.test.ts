import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import type { ImportResult, LibraryApi } from "../../shared/library/contract";
import { createLibrary } from "./service";
import { createSpeakProxy } from "./speak-proxy";
import type { ProxyChunk } from "../../shared/library/contract";

const fixtureDir = fileURLToPath(new URL("./fixtures/", import.meta.url));
const fixture = (n: string) => new Uint8Array(readFileSync(path.join(fixtureDir, n)));

let dir: string;
let lib: LibraryApi;
let revealed: string[] = [];
let chosen: string[] = [];
let web: Server;
let base = "";

const make = () => createLibrary({ dir, reveal: (p) => revealed.push(p), chooseFiles: async () => chosen, fetch, now: () => 1000 });
const ok = (r: ImportResult) => {
  if (!r.ok) throw new Error(r.error.code);
  return r.doc;
};

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "speakkit-lib-"));
  revealed = [];
  chosen = [];
  web = createServer((req, res) => {
    if (req.url === "/article") {
      res.setHeader("content-type", "text/html");
      res.end(readFileSync(path.join(fixtureDir, "article.html")));
    } else if (req.url === "/image") {
      res.setHeader("content-type", "image/png");
      res.end("x");
    } else {
      res.statusCode = 404;
      res.end("no");
    }
  });
  await new Promise<void>((r) => web.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(web.address() as AddressInfo).port}`;
  lib = await make();
});
afterEach(() => {
  web.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("importing", () => {
  it("adds pasted text with a title taken from its first line", async () => {
    const doc = ok(await lib.importText("Weekly update\n\nAll green."));
    expect(doc).toMatchObject({ title: "Weekly update", source: "paste", origin: "Pasted text", wordCount: 4, finished: false, progress: { sentence: 0, fraction: 0 }, addedAt: 1000 });
    expect((await lib.get(doc.id))?.blocks.map((b) => b.text)).toEqual(["Weekly update", "All green."]);
  });

  it("uses the given title and voice, and refuses empty text", async () => {
    expect(ok(await lib.importText("Hello there.", "My title", "bf_emma"))).toMatchObject({ title: "My title", voice: "bf_emma" });
    expect(await lib.importText("   \n ")).toMatchObject({ ok: false, reason: "empty" });
  });

  it("imports a dropped file with the file name as title fallback", async () => {
    const doc = ok(await lib.importBytes("sample.docx", fixture("sample.docx")));
    expect(doc).toMatchObject({ title: "sample", format: "docx", source: "file", origin: "sample.docx", wordCount: 12 });
  });

  it("imports files chosen in the dialog and remembers their path for Show in folder", async () => {
    chosen = [path.join(fixtureDir, "notes.md"), path.join(fixtureDir, "missing.txt")];
    const [a, b] = await lib.pickFiles();
    const doc = ok(a!);
    expect(doc).toMatchObject({ format: "markdown", path: chosen[0] });
    expect(b).toMatchObject({ ok: false, name: "missing.txt" });
    await lib.showInFolder(doc.id);
    expect(revealed).toEqual([chosen[0]]);
  });

  it("names the supported types for an unsupported drop", async () => {
    const r = await lib.importBytes("clip.mp4", new Uint8Array([0]));
    expect(r).toMatchObject({ ok: false, reason: "unsupported", name: "clip.mp4" });
  });

  it("keeps a scanned PDF with its original bytes so OCR can run, then replaces its text", async () => {
    const doc = ok(await lib.importBytes("scan.pdf", fixture("scanned.pdf")));
    expect(doc).toMatchObject({ needsOcr: true, pages: 2, wordCount: 0 });
    expect(await lib.source(doc.id)).toEqual(fixture("scanned.pdf"));
    const done = await lib.replaceBlocks(doc.id, [{ kind: "paragraph", text: "Recognized text here.", page: 1 }]);
    expect(done).toMatchObject({ wordCount: 3 });
    expect(done?.needsOcr).toBeUndefined();
  });

  it("fetches a web address and extracts the article", async () => {
    const doc = ok(await lib.importUrl(`${base}/article`));
    expect(doc).toMatchObject({ source: "url", origin: `127.0.0.1:${new URL(base).port}` });
    expect(doc.title).toContain("The quiet return of local-first software");
  });

  it("refuses a local address when no fetch is injected", async () => {
    const guarded = await createLibrary({ dir, reveal: () => {}, chooseFiles: async () => [] });
    expect(await guarded.importUrl(`${base}/article`)).toMatchObject({ ok: false, reason: "network", error: { code: "local-address" } });
  });

  it("explains failures in plain words", async () => {
    expect(await lib.importUrl(`${base}/missing`)).toMatchObject({ ok: false, reason: "network", error: { code: "http-status", args: { status: 404 } } });
    expect(await lib.importUrl(`${base}/image`)).toMatchObject({ ok: false, reason: "unsupported" });
    expect(await lib.importUrl("ftp://example.com/x")).toMatchObject({ ok: false, error: { code: "only-http" } });
    expect(await lib.importUrl("http://127.0.0.1:1/")).toMatchObject({ ok: false, reason: "network", error: { code: "unreachable", args: { host: "127.0.0.1:1" } } });
  });
});

describe("a corrupt index", () => {
  it("is set aside as library.json.bad and the library starts empty, with one notice", async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "library.json"), '{"docs": [{"id": ');
    const recovered: string[] = [];
    const again = await createLibrary({ dir, reveal: () => {}, chooseFiles: async () => [], onRecovered: (f) => recovered.push(f) });
    expect(await again.list()).toEqual([]);
    expect(recovered).toEqual([path.join(dir, "library.json.bad")]);
    expect(readFileSync(path.join(dir, "library.json.bad"), "utf8")).toBe('{"docs": [{"id": ');
    ok(await again.importText("Still works.", "After"));
    expect(await again.list()).toHaveLength(1);
  });
});

describe("the collection", () => {
  it("persists across a restart", async () => {
    const doc = ok(await lib.importText("Persist me.", "Keep"));
    await lib.setProgress(doc.id, { sentence: 3, fraction: 0.4 });
    const again = await make();
    expect((await again.list()).map((d) => [d.title, d.progress.sentence])).toEqual([["Keep", 3]]);
  });

  it("saves bookmarks on a reading and keeps them across a restart", async () => {
    const { id } = ok(await lib.importText("One. Two. Three.", "A"));
    const marks = [{ sentence: 1, label: "Two." }];
    expect((await lib.setBookmarks(id, marks))?.bookmarks).toEqual(marks);
    expect((await (await make()).list())[0]?.bookmarks).toEqual(marks);
    expect((await lib.setBookmarks(id, []))?.bookmarks).toEqual([]);
    expect(await lib.setBookmarks("missing", marks)).toBeNull();
  });

  it("renames, sets and clears a voice, marks finished and unfinished", async () => {
    const { id } = ok(await lib.importText("One. Two.", "A"));
    expect((await lib.rename(id, "B"))?.title).toBe("B");
    expect((await lib.setVoice(id, "am_adam"))?.voice).toBe("am_adam");
    expect((await lib.setVoice(id, null))?.voice).toBeUndefined();
    expect(await lib.setFinished(id, true)).toMatchObject({ finished: true, progress: { fraction: 1 } });
    expect(await lib.setFinished(id, false)).toMatchObject({ finished: false, progress: { fraction: 0 } });
    expect(await lib.setProgress(id, { sentence: 9, fraction: 1 })).toMatchObject({ finished: true });
    expect((await lib.markOpened(id))?.openedAt).toBe(1000);
  });

  it("removes a reading, restores it until the app quits, and deletes its files on the next start", async () => {
    const { id } = ok(await lib.importText("Bye.", "Gone"));
    await lib.remove(id);
    expect(await lib.list()).toEqual([]);
    expect((await lib.restore(id))?.title).toBe("Gone");
    await lib.remove(id);
    expect(readdirSync(path.join(dir, "docs"))).toEqual([`${id}.json`]);
    await make();
    expect(readdirSync(path.join(dir, "docs"))).toEqual([]);
    expect(await lib.restore("nope")).toBeNull();
  });
});

describe("search", () => {
  it("matches every word in the title, the origin or the text, with a snippet for body matches", async () => {
    const a = ok(await lib.importText("Local voices are fast and private.", "Notes A"));
    const b = ok(await lib.importText("Nothing relevant.", "Voices journal"));
    ok(await lib.importText("Weather is mild.", "Weather"));
    expect(await lib.search("voices")).toEqual([{ id: a.id, snippet: "Local voices are fast and private." }, { id: b.id }]);
    expect((await lib.search("FAST private")).map((h) => h.id)).toEqual([a.id]);
    expect(await lib.search("zebra")).toEqual([]);
    expect(await lib.search("  ")).toEqual([]);
  });

  it("sees replaced text after OCR", async () => {
    const doc = ok(await lib.importBytes("scan.pdf", fixture("scanned.pdf")));
    await lib.replaceBlocks(doc.id, [{ kind: "paragraph", text: "Invoice number 4411." }]);
    expect((await lib.search("4411")).map((h) => h.id)).toEqual([doc.id]);
  });
});

describe("speak proxy", () => {
  it("forwards the request with the token and replace group, streams the body and reports the status", async () => {
    const seen: Record<string, string | undefined>[] = [];
    const srv = createServer((req, res) => {
      const body: Buffer[] = [];
      req.on("data", (c) => body.push(c));
      req.on("end", () => {
        seen.push({
          url: req.url,
          auth: req.headers.authorization,
          replace: req.headers["x-speakkit-replace"] as string | undefined,
          origin: req.headers.origin,
          body: Buffer.concat(body).toString(),
        });
        res.write("ab");
        setTimeout(() => res.end("cd"), 10);
      });
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as AddressInfo).port;
    const chunks: ProxyChunk[] = [];
    const proxy = createSpeakProxy({ target: () => ({ port, token: "tok" }) });
    await proxy.open({ id: 5, path: "/v1/speak", method: "POST", body: '{"a":1}', replace: "tab-7" }, (c) => chunks.push(c));
    srv.close();
    expect(seen).toEqual([{ url: "/v1/speak", auth: "Bearer tok", replace: "tab-7", origin: undefined, body: '{"a":1}' }]);
    const data = chunks.filter((c) => c.type === "data").flatMap((c) => (c.type === "data" ? [...c.data] : []));
    expect(Buffer.from(data).toString()).toBe("abcd");
    expect(chunks[0]).toEqual({ id: 5, type: "head", status: 200 });
    expect(chunks.at(-1)).toEqual({ id: 5, type: "end" });
  });

  it("reports a refused connection as an error chunk and stays silent after a cancel", async () => {
    const chunks: ProxyChunk[] = [];
    const proxy = createSpeakProxy({ target: () => ({ port: 1, token: "t" }) });
    await proxy.open({ id: 1, path: "/v1/health", method: "GET" }, (c) => chunks.push(c));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ id: 1, type: "error" });

    const slow = createServer(() => {});
    await new Promise<void>((r) => slow.listen(0, "127.0.0.1", r));
    const later: ProxyChunk[] = [];
    const p2 = createSpeakProxy({ target: () => ({ port: (slow.address() as AddressInfo).port, token: "t" }) });
    const run = p2.open({ id: 2, path: "/v1/health", method: "GET" }, (c) => later.push(c));
    setTimeout(() => p2.cancel(2), 30);
    await run;
    slow.closeAllConnections();
    slow.close();
    expect(later).toEqual([]);
  });
});
