import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { ARTICLE_PAGE, bigPage, MESSY_PAGE } from "../../testing/fixtures";
import { launch, type Session } from "../../testing/harness";

let s: Session;
beforeAll(async () => {
  s = await launch();
}, 90000);
afterAll(async () => {
  await s?.close();
});

const SKIP = { navigation: true, citations: true, code: true, urls: true, captions: false };
/** Run extract() in the page and return plain data. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (page: any, skip = SKIP) =>
  page.evaluate((skip: typeof SKIP) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const E = (window as any).SK.extract;
    const ex = E.extract(document, { skip });
    return {
      root: ex.root.localName + (ex.root.id ? "#" + ex.root.id : ""),
      title: ex.title,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sentences: ex.sentences.map((x: any) => x.text) as string[],
      ranges: ex.sentences.map((_: unknown, i: number) => E.sentenceRange(document, ex, i)?.toString()) as string[],
    };
  }, skip);

describe("article page", () => {
  test("reads the title and every paragraph in order, nothing from nav, aside, footer or aria-hidden ads", async () => {
    const page = await s.page(ARTICLE_PAGE);
    const r = await run(page);
    expect(r.root).toBe("article");
    expect(r.title).toBe("The quiet return of local-first software");
    expect(r.sentences.slice(0, 5)).toEqual([
      "The quiet return of local-first software",
      "For a decade, the default answer to every software question was the cloud.",
      "Notes, documents and even voices lived on someone else's server, rented back to us by the month.",
      "Lately that answer has started to wobble.",
      "Small models now run on an ordinary laptop, and they sound good enough that nobody asks where the audio came from.",
    ]);
    const all = r.sentences.join(" ");
    for (const bad of ["Buy the thing", "Related:", "Copyright", "About us", "ten tips"]) expect(all).not.toContain(bad);
    expect(r.sentences.at(-1)).toBe("The end.");
    await page.context().close();
  });

  test("each sentence Range selects exactly the sentence text", async () => {
    const page = await s.page(ARTICLE_PAGE);
    const r = await run(page);
    expect(r.ranges).toEqual(r.sentences);
    await page.context().close();
  });

  test("word ranges select the word", async () => {
    const page = await s.page(ARTICLE_PAGE);
    const words = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const E = (window as any).SK.extract;
      const ex = E.extract(document, { skip: { navigation: true, citations: true, code: true, urls: true, captions: false } });
      const i = ex.sentences.findIndex((x: { text: string }) => x.text.startsWith("Notes, documents"));
      const text: string = ex.sentences[i].text;
      const out: string[] = [];
      for (const w of ["Notes", "documents", "voices", "month."]) {
        const a = text.indexOf(w);
        out.push(E.wordRange(document, ex, i, a, a + w.length).toString());
      }
      return out;
    });
    expect(words).toEqual(["Notes", "documents", "voices", "month."]);
    await page.context().close();
  });

  test("sentenceIndexAt finds the first sentence of a paragraph and the sentence at a point", async () => {
    const page = await s.page(ARTICLE_PAGE);
    const r = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const E = (window as any).SK.extract;
      const ex = E.extract(document, { skip: { navigation: true, citations: true, code: true, urls: true, captions: false } });
      const p2 = document.getElementById("p2")!;
      const blockStart = E.sentenceIndexAt(ex, p2, 0);
      const inP2 = p2.firstChild as Text;
      const off = inP2.data.indexOf("Nothing leaves");
      const precise = E.sentenceIndexAt(ex, inP2, off + 3, true);
      return { blockStart: ex.sentences[blockStart].text as string, precise: ex.sentences[precise].text as string };
    });
    expect(r.blockStart).toBe("The appeal is simple.");
    expect(r.precise).toBe("Nothing leaves the device, so there is nothing to leak.");
    await page.context().close();
  });

  test("selection mode returns only the selected text, clipped to the selection", async () => {
    const page = await s.page(ARTICLE_PAGE);
    const r = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const E = (window as any).SK.extract;
      const p1 = document.getElementById("p1")!.firstChild as Text;
      const p2 = document.getElementById("p2")!.firstChild as Text;
      const range = document.createRange();
      range.setStart(p1, p1.data.indexOf("Notes, documents"));
      range.setEnd(p2, p2.data.indexOf("When the work") + 8);
      const ex = E.extract(document, { skip: { navigation: true, citations: true, code: true, urls: true, captions: false }, selection: range });
      return ex.sentences.map((x: { text: string }) => x.text) as string[];
    });
    expect(r[0]).toBe("Notes, documents and even voices lived on someone else's server, rented back to us by the month.");
    expect(r.slice(-2)).toEqual(["The appeal is simple.", "When the"]);
    await page.context().close();
  });
});

describe("selection edges", () => {
  const html = `<!doctype html><html><body><main><p id="a">Alpha one. Alpha <b id="bold">two</b> tail here.</p><p id="b">Bravo one.</p><p id="c">Charlie one.</p></main></body></html>`;
  const skip = { navigation: true, citations: true, code: true, urls: true, captions: false };

  test("a triple-click that ends at the start of the next paragraph does not read that paragraph", async () => {
    const page = await s.page(html);
    const r = await page.evaluate((skip: Record<string, boolean>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const E = (window as any).SK.extract;
      const range = document.createRange();
      range.setStart(document.getElementById("b")!.firstChild!, 0);
      range.setEnd(document.getElementById("c")!, 0);
      return E.extract(document, { skip, selection: range }).sentences.map((x: { text: string }) => x.text) as string[];
    }, skip);
    expect(r).toEqual(["Bravo one."]);
    await page.context().close();
  });

  test("text before the selection start in the same paragraph is not read", async () => {
    const page = await s.page(html);
    const r = await page.evaluate((skip: Record<string, boolean>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const E = (window as any).SK.extract;
      const range = document.createRange();
      range.setStart(document.getElementById("bold")!.firstChild!, 0);
      range.setEnd(document.getElementById("a")!.lastChild!, 5);
      return E.extract(document, { skip, selection: range }).sentences.map((x: { text: string }) => x.text) as string[];
    }, skip);
    expect(r).toEqual(["two tail"]);
    await page.context().close();
  });
});

describe("messy page", () => {
  test("matches the expected reading, honouring all skips", async () => {
    const page = await s.page(MESSY_PAGE);
    const r = await run(page);
    expect(r.root).toBe("article");
    expect(r.sentences).toEqual([
      "Dr. Smith in Washington, D.C.",
      "Dr. Smith flew to Washington, D.C. on Jan. 5 to meet Prof. Lee at 5 p.m. They talked about the U.S. budget, e.g. the cost of fuel.",
      "Then they left.",
      "The study found a 12% rise.",
      "Others disagree and more still.",
      "Some claim it is false.",
      "Visit link for details, or link today.",
      "First item with enough words to count as a sentence.",
      "Nested item one is read after its parent text.",
      "Nested item two follows right behind it.",
      "Second item after the nested list is finished here.",
      "Visible text stays in one paragraph.",
      "Run to begin, then wait for it to finish properly.",
      "Figure 1: A caption that is optional to read.",
      expect.stringMatching(/^This sentence is intentionally very long .* or a conjunction$/),
      "while keeping every word in order, and never cutting through the middle of a word at all.",
    ]);
    await page.context().close();
  });

  test("hidden text, sidebars, forms, headers and footers never leak", async () => {
    const page = await s.page(MESSY_PAGE);
    const r = await run(page);
    const all = r.sentences.join(" ");
    for (const bad of ["SECRET", "Entire hidden", "Sidebar promo", "Subscribe", "Footer legal", "Site banner", "code block", "Home page link"]) expect(all).not.toContain(bad);
    await page.context().close();
  });

  test("a sentence whose citations were removed still maps to the original DOM text", async () => {
    const page = await s.page(MESSY_PAGE);
    const r = await run(page);
    const at = (t: string) => r.ranges[r.sentences.indexOf(t)];
    expect(at("The study found a 12% rise.")).toBe("The study found a 12% rise.");
    expect(at("Others disagree and more still.")).toBe("Others disagree[2,3] and more[4–6] still.");
    expect(at("Visit link for details, or link today.")).toBe(
      "Visit https://example.com/a/very/long/path/that/goes/on/and/on?query=1 for details, or www.example.org/another/long/address/here today.",
    );
    expect(at("Visible text stays in one paragraph.")).toContain("stays in   one   paragraph.");
    await page.context().close();
  });

  test("skip settings off keep citations, urls, code and captions", async () => {
    const page = await s.page(MESSY_PAGE);
    const r = await run(page, { navigation: false, citations: false, code: false, urls: false, captions: false });
    const all = r.sentences.join(" ");
    expect(all).toContain("The study found a 12% rise.[1]");
    expect(all).toContain("https://example.com/a/very/long/path");
    expect(all).toContain("npm install");
    expect(all).toContain('const secret = "code block that is skipped";');
    await page.context().close();
  });

  test("skip.captions drops figcaptions", async () => {
    const page = await s.page(MESSY_PAGE);
    const r = await run(page, { ...SKIP, captions: true });
    expect(r.sentences.join(" ")).not.toContain("Figure 1");
    await page.context().close();
  });

  test("page without semantic wrappers picks the densest block, not the sidebar", async () => {
    const html = `<!doctype html><html><body><div id="top"><div id="menu"><ul><li>Home page</li><li>About the company</li></ul></div>
      <div id="content"><div class="post"><p>${"A real paragraph of the post with plenty of words in it. ".repeat(4)}</p><p>${"Another real paragraph with plenty of words, too. ".repeat(4)}</p><p>${"Third long paragraph of the post, still going. ".repeat(4)}</p></div>
      <div class="side"><p>Short teaser one that is quite brief.</p></div></div></div></body></html>`;
    const page = await s.page(html);
    const r = await run(page);
    expect(r.root).toBe("div");
    expect(r.sentences.join(" ")).not.toContain("teaser");
    expect(r.sentences.join(" ")).not.toContain("Home page");
    expect(r.sentences.length).toBeGreaterThan(10);
    await page.context().close();
  });

  test("right-to-left text is extracted", async () => {
    const page = await s.page(`<!doctype html><html lang="ar" dir="rtl"><body><main><p>هذه جملة أولى طويلة بما يكفي. وهذه جملة ثانية أيضا.</p></main></body></html>`);
    const r = await run(page);
    expect(r.sentences).toEqual(["هذه جملة أولى طويلة بما يكفي.", "وهذه جملة ثانية أيضا."]);
    await page.context().close();
  });
});

describe("performance", () => {
  test("5,000 paragraphs extract fast and correctly", async () => {
    const page = await s.page(bigPage(5000));
    const r = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const E = (window as any).SK.extract;
      const skip = { navigation: true, citations: true, code: true, urls: true, captions: false };
      const runs: number[] = [];
      let n = 0;
      let first = 0;
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        const ex = E.extract(document, { skip });
        const dt = performance.now() - t0;
        if (i === 0) first = dt;
        runs.push(dt);
        n = ex.sentences.length;
      }
      runs.sort((a, b) => a - b);
      return { first, best: runs[0]!, median: runs[2]!, n };
    });
    expect(r.n).toBe(15001);
    // target is < 50 ms warm; the bound is loose because this machine is shared. Measured numbers go in docs/perf.md.
    expect(r.best).toBeLessThan(120);
    await page.context().close();
  });
});
