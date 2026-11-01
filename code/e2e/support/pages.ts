/** HTML for the fixture web server. Sentences carry a marker (P3S2) so tests can tell exactly what was sent to the speech server. */

export const sentence = (p: number, s: number) =>
  `P${p}S${s} the quiet harbor wakes before the first ferry leaves the dock.`;
const para = (p: number, n = 3) =>
  Array.from({ length: n }, (_, i) => sentence(p, i + 1)).join(" ");

const shell = (title: string, body: string, css = "") => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:18px/1.6 Georgia,serif;margin:0;color:#1e1f20;background:#fff}
main,article{max-width:720px;margin:0 auto;padding:0 24px}
nav,header,footer,aside{font:14px sans-serif}${css}</style></head><body>${body}</body></html>`;

export function article(): string {
  const ps = Array.from({ length: 10 }, (_, i) => {
    const p = i + 1;
    if (p === 3)
      return `<p id="p3">${sentence(3, 1)}<sup>[1]</sup> ${sentence(3, 2)}[2] Read more at https://example.com/a/very/long/path/that/goes/on/and/on/forever?query=1&other=2 for details.</p>`;
    return `<p id="p${p}">${para(p)}</p>`;
  });
  return shell(
    "The Long Harbor",
    `<header class="site-header"><nav>HOMENAV ABOUTNAV CONTACTNAV</nav></header>
<main><article>
<h1>The Long Harbor</h1>
${ps.slice(0, 5).join("\n")}
<aside class="ad">ADTEXT buy our product now</aside>
<ul><li id="li1">LIST one is a short item about nets.</li><li>LIST two is a short item about ropes.</li></ul>
<blockquote id="bq">QUOTE the sea does not care who is watching.</blockquote>
<pre><code>const CODEBLOCK = 1;</code></pre>
${ps.slice(5).join("\n")}
</article></main>
<footer>FOOTERTEXT copyright someone</footer>`,
    "p{margin:0 0 24px}",
  );
}

export const shortPage = () =>
  shell(
    "Short Page",
    `<main><h1>Short</h1><p id="p1">${sentence(1, 1)} ${sentence(1, 2)}</p><p id="p2">${sentence(2, 1)}</p></main>`,
  );

/** Paragraphs far apart so scrolling by hand moves the reading position out of view. */
export function tallPage(paragraphs = 40): string {
  return shell(
    "Tall Page",
    `<main><article><h1>Tall</h1>${Array.from({ length: paragraphs }, (_, i) => `<p id="p${i + 1}" style="margin:0 0 120px">${para(i + 1)}</p>`).join("")}</article></main>`,
  );
}

export const darkPage = () =>
  shell(
    "Dark Page",
    `<main><article><h1>After Dark</h1>${[1, 2, 3].map((p) => `<p id="p${p}">${para(p)}</p>`).join("")}</article></main>`,
    "body{background:#111418;color:#e8eaed}",
  );

export const listsPage = () =>
  shell(
    "Lists And Tables",
    `<main><article><h1>Lists</h1>
<p id="intro">${sentence(1, 1)}</p>
<ol><li>OL first step reads like this.</li><li>OL second step reads like this.</li></ol>
<table><caption>CAPTION of the table</caption><tr><th>Name</th><th>Role</th></tr>
<tr><td>TD Ada writes the first program.</td><td>TD Engineer who works alone.</td></tr></table>
</article></main>`,
  );

export const selectPage = () =>
  shell(
    "Selection Targets",
    `<main><article><h1>Select</h1>
<p id="a">${para(1)}</p><p id="b">${para(2)}</p><p id="c">${para(3)}</p></article></main>`,
  );

export function bigPage(n = 5000): string {
  const body = Array.from({ length: n }, (_, i) => `<p>${sentence(i + 1, 1)} ${sentence(i + 1, 2)}</p>`).join("");
  return shell("Five Thousand Paragraphs", `<main><article><h1>Big</h1>${body}</article></main>`);
}

/** Stand-in for pages the extension must leave alone; the popup is the thing under test. */
export const blank = () => shell("Blank", `<main><p>blank</p></main>`);
