import { test, expect, highlights } from "../support/ext";
import { shell, sentence } from "../support/pages";
import { extractOf, readTab, selectBetween, stateOf } from "../support/probe";

const select = (page: import("@playwright/test").Page, from: string, to: string) => selectBetween(page, from, to);

test.describe("what a selection reads", () => {
  test("across paragraphs: the part of the first, all of the middle, the part of the last", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/select");
    await page.evaluate(() => {
      const a = document.getElementById("a")!.firstChild as Text;
      const c = document.getElementById("c")!.firstChild as Text;
      const r = document.createRange();
      r.setStart(a, a.data.indexOf("P1S2"));
      r.setEnd(c, c.data.indexOf("P3S3") - 1);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
    });
    expect((await extractOf(ext, page, "selection")).sentences).toEqual([sentence(1, 2), sentence(1, 3), sentence(2, 1), sentence(2, 2), sentence(2, 3), sentence(3, 1), sentence(3, 2)]);
    expect((await readTab(ext, page, "selection")).ok).toBe(true);
    await ext.waitState("playing");
    await expect.poll(async () => (await highlights(page)).sentence).toBe(sentence(1, 2));
    expect((await stateOf(ext)).sentenceCount).toBe(7);
  });

  test("across list items and table cells", async ({ ext, app }) => {
    await ext.pair(app);
    const page = await ext.open("/lists");
    await select(page, "ol", "ol");
    expect((await extractOf(ext, page, "selection")).sentences).toEqual(["OL first step reads like this.", "OL second step reads like this."]);
    await select(page, "tr:nth-child(2)", "tr:nth-child(2)");
    expect((await extractOf(ext, page, "selection")).sentences).toEqual(["TD Ada writes the first program.", "TD Engineer who works alone."]);
  });

  test("a short snippet in a plain div or a cell is read, not replaced by the whole page", async ({ ext, app }) => {
    ext.fx.set(
      "/snippets",
      shell(
        "Snippets",
        `<main><h1>Chat log</h1><div id="msg">See you at noon.</div><table><tr><td id="cell">Engineer</td></tr></table>
<p>${sentence(1, 1)} ${sentence(1, 2)} ${sentence(1, 3)}</p></main>`,
      ),
    );
    await ext.pair(app);
    const page = await ext.open("/snippets");
    await select(page, "#msg", "#msg");
    expect((await extractOf(ext, page, "selection")).sentences).toEqual(["See you at noon."]);
    await select(page, "#cell", "#cell");
    expect((await extractOf(ext, page, "selection")).sentences).toEqual(["Engineer"]);
    await select(page, "#msg", "#msg");
    expect((await readTab(ext, page, "selection")).ok).toBe(true);
    await ext.waitState("playing");
    expect((await stateOf(ext)).sentenceCount).toBe(1);
  });

  test("select all on a 5000 paragraph page is extracted whole, quickly, and starts playing", async ({ ext, app }) => {
    test.setTimeout(120_000);
    await ext.pair(app);
    const page = await ext.open("/big");
    await page.evaluate(() => {
      const r = document.createRange();
      r.selectNodeContents(document.body);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(r);
    });
    const t0 = Date.now();
    const got = await extractOf(ext, page, "selection");
    expect(Date.now() - t0, "ms to extract a selection of 5000 paragraphs").toBeLessThan(5000);
    expect(got.sentences).toHaveLength(10_001);
    expect(got.sentences.slice(0, 3)).toEqual(["Big", sentence(1, 1), sentence(1, 2)]);
    expect(got.sentences.at(-1)).toBe(sentence(5000, 2));
    expect((await readTab(ext, page, "selection")).ok).toBe(true);
    await ext.waitState("playing", 30_000);
    expect((await stateOf(ext)).sentenceCount).toBe(10_001);
  });
});

test.describe("a very long page", () => {
  test("5000 paragraphs are extracted without a cap, streamed in order, and reading reaches the last sentence and finishes", async ({ ext, app }) => {
    test.setTimeout(120_000);
    await ext.pair(app);
    await ext.setSettings({ speed: 3 });
    const page = await ext.open("/big");
    const got = await extractOf(ext, page);
    expect(got.sentences).toHaveLength(10_001);
    expect(got.sentences.at(-1)).toBe(sentence(5000, 2));
    expect((await readTab(ext, page)).ok).toBe(true);
    await ext.waitState("playing", 30_000);
    await expect.poll(() => app.engine.calls.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(40);
    expect(app.engine.calls.slice(0, 3).map((c) => c.text)).toEqual(["Big", sentence(1, 1), sentence(1, 2)]);
    // At the pace of the player (a sentence or two a second, 10001 of them) the whole page is hours: jump to the tail and let it finish.
    await page.bringToFront(); // a background tab does not run animation frames
    // Sampled in the page on every frame: the tail sentences are on screen for a fraction of a second.
    await page.evaluate(() => {
      const seen: string[] = ((window as unknown as { __seen: string[] }).__seen = []);
      const tick = () => {
        const text = [...(CSS.highlights.get("speakkit-sentence") ?? [])].map(String).join("");
        if (text && text !== seen.at(-1)) seen.push(text);
        requestAnimationFrame(tick);
      };
      tick();
    });
    await ext.bg({ t: "player", command: { cmd: "seek-sentence", index: 9_998 } });
    await expect.poll(async () => (await stateOf(ext)).status, { timeout: 60_000 }).toBe("finished");
    const end = await stateOf(ext);
    const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
    expect(seen.at(-1), `highlights seen: ${seen.join(" | ")}`).toBe(sentence(5000, 2));
    expect(end.sentenceCount).toBe(10_001);
    expect(app.engine.calls.at(-1)!.text).toBe(sentence(5000, 2));
  });
});
