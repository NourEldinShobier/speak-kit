// Builds designs/review.html from designs/manifest.json (data inlined so it opens from file://).
import { readFileSync, writeFileSync } from "fs";
const APP = process.env.APP_NAME ?? "SpeakKit";
const D = process.env.DIR ?? "D:/workspaces/speak-it/designs"; // DIR=.../designs/next builds the staging review
const raw = JSON.parse(readFileSync(`${D}/manifest.json`, "utf8"));
// feature rows = numbered sections of the design file, stacked in file order; each row is a horizontal strip
const m = {
  groups: Object.fromEntries(raw.features.map((f: any) => [f.key, { name: `${f.page}: ${f.n} · ${f.title}`, blurb: f.cover }])),
  screens: raw.screens.map((s: any) => ({ id: s.id, group: s.feature, title: s.title, note: s.rule, dark: s.theme === "dark", tag: s.tag, w: s.w, h: s.h })),
};
const html = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__APP__ design review</title>
<style>
:root{--bg:#F3F3F6;--surface:#fff;--s2:#EBEBEE;--bd:#E2E2E5;--tx:#1E1F20;--tx2:#5E574E;--tx3:#8F887D;--ac:#0069CC;--acs:#DCE9F7;--ok:#1A7F4B;--oks:#DFF5EA;--wn:#B35C00;--wns:#FDF0D5;--er:#C62828;--ers:#FDE4E1;--sh:0 1px 3px #0001,0 6px 16px #0000000d}
:root[data-theme=dark]{--bg:#191A1B;--surface:#1E1F20;--s2:#252627;--bd:#2A2B2C;--tx:#E6E6E6;--tx2:#B9B2A7;--tx3:#857E73;--acs:#124368;--oks:#14382B;--wns:#3A2D12;--ers:#40201C;--ac:#0078D4;--ok:#4CC38A;--wn:#F5A524;--er:#F2555A;--sh:0 1px 3px #0006}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:120px}
body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.45 Inter,system-ui,-apple-system,Segoe UI,sans-serif}
header.top{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--bd)}
.bar{display:flex;gap:16px;align-items:center;padding:12px 24px;flex-wrap:wrap}
h1{font-size:18px;margin:0;font-weight:700;letter-spacing:-.01em}
.sub{color:var(--tx3);font-size:12.5px}
.stats{display:flex;gap:8px;margin-left:auto;flex-wrap:wrap}
.pill{display:inline-flex;gap:6px;align-items:center;border:1px solid var(--bd);background:var(--surface);border-radius:999px;padding:4px 11px;font-size:12.5px;font-weight:600;color:var(--tx2);cursor:pointer;font-family:inherit}
.pill b{color:var(--tx)}.pill.on{background:var(--tx);color:var(--bg);border-color:var(--tx)}.pill.on b{color:var(--bg)}
.btn{border:1px solid var(--bd);background:var(--surface);color:var(--tx);border-radius:9px;padding:6px 12px;font:600 12.5px inherit;font-family:inherit;cursor:pointer}
.btn:hover{border-color:var(--tx3)}.btn.pri{background:var(--ac);border-color:var(--ac);color:#fff}
nav.toc{display:flex;gap:6px;padding:0 24px 12px;overflow-x:auto}
nav.toc a{white-space:nowrap;text-decoration:none;color:var(--tx2);font-size:12.5px;font-weight:600;padding:5px 10px;border-radius:8px;border:1px solid transparent}
nav.toc a:hover{background:var(--s2)}nav.toc a span{color:var(--tx3);font-weight:500;margin-left:4px}
main{padding:8px 0 80px}
section.feat{padding:28px 0 6px}
.fh{padding:0 24px;display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap}
.fh .k{min-width:44px;padding:0 6px;height:34px;border-radius:10px;background:var(--acs);color:var(--ac);display:grid;place-items:center;font-weight:800}
.fh h2{margin:0;font-size:20px;letter-spacing:-.01em}.fh p{margin:2px 0 0;color:var(--tx2);max-width:760px}
.fh .grow{flex:1;min-width:260px}
.row{display:flex;gap:18px;overflow-x:auto;padding:16px 24px 18px;scroll-snap-type:x proximity}
.row::-webkit-scrollbar{height:10px}.row::-webkit-scrollbar-thumb{background:var(--bd);border-radius:6px}
.card{flex:0 0 440px;scroll-snap-align:start;background:var(--surface);border:1px solid var(--bd);border-radius:14px;box-shadow:var(--sh);display:flex;flex-direction:column;overflow:hidden}
.card[data-s=approved]{border-color:var(--ok)}.card[data-s=change]{border-color:var(--wn)}.card[data-s=rejected]{border-color:var(--er)}
.thumb{height:280px;background:var(--s2);display:grid;place-items:center;cursor:zoom-in;border-bottom:1px solid var(--bd);position:relative}
.thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}
.meta{padding:12px 14px 6px}
.id{display:inline-block;font:700 11px ui-monospace,Consolas,monospace;background:var(--s2);color:var(--tx2);border-radius:6px;padding:2px 7px;margin-right:6px}
.dk{font-size:10.5px;font-weight:700;color:var(--tx3);border:1px solid var(--bd);border-radius:6px;padding:1px 6px;margin-left:4px}
.card h3{font-size:14.5px;margin:6px 0 2px}.card p{margin:0;color:var(--tx2);font-size:12.5px;min-height:36px}
.acts{display:flex;gap:6px;padding:10px 14px 12px}
.acts button{flex:1;border:1px solid var(--bd);background:var(--surface);color:var(--tx2);border-radius:8px;padding:7px 4px;font:600 12.5px inherit;font-family:inherit;cursor:pointer}
.acts button:hover{background:var(--s2)}
.card[data-s=approved] .a{background:var(--oks);color:var(--ok);border-color:var(--ok)}
.card[data-s=change] .c{background:var(--wns);color:var(--wn);border-color:var(--wn)}
.card[data-s=rejected] .r{background:var(--ers);color:var(--er);border-color:var(--er)}
textarea{display:none;margin:0 14px 12px;width:calc(100% - 28px);border:1px solid var(--bd);border-radius:8px;background:var(--bg);color:var(--tx);padding:8px;font:13px inherit;font-family:inherit;resize:vertical;min-height:54px}
.card[data-s=change] textarea,.card[data-s=rejected] textarea,textarea.has{display:block}
.hide{display:none!important}
#lb{position:fixed;inset:0;background:#000d;z-index:50;display:none;flex-direction:column;align-items:center;justify-content:center;padding:20px;gap:12px}
#lb.on{display:flex}#lb img{max-width:96vw;max-height:78vh;border-radius:8px;box-shadow:0 20px 60px #000}
#lb .cap{color:#fff;text-align:center;max-width:900px}#lb .cap b{font-size:16px}#lb .cap div{opacity:.8;font-size:13px}
#lb .ctl{display:flex;gap:8px}#lb .btn{background:#ffffff1f;color:#fff;border-color:#ffffff33}
.hint{color:var(--tx3);font-size:12px}
@media(max-width:700px){.card{flex-basis:86vw}.thumb{height:220px}}
</style>
</head>
<body>
<header class="top">
  <div class="bar">
    <div><h1>__APP__ design review</h1><div class="sub">__COUNT__ screens &middot; __GROUPS__ features &middot; click an image to enlarge &middot; keys in viewer: &larr; &rarr; move, A approve, C change, R reject</div></div>
    <div class="stats" id="stats"></div>
    <button class="btn" id="theme">Theme</button>
    <button class="btn" id="copy">Copy summary</button>
    <button class="btn pri" id="export">Export decisions</button>
  </div>
  <nav class="toc" id="toc"></nav>
</header>
<main id="main"></main>
<div id="lb"><img id="lbimg" alt=""><div class="cap"><b id="lbt"></b><div id="lbn"></div></div><div class="ctl"><button class="btn" data-k="prev">← Prev</button><button class="btn" data-k="a">Approve</button><button class="btn" data-k="c">Change</button><button class="btn" data-k="r">Reject</button><button class="btn" data-k="next">Next →</button><button class="btn" data-k="x">Close</button></div></div>
<script>
const DATA = __DATA__;
const KEY = "design-review-v2-__SLUG__";
let state = {}; try { state = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };
const S = DATA.screens, G = DATA.groups;
const byGroup = {}; S.forEach(s => (byGroup[s.group] ??= []).push(s));
const groups = Object.keys(G).filter(k => byGroup[k]);
let filter = "all";
const get = id => state[id] || { s: "pending", n: "" };
const set = (id, p) => { state[id] = { ...get(id), ...p }; save(); };
const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function render() {
  const main = document.getElementById("main"); main.innerHTML = "";
  groups.forEach(k => {
    const sec = document.createElement("section"); sec.className = "feat"; sec.id = "g" + k;
    sec.innerHTML = '<div class="fh"><div class="k">' + k + '</div><div class="grow"><h2>' + esc(G[k].name) + '</h2><p>' + esc(G[k].blurb) + '</p></div><button class="btn" data-all="' + k + '">Approve all ' + byGroup[k].length + '</button></div><div class="row"></div>';
    const row = sec.querySelector(".row");
    byGroup[k].forEach(s => {
      const st = get(s.id);
      const c = document.createElement("article"); c.className = "card"; c.dataset.s = st.s; c.dataset.id = s.id;
      if (filter !== "all" && st.s !== filter) c.classList.add("hide");
      c.innerHTML = '<div class="thumb" data-zoom="' + s.id + '"><img loading="lazy" src="screens/' + s.id + '.png" alt="' + esc(s.title) + '"></div><div class="meta"><span class="id">' + s.id + '</span>' + (s.dark ? '<span class="dk">DARK</span>' : '<span class="dk">LIGHT</span>') + (s.tag ? '<span class="dk">' + esc(s.tag) + '</span>' : "") + '<h3>' + esc(s.title) + '</h3><p>' + esc(s.note) + '</p></div><div class="acts"><button class="a" data-set="approved">✓ Approve</button><button class="c" data-set="change">✎ Change</button><button class="r" data-set="rejected">✕ Reject</button></div><textarea placeholder="What should change?" class="' + (st.n ? "has" : "") + '">' + esc(st.n) + '</textarea>';
      row.appendChild(c);
    });
    main.appendChild(sec);
  });
  stats();
}
function stats() {
  const n = { pending: 0, approved: 0, change: 0, rejected: 0 }; S.forEach(s => n[get(s.id).s]++);
  const el = document.getElementById("stats");
  const mk = (f, l, v) => '<button class="pill ' + (filter === f ? "on" : "") + '" data-f="' + f + '">' + l + ' <b>' + v + '</b></button>';
  el.innerHTML = mk("all", "All", S.length) + mk("pending", "Pending", n.pending) + mk("approved", "Approved", n.approved) + mk("change", "Needs changes", n.change) + mk("rejected", "Rejected", n.rejected);
  document.getElementById("toc").innerHTML = groups.map(k => { const a = byGroup[k].filter(s => get(s.id).s === "approved").length; return '<a href="#g' + k + '">' + k + " · " + esc(G[k].name.replace(/^(Desktop app|Chrome extension): /, "")) + '<span>' + a + "/" + byGroup[k].length + "</span></a>"; }).join("");
}
function apply(id, s) {
  set(id, { s });
  const c = document.querySelector('.card[data-id="' + id + '"]'); if (c) { c.dataset.s = s; if (filter !== "all" && s !== filter) c.classList.add("hide"); }
  stats(); if (lbIdx >= 0) lbShow();
}
document.addEventListener("click", e => {
  const t = e.target.closest("[data-set],[data-zoom],[data-f],[data-all]"); if (!t) return;
  if (t.dataset.set) apply(t.closest(".card").dataset.id, get(t.closest(".card").dataset.id).s === t.dataset.set ? "pending" : t.dataset.set);
  else if (t.dataset.zoom) { lbIdx = S.findIndex(s => s.id === t.dataset.zoom); lbShow(); }
  else if (t.dataset.f) { filter = t.dataset.f; render(); }
  else if (t.dataset.all) { byGroup[t.dataset.all].forEach(s => set(s.id, { s: "approved" })); render(); }
});
document.addEventListener("input", e => { if (e.target.tagName === "TEXTAREA") set(e.target.closest(".card").dataset.id, { n: e.target.value }); });
// lightbox
let lbIdx = -1; const lb = document.getElementById("lb");
function lbShow() { const s = S[lbIdx]; if (!s) return; lb.classList.add("on"); document.getElementById("lbimg").src = "screens/" + s.id + ".png"; document.getElementById("lbt").textContent = s.id + " · " + s.title; const st = get(s.id).s; document.getElementById("lbn").textContent = s.note + "   [" + st + "]"; }
function lbMove(d) { lbIdx = (lbIdx + d + S.length) % S.length; lbShow(); }
lb.addEventListener("click", e => { const k = e.target.dataset.k; if (!k) { if (e.target === lb) { lbIdx = -1; lb.classList.remove("on"); } return; } if (k === "x") { lbIdx = -1; lb.classList.remove("on"); } else if (k === "prev") lbMove(-1); else if (k === "next") lbMove(1); else apply(S[lbIdx].id, { a: "approved", c: "change", r: "rejected" }[k]); });
document.addEventListener("keydown", e => { if (lbIdx < 0 || e.target.tagName === "TEXTAREA") return; if (e.key === "ArrowRight") lbMove(1); else if (e.key === "ArrowLeft") lbMove(-1); else if (e.key === "Escape") { lbIdx = -1; lb.classList.remove("on"); } else if ("acr".includes(e.key.toLowerCase())) apply(S[lbIdx].id, { a: "approved", c: "change", r: "rejected" }[e.key.toLowerCase()]); });
// export
const decisions = () => S.map(s => ({ id: s.id, feature: G[s.group].name, title: s.title, g: s.group, status: get(s.id).s, comment: get(s.id).n }));
document.getElementById("export").onclick = () => { const b = new Blob([JSON.stringify(decisions(), null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "design-decisions.json"; a.click(); };
document.getElementById("copy").onclick = async () => { const d = decisions(); const L = []; groups.forEach(k => { const x = d.filter(r => r.g === k && r.status !== "approved" && r.status !== "pending"); if (x.length) { L.push("## " + G[k].name); x.forEach(r => L.push("- " + r.id + " " + r.title + " — " + r.status + (r.comment ? ": " + r.comment : ""))); } }); const txt = L.join("\n") || "No change or reject notes yet."; try { await navigator.clipboard.writeText(txt); } catch (e) { prompt("Copy:", txt); } document.getElementById("copy").textContent = "Copied"; setTimeout(() => document.getElementById("copy").textContent = "Copy summary", 1200); };
const root = document.documentElement; const th = (() => { try { return localStorage.getItem(KEY + "-theme"); } catch (e) { return null; } })();
if (th) root.dataset.theme = th; else if (matchMedia("(prefers-color-scheme: dark)").matches) root.dataset.theme = "dark";
document.getElementById("theme").onclick = () => { root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark"; try { localStorage.setItem(KEY + "-theme", root.dataset.theme); } catch (e) {} };
render();
</script>
</body>
</html>`;
const out = html
  .replaceAll("__APP__", APP)
  .replace("__COUNT__", String(m.screens.length))
  .replace("__GROUPS__", String(Object.keys(m.groups).length))
  .replace("__SLUG__", APP.toLowerCase().replace(/\W+/g, "-"))
  .replace("__DATA__", JSON.stringify(m));
writeFileSync(`${D}/review.html`, out);
console.log("review.html", out.length);
