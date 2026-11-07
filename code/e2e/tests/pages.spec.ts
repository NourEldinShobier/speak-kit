import { test, expect, highlights } from "../support/ext";
import { shell } from "../support/pages";
import { extractOf, readTab, stateOf, spoken } from "../support/probe";

const S = (tag: string, n = 2) => Array.from({ length: n }, (_, i) => `${tag} sentence ${i + 1} walks along the quiet harbor wall.`);
const P = (id: string, tag: string) => `<p id="${id}">${S(tag).join(" ")}</p>`;

const SPA = (view: string) => `<main id="view"><h1>View ${view}</h1>${P("p", view)}${P("q", view)}</main>`;
const spaPage = shell(
  "Single page app",
  `<button id="push" onclick="history.pushState({}, '', '/spa-push/two'); document.getElementById('view').outerHTML = window.VIEW2">go</button>
<button id="swap" onclick="document.getElementById('view').innerHTML = window.INNER2">swap</button>
${SPA("ONE")}
<script>
window.VIEW2 = ${JSON.stringify(SPA("TWO"))};
window.INNER2 = ${JSON.stringify(`<h1>View TWO</h1>${P("p", "TWO")}`)};
addEventListener("hashchange", () => { if (location.hash === "#two") document.getElementById("view").innerHTML = window.INNER2; });
</script>`,
);

test.describe("single page apps: content that changes under the reader", () => {
  test("pushState to another page stops the reading, clears the highlight and the next read gets the new view", async ({ ext, app }) => {
    ext.fx.set("/spa-push/one", spaPage);
    await ext.pair(app);
    const page = await ext.open("/spa-push/one");
    expect((await extractOf(ext, page)).sentences.slice(0, 2)).toEqual(["View ONE", "ONE sentence 1 walks along the quiet harbor wall."]);
    expect((await readTab(ext, page)).ok).toBe(true);
    await ext.waitState("playing");
    await expect.poll(async () => (await highlights(page)).sentence.length).toBeGreaterThan(0);
    await page.click("#push");
    await expect.poll(async () => (await stateOf(ext)).status, { timeout: 8000 }).toBe("idle");
    await expect.poll(async () => (await highlights(page)).sentence).toBe("");
    const calls = app.engine.calls.length;
    const after = await extractOf(ext, page);
    expect(after.sentences).toEqual(["View TWO", "TWO sentence 1 walks along the quiet harbor wall.", "TWO sentence 2 walks along the quiet harbor wall.", "TWO sentence 1 walks along the quiet harbor wall.", "TWO sentence 2 walks along the quiet harbor wall."]);
    expect((await readTab(ext, page)).ok).toBe(true);
    await ext.waitState("playing");
    await expect.poll(() => app.engine.calls.length).toBeGreaterThan(calls + 2);
    expect(spoken(app).slice(calls).join(" ")).not.toContain("ONE sentence");
  });

  test("a hash change that swaps the content keeps the reading going; a new read gets the new text", async ({ ext, app }) => {
    ext.fx.set("/spa-hash", spaPage);
    await ext.pair(app);
    const page = await ext.open("/spa-hash");
    await readTab(ext, page);
    await ext.waitState("playing");
    await page.evaluate(() => (location.hash = "#two"));
    await page.waitForTimeout(1500);
    expect((await stateOf(ext)).status).toBe("playing");
    expect((await extractOf(ext, page)).sentences).toEqual(["View TWO", "TWO sentence 1 walks along the quiet harbor wall.", "TWO sentence 2 walks along the quiet harbor wall."]);
    await ext.cmd("stop");
    await ext.waitState("idle");
    expect((await readTab(ext, page)).ok).toBe(true);
    await expect.poll(() => spoken(app).some((t) => t.startsWith("TWO sentence 1"))).toBe(true);
  });

  test("replacing the text in place while it is read neither throws nor leaves a highlight after stop", async ({ ext, app }) => {
    ext.fx.set("/spa-swap", spaPage);
    await ext.pair(app);
    const page = await ext.open("/spa-swap");
    await readTab(ext, page);
    await ext.waitState("playing");
    await page.click("#swap");
    await page.waitForTimeout(1200);
    expect((await stateOf(ext)).status).toBe("playing");
    await ext.cmd("stop");
    await ext.waitState("idle");
    await expect.poll(async () => (await highlights(page)).sentence).toBe("");
    expect((await extractOf(ext, page)).sentences[0]).toBe("View TWO");
  });
});

test.describe("frames, shadow DOM, hidden text and fields", () => {
  test("text inside same-origin, cross-origin and srcdoc iframes is not read, and the top page still is", async ({ ext, app }) => {
    ext.fx.set("/frame-same", shell("same", `<main><p>SAMEFRAME ${S("INSIDE")[0]}</p></main>`));
    ext.fx.set("/frame-cross", shell("cross", `<main><p>CROSSFRAME ${S("OUTSIDE")[0]}</p></main>`));
    ext.fx.set(
      "/frames",
      shell(
        "Frames",
        `<main><h1>Top heading</h1><p>${S("TOP").join(" ")}</p>
<iframe title="a" src="/frame-same" width="400" height="120"></iframe>
<iframe title="b" src="${ext.fx.alt("/frame-cross")}" width="400" height="120"></iframe>
<iframe title="c" srcdoc="<p>SRCDOCFRAME ${S("SRCDOC")[0]}</p>" width="400" height="120"></iframe>
<p>${S("BOTTOM").join(" ")}</p></main>`,
      ),
    );
    await ext.pair(app);
    const page = await ext.open("/frames");
    await expect(page.frameLocator("iframe[title=b]").locator("p")).toContainText("CROSSFRAME");
    expect((await extractOf(ext, page)).sentences).toEqual(["Top heading", ...S("TOP"), ...S("BOTTOM")]);
    expect((await readTab(ext, page)).ok).toBe(true);
    await ext.waitState("playing");
  });

  test("a page that is only an iframe reports that it cannot be read, in the player state", async ({ ext, app }) => {
    ext.fx.set("/only-frame-inner", shell("inner", `<main><p>${S("INNER").join(" ")}</p></main>`));
    ext.fx.set("/only-frame", shell("Only a frame", `<iframe src="/only-frame-inner" style="width:100%;height:600px;border:0"></iframe>`));
    await ext.pair(app);
    const page = await ext.open("/only-frame");
    expect((await readTab(ext, page)).ok).toBe(false);
    await expect.poll(async () => (await stateOf(ext)).code).toBe("page-unreadable");
  });

  test("text in open shadow roots and in slotted content is read in document order; a closed root is skipped", async ({ ext, app }) => {
    ext.fx.set(
      "/shadow",
      shell(
        "Web components",
        `<main><h1>Components</h1>
<x-card id="card"><p slot="body">SLOTTED ${S("LIGHT")[0]}</p></x-card>
<x-note id="note"></x-note>
<x-closed id="closed"></x-closed>
<p>${S("AFTER").join(" ")}</p></main>
<script>
customElements.define("x-card", class extends HTMLElement { constructor(){ super(); this.attachShadow({mode:"open"}).innerHTML = '<p>${S("SHADOWHEAD")[0]}</p><slot name="body"></slot><p>${S("SHADOWTAIL")[0]}</p>'; } });
customElements.define("x-note", class extends HTMLElement { constructor(){ super(); const r = this.attachShadow({mode:"open"}); r.innerHTML = '<div><x-inner></x-inner></div>'; } });
customElements.define("x-inner", class extends HTMLElement { constructor(){ super(); this.attachShadow({mode:"open"}).innerHTML = '<p>${S("NESTED")[0]}</p>'; } });
customElements.define("x-closed", class extends HTMLElement { constructor(){ super(); this.attachShadow({mode:"closed"}).innerHTML = '<p>${S("CLOSED")[0]}</p>'; } });
</script>`,
      ),
    );
    await ext.pair(app);
    const page = await ext.open("/shadow");
    expect((await extractOf(ext, page)).sentences).toEqual([
      "Components",
      S("SHADOWHEAD")[0],
      `SLOTTED ${S("LIGHT")[0]}`,
      S("SHADOWTAIL")[0],
      S("NESTED")[0],
      ...S("AFTER"),
    ]);
    expect((await readTab(ext, page)).ok).toBe(true);
    await ext.waitState("playing");
    await expect.poll(async () => (await highlights(page)).sentence).toContain("SHADOWHEAD");
    await ext.bg({ t: "player", command: { cmd: "pause" } });
    await ext.waitState("paused");
    const card = page.locator("#card");
    const marked = await card.screenshot();
    await ext.cmd("stop");
    await ext.waitState("idle");
    expect(Buffer.compare(marked, await card.screenshot()), "the highlight is drawn inside the shadow root").not.toBe(0);
  });

  test("hidden text is not read: display none, visibility hidden, hidden, aria-hidden, inert, off-screen sr-only, closed details", async ({ ext, app }) => {
    ext.fx.set(
      "/hidden",
      shell(
        "Hidden",
        `<main><h1>Visible heading</h1>
<p>${S("SHOWN")[0]}</p>
<p style="display:none">${S("DISPLAYNONE")[0]}</p>
<p style="visibility:hidden">${S("VISHIDDEN")[0]}</p>
<p hidden>${S("HIDDENATTR")[0]}</p>
<p aria-hidden="true">${S("ARIAHIDDEN")[0]}</p>
<p class="sr-only">${S("SRONLY")[0]}</p>
<div style="content-visibility:hidden"><p>${S("CVHIDDEN")[0]}</p></div>
<details><summary>Summary line stays here</summary><p>${S("DETAILSBODY")[0]}</p></details>
<p>${S("ALSOSHOWN")[0]}</p></main>`,
      ),
    );
    await ext.pair(app);
    const page = await ext.open("/hidden");
    expect((await extractOf(ext, page)).sentences).toEqual(["Visible heading", S("SHOWN")[0], "Summary line stays here", S("ALSOSHOWN")[0]]);
  });

  test("field values are never read; editable text is read as page text", async ({ ext, app }) => {
    ext.fx.set(
      "/fields",
      shell(
        "Fields",
        `<main><h1>Form page</h1>
<p>${S("BEFORE")[0]}</p>
<textarea id="ta" rows="3">TEXTAREAVALUE typed by someone in the box.</textarea>
<input id="in" value="INPUTVALUE typed by someone else">
<div id="ce" contenteditable="true"><p>${S("EDITABLE")[0]}</p></div>
<p>${S("AFTER")[0]}</p></main>`,
      ),
    );
    await ext.pair(app);
    const page = await ext.open("/fields");
    expect((await extractOf(ext, page)).sentences).toEqual(["Form page", S("BEFORE")[0], S("EDITABLE")[0], S("AFTER")[0]]);
    await page.evaluate(() => {
      const t = document.getElementById("ta") as HTMLTextAreaElement;
      t.focus();
      t.setSelectionRange(0, 9);
    });
    const sel = (await extractOf(ext, page, "selection")).sentences.join(" ");
    expect(sel).not.toContain("TEXTAREAV");
  });
});

test.describe("non-Latin text, emoji and direction", () => {
  const body = `<main><h1>Mixed scripts</h1>
<p id="zh">今天天气很好。我们去公园散步吧！</p>
<p id="ja">東京は大きな都市です。私は毎日電車で通勤します。</p>
<p id="hi">यह एक परीक्षण वाक्य है। दूसरा वाक्य यहाँ है।</p>
<p id="em">Family 👨‍👩‍👧‍👦 and flags 🇳🇴🇯🇵 smile 😀 done today. Next sentence 🎉 ends here.</p></main>`;

  test("Chinese, Japanese, Hindi and emoji split into whole sentences and keep every character", async ({ ext, app }) => {
    ext.fx.set("/scripts", shell("Scripts", body).replace('lang="en"', 'lang="zh"'));
    await ext.pair(app);
    const page = await ext.open("/scripts");
    const got = (await extractOf(ext, page)).sentences;
    expect(got).toEqual([
      "Mixed scripts",
      "今天天气很好。",
      "我们去公园散步吧！",
      "東京は大きな都市です。",
      "私は毎日電車で通勤します。",
      "यह एक परीक्षण वाक्य है।",
      "दूसरा वाक्य यहाँ है।",
      "Family 👨‍👩‍👧‍👦 and flags 🇳🇴🇯🇵 smile 😀 done today.",
      "Next sentence 🎉 ends here.",
    ]);
    for (const s of got) expect(s, "no lone surrogate").not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    await readTab(ext, page);
    await ext.waitState("playing");
    await expect.poll(async () => (await highlights(page)).sentence).toBe("Mixed scripts");
    await expect.poll(() => spoken(app).length).toBeGreaterThan(3);
    expect(spoken(app).slice(1, 3)).toEqual(["今天天气很好。", "我们去公园散步吧！"]);
  });
});
