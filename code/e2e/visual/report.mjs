// Builds designs/built (shots, design crops, review.html, coverage.json) and docs/visual-fidelity.md from out/results.json.
// usage: node report.mjs   (after `pnpm exec vp test run`)
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../../..");
const OUT = join(here, "out");
const BUILT = join(ROOT, "designs/built");
const results = JSON.parse(readFileSync(join(OUT, "results.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(ROOT, "designs/next/manifest.json"), "utf8"));
const notes = existsSync(join(here, "notes.json")) ? JSON.parse(readFileSync(join(here, "notes.json"), "utf8")) : {};

const GROUPS = [
  ["Extension popup", "Toolbar popup states: idle, selection, preparing, playing, paused, pickers, finished, engine asleep and waking, and every problem state."],
  [
    "On-page reading",
    "What the content script draws on the page: selection bubble, paragraph gutter, the Lumen read-aloud pill in every state, popovers, toast, back-to-current and the edge launcher.",
  ],
  ["Reader view", "The reader overlay in paper and light with the reading panel (font, size, width, theme, highlight sentence)."],
  ["Options", "The extension options page: connection, launcher, voice and speed, highlighting, reader view, shortcuts, sites, and the narrow layout."],
  ["Side panel (queue)", "The side panel: now playing, page outline and the queue."],
  ["Desktop setup", "First-run setup window: welcome, voice engine, download, connect browser, done."],
  ["Desktop home and shell", "The Lumen shell of the desktop app: title bar, sidebar, home, command palette, narrow rail, new reading, notifications."],
  ["Desktop library", "The library: empty, with readings, search results, no results and the delete confirmation."],
  ["Desktop reader and export", "The reader playing and paused, the outline with bookmarks, the voice panel and popover, and the export dialog."],
  ["Voices and engines", "Voices library and the engines pages in their states (ready, unloaded, loading, error)."],
  ["Desktop settings", "Settings pages: general, voice and playback, shortcuts, notifications, memory (ready and unloaded), storage, browser integration, about."],
  ["Tray, notifications and system states", "Mini player, tray panel and quit confirmation. The native tray menu, tray icons and OS toasts cannot be screenshotted (see Not captured)."],
  ["Errors and edge states", "Engine error and engine asleep on the desktop home."],
].map(([name, blurb], i) => ({ key: String(i + 1), n: i + 1, name, blurb }));
const gkey = Object.fromEntries(GROUPS.map((g) => [g.name, g.key]));

const MATCH = 4,
  MINOR = 10;
const verdictOf = (r) => (r.diffPct == null ? null : r.diffPct <= MATCH ? "match" : r.diffPct <= MINOR ? "minor" : "major");

// ---- built folder
rmSync(BUILT, { recursive: true, force: true });
mkdirSync(join(BUILT, "shots"), { recursive: true });
mkdirSync(join(BUILT, "design"), { recursive: true });
const cards = new Map();
let shots = 0;
for (const r of results) {
  const src = join(OUT, "built", r.file);
  if (!existsSync(src)) continue;
  copyFileSync(src, join(BUILT, "shots", r.file));
  shots++;
  const key = `${r.id}|${r.state}`;
  let c = cards.get(key);
  if (!c) cards.set(key, (c = { key, id: r.id, state: r.state, title: r.title, group: gkey[r.group], groupName: r.group, shots: {}, res: {} }));
  c.shots[r.theme] = r.file;
  const k = `${r.id}-${r.state}-${r.theme}`;
  const dfile = `${k}.png`;
  const hasDesign = r.diffPct != null && existsSync(join(OUT, "design", dfile));
  if (hasDesign) copyFileSync(join(OUT, "design", dfile), join(BUILT, "design", dfile));
  const n = notes[k] ?? notes[`${r.id}-${r.state}`] ?? {};
  if (r.diffPct != null) c.res[r.theme] = { pct: r.diffPct, verdict: n.verdict ?? verdictOf(r), reason: n.reason ?? r.note ?? "", design: hasDesign ? dfile : null };
  else if (r.note === "product-only") c.res[r.theme] = { pct: null, verdict: "only", reason: n.reason ?? "Product state without a design frame.", design: null };
  else c.res[r.theme] = { pct: null, verdict: "twin", reason: "The design set has no frame for this screen.", design: null };
}
const order = (a, b) => Number(a.group) - Number(b.group);
const list = [...cards.values()].sort(order); // stable: capture order inside a group

// ---- coverage: which design frames were not captured
const frames = manifest.pages.flatMap((p) => p.sections.flatMap((s) => s.frames.map((f) => ({ ...f, page: p.name, section: s.title }))));
const seen = new Set();
const uniq = frames.filter((f) => (seen.has(f.id) ? false : seen.add(f.id)));
const capturedLight = new Set(results.filter((r) => r.theme === "light" && r.diffPct != null).map((r) => r.id));
const capturedAny = new Set(results.map((r) => r.id));
const reasons = JSON.parse(readFileSync(join(here, "missing-reasons.json"), "utf8"));
const reasonFor = (f) => {
  if (reasons.byId[f.id]) return reasons.byId[f.id];
  for (const [re, why] of reasons.byPattern) if (new RegExp(re).test(f.id)) return why;
  if (/SUPERSEDED/.test(f.tag ?? "")) return `${f.tag.replace(/[()]/g, "")}; the newer frame is captured instead.`;
  if (/LATER/.test(f.tag ?? "")) return reasons.fallback;
  return reasons.fallback;
};
const missing = [];
for (const f of uniq) {
  const light = f.id.endsWith("-L");
  const base = light ? f.id.slice(0, -2) : f.id;
  if (capturedLight.has(base)) continue;
  missing.push({
    id: f.id,
    title: `${f.title} (${f.page})`,
    reason: light ? `Light twin of ${base}: ${capturedAny.has(base) ? "the product capture has no matching light run" : reasonFor({ ...f, id: base })}` : reasonFor(f),
  });
}

const counts = { shots, cards: list.length, frames: uniq.length, missing: missing.length };
const data = { groups: GROUPS, cards: list, missing, counts };
const html = readFileSync(join(here, "review.template.html"), "utf8").replace("__DATA__", JSON.stringify(data).replace(/</g, "\\u003c"));
writeFileSync(join(BUILT, "review.html"), html);
writeFileSync(
  join(BUILT, "coverage.json"),
  JSON.stringify(
    {
      counts,
      perGroup: GROUPS.map((g) => ({
        group: g.name,
        screens: list.filter((c) => c.group === g.key).length,
        images: list.filter((c) => c.group === g.key).reduce((n, c) => n + Object.keys(c.shots).length, 0),
      })),
      missing,
    },
    null,
    1,
  ),
);

// ---- docs/visual-fidelity.md
const tally = { match: 0, minor: 0, major: 0, known: 0 };
for (const c of list) for (const r of Object.values(c.res)) if (r.pct != null) tally[r.verdict] = (tally[r.verdict] ?? 0) + 1;
const rows = [];
for (const c of list)
  for (const t of ["light"]) {
    const r = c.res[t];
    if (r && r.pct != null)
      rows.push(`| ${c.id} | ${c.title} | ${t} | ${{ match: "match", minor: "minor drift", major: "drift", known: "known difference" }[r.verdict]} | ${r.pct ?? "-"} | ${r.reason || ""} |`);
  }
const intro = readFileSync(join(here, "fidelity-intro.md"), "utf8");
const perGroup = GROUPS.map((g) => `| ${g.name} | ${list.filter((c) => c.group === g.key).length} | ${list.filter((c) => c.group === g.key).reduce((n, c) => n + Object.keys(c.shots).length, 0)} |`);
const md = `${intro.replace("{{COUNTS}}", `**Counts:** ${counts.cards} screens captured (${counts.shots} images, light) against ${counts.frames} design frames. Diffed against a design frame: ${rows.length} images: ${tally.match} match, ${tally.minor} minor drift, ${tally.major} drift, ${tally.known} known difference. ${counts.missing} design frames could not be captured (list below).`)}

## Screens captured per feature group

| Group | Screens | Images |
|---|---|---|
${perGroup.join("\n")}

## Results

Diff % is pixelmatch (threshold 0.2) of the built screenshot against the design crop at 1x, as a share of the compared area. match <= ${MATCH} %, minor drift <= ${MINOR} %, drift above that.

| ID | Screen | Theme | Result | Diff % | Reason |
|---|---|---|---|---|---|
${rows.join("\n")}

## Not captured

| ID | Design screen | Reason |
|---|---|---|
${missing.map((m) => `| ${m.id} | ${m.title} | ${m.reason} |`).join("\n")}
`;
writeFileSync(join(ROOT, "docs/visual-fidelity.md"), md);
console.log(JSON.stringify({ counts, tally, groups: GROUPS.map((g) => [g.name, list.filter((c) => c.group === g.key).length]) }));
