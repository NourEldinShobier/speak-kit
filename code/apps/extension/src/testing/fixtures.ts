/** The article from designs B1-B21, wrapped in the clutter real pages carry. */
export const ARTICLE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>The quiet return of local-first software</title>
<style>
body{margin:0;font:18px/30px Inter,system-ui,sans-serif;background:#fff;color:#1e1f20}
.col{width:720px;margin:0 auto;padding:56px 0}
nav{height:60px;background:#eee;padding:10px}
.kicker{font:600 12px Inter;color:#0069cc;letter-spacing:1px}
h1{font-size:40px;line-height:46px;margin:18px 0}
.by{font-size:14px;color:#606060}
hr{border:0;border-top:1px solid #e2e2e5;margin:18px 0}
p{margin:0 0 18px}
.sr-only{position:absolute;left:-9999px}
</style></head><body>
<nav><a href="/">Home</a> <a href="/about">About us and the long story of this site</a> <a href="/contact">Contact</a></nav>
<main class="col"><article>
<div class="kicker">ESSAY · 8 MIN READ</div>
<h1>The quiet return of local-first software</h1>
<div class="by">Maya Okafor · October 28, 2026</div>
<hr>
<div class="ad" aria-hidden="true">Buy the thing now, limited offer for readers of this very page.</div>
<p id="p1">For a decade, the default answer to every software question was the cloud. Notes, documents and even voices lived on someone else's server, rented back to us by the month. Lately that answer has started to wobble. Small models now run on an ordinary laptop, and they sound good enough that nobody asks where the audio came from.</p>
<p id="p2">The appeal is simple. When the work happens on your own machine, it keeps working on a plane, in a tunnel, and long after a startup has changed its pricing. Nothing leaves the device, so there is nothing to leak. Speed stops depending on a data centre three time zones away.</p>
<p id="p3">None of this is nostalgia. It is a bet that the best software is the kind that disappears into the task, and that it can only do so when it is fast, private and yours to keep.</p>
<p id="p4">Three things changed at once. Phones and laptops gained dedicated silicon for machine learning, open models shrank by an order of magnitude, and the tools to ship them became ordinary packages instead of research projects.</p>
<p id="p5">The result is software that treats the network as an optional extra. Sync still matters, but it happens when it can, not when it must, and the app never waits on a server to be useful.</p>
<p id="p6">Every section here is deliberately long enough to need real scrolling, so that a page of this length forces the reading position to move well below the first screen. Keep going. The lights stay on and the voice carries on from sentence to sentence without a hitch.</p>
<p id="p7">Another paragraph of padding so the page has room to scroll, because the tests that check the back-to-current pill need plenty of distance between the first sentence and the bottom of the page. This is enough text to fill a few lines.</p>
<p id="p8">And a final one. The end.</p>
</article></main>
<aside><p>Related: ten tips that you will not believe, number seven is shocking and surprising.</p></aside>
<footer><p>Copyright 2026 Example Media Group. All rights reserved by the publisher.</p></footer>
</body></html>`;

export const MESSY_PAGE = `<!doctype html><html lang="en"><head><title>Messy</title></head><body>
<header><p>Site banner with a tagline that is long enough to be read aloud by mistake.</p></header>
<nav><ul><li>Home page link</li><li>Another navigation entry that is long enough</li></ul></nav>
<div id="wrap">
<aside class="sidebar"><p>Sidebar promo text that should never be spoken because it is an aside element.</p></aside>
<article>
<h1>Dr. Smith in Washington, D.C.</h1>
<p>Dr. Smith flew to Washington, D.C. on Jan. 5 to meet Prof. Lee at 5 p.m. They talked about the U.S. budget, e.g. the cost of fuel. Then they left.</p>
<p>The study found a 12% rise.[1] Others disagree[2,3] and more[4–6] still.<sup class="reference"><a href="#cite_note-7">[7]</a></sup> Some claim it is false [citation needed].</p>
<p>Visit https://example.com/a/very/long/path/that/goes/on/and/on?query=1 for details, or www.example.org/another/long/address/here today.</p>
<ul>
<li>First item with enough words to count as a sentence.
  <ul><li>Nested item one is read after its parent text.</li><li>Nested item two follows right behind it.</li></ul>
</li>
<li>Second item after the nested list is finished here.</li>
</ul>
<p>Visible text <span style="display:none">SECRET-DISPLAY-NONE</span><span hidden>SECRET-HIDDEN</span><span aria-hidden="true">SECRET-ARIA</span><span class="sr-only">SECRET-SR</span><span style="visibility:hidden">SECRET-VISIBILITY</span>stays <b>in</b>   one   <i>paragraph</i>.</p>
<p hidden>Entire hidden paragraph that must not be read.</p>
<pre>const secret = "code block that is skipped";</pre>
<p>Run <code>npm install</code> to begin, then wait for it to finish properly.</p>
<figure><img alt="x" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><figcaption>Figure 1: A caption that is optional to read.</figcaption></figure>
<form><p>Subscribe to our newsletter today by entering your email address below.</p></form>
<p>This sentence is intentionally very long so that it has to be split at a clause boundary because the text-to-speech engine works much better with shorter inputs, and a very long run of words without any stop is hard to follow, so the extractor breaks it up at a comma or a conjunction while keeping every word in order, and never cutting through the middle of a word at all.</p>
</article>
</div>
<footer><p>Footer legal text that should never be spoken either way because it is a footer.</p></footer>
</body></html>`;

/** Generated page: n paragraphs of ~3 sentences each inside one article, with some inline markup. */
export const bigPage = (n: number) => {
  const para = (i: number) =>
    `<p>Paragraph ${i} starts here and it has a <a href="#x${i}">link</a> inside. The second sentence of paragraph ${i} is a little longer than the first one, with <em>emphasis</em> added. Dr. Jones disagreed, e.g. on point ${i}, and so the third sentence ends the block.</p>`;
  let body = "";
  for (let i = 0; i < n; i++) body += para(i);
  return `<!doctype html><html lang="en"><head><title>Big</title></head><body><nav><a href="/">Home</a></nav><main><article><h1>Big page</h1>${body}</article></main><footer><p>Footer text of the big page, not spoken.</p></footer></body></html>`;
};
