// Generates the Chrome Web Store and Edge Add-ons graphics from the real product: the visual-capture scenarios (code/e2e/visual) render the
// real built extension against the fake engine, and this file frames their output at the store sizes.
// Needs the test build:  SPEAKKIT_TEST=1 pnpm exec vp build --outDir dist-visual   (from apps/extension)
// Run:                   pnpm exec vp test run --config store/vite.config.ts
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { optionsScenarios, panelScenarios, popupScenarios, cur } from "../../../e2e/visual/scenarios";
import { pageScenarios } from "../../../e2e/visual/pages";
import { launchExt, pw, startEnv } from "../../../e2e/visual/support";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../../../../docs/store/assets");
const ICON = resolve(HERE, "../public/icons/128.png");
const ACCENT = "#2457F5";
const b64 = (p) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;
const sizeOf = (p) => {
  const b = readFileSync(p);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

let env;
let ext;
let browser;
const shots = {};
beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  env = await startEnv();
  ext = await launchExt();
  browser = await pw.chromium.launch({ channel: "chromium" });
});
afterAll(async () => {
  await browser?.close();
  await ext?.close();
  await env?.close();
});

/** Runs one visual scenario and returns the PNG it wrote. */
async function shotOf(all, id, state, dark) {
  const s = all.find((x) => x.id === id && x.state === state);
  if (!s) throw new Error(`no scenario ${id} ${state}`);
  Object.assign(cur, { id, state, dark });
  return s.run({ ext, env, dark });
}

/** Renders html at w x h and saves a PNG of exactly that size. */
async function render(html, w, h, file) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(OUT, file), type: "png", clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
}

const BASE = `*{box-sizing:border-box;margin:0}body{font-family:Inter,"Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden}`;
const shadow = "0 24px 60px rgba(20,30,70,.28),0 4px 14px rgba(20,30,70,.16)";

/** A full-window capture under a caption bar: 1280x800 = 82 px bar + the 1278x718 capture. */
const framed = (img, title, sub, dark) => `<style>${BASE}
body{width:1280px;height:800px;background:${dark ? "#17161A" : "#fff"};color:${dark ? "#E6E6E6" : "#202020"}}
.bar{height:82px;padding:0 32px;display:flex;align-items:center;gap:18px;border-bottom:1px solid ${dark ? "#2A2B2C" : "#E2E2E5"}}
.bar img{width:40px;height:40px}.t{font:700 26px/30px Inter,sans-serif}.s{font:400 15px/20px Inter,sans-serif;color:${dark ? "#A0A0A0" : "#606060"}}
.pic{display:block;margin-left:1px;width:1278px;height:718px}</style>
<div class="bar"><img src="${b64(ICON)}"><div><div class="t">${title}</div><div class="s">${sub}</div></div></div><img class="pic" src="${b64(img)}">`;

/** A narrow capture (popup, side panel) on a branded backdrop with the caption on the left. */
const spotlight = (img, w, h, scale, title, points) => `<style>${BASE}
body{width:1280px;height:800px;background:linear-gradient(135deg,#EAF0FF 0%,#C9D8FF 100%);color:#10204D;position:relative}
.cap{position:absolute;left:96px;top:0;bottom:0;width:500px;display:flex;flex-direction:column;justify-content:center;gap:22px}
.cap img{width:64px;height:64px}.t{font:800 46px/52px Inter,sans-serif;letter-spacing:-1px}
ul{list-style:none;padding:0;display:grid;gap:12px}li{font:500 21px/28px Inter,sans-serif;padding-left:28px;position:relative}
li:before{content:"";position:absolute;left:0;top:9px;width:11px;height:11px;border-radius:50%;background:${ACCENT}}
.pic{position:absolute;right:96px;top:${(800 - h * scale) / 2}px;width:${w * scale}px;height:${h * scale}px;border-radius:14px;box-shadow:${shadow};overflow:hidden;background:#fff}
.pic img{width:100%;height:100%;display:block}</style>
<div class="cap"><img src="${b64(ICON)}"><div class="t">${title}</div><ul>${points.map((p) => `<li>${p}</li>`).join("")}</ul></div>
<div class="pic"><img src="${b64(img)}"></div>`;

it("screenshots 1280x800", async () => {
  const popup = await shotOf(popupScenarios, "A4", "playing", false);
  const [w0, h0] = sizeOf(popup);
  await render(
    spotlight(popup, w0, h0, Math.min(1.4, 680 / h0), "Read any page aloud", ["One click from the toolbar", "A natural voice, generated on your computer", "Voice and speed at your fingertips"]),
    1280,
    800,
    "screenshot-1-popup.png",
  );

  const reading = await shotOf(pageScenarios, "B6", "reading-highlight", false);
  await render(framed(reading, "Follow along", "The sentence and word being read are highlighted, with a player on the page.", false), 1280, 800, "screenshot-2-dock-highlight.png");

  const launcher = await shotOf(pageScenarios, "B18", "launcher-open", true);
  await render(framed(launcher, "The edge launcher", "Stays out of the way until you hover it. Play, pause and skip from the side of the page.", true), 1280, 800, "screenshot-3-edge-launcher.png");

  const options = await shotOf(optionsScenarios, "C4", "voice-speed", false);
  await render(framed(options, "Your voice, your speed", "Voice, speed, highlighting, shortcuts and per-site rules.", false), 1280, 800, "screenshot-4-options.png");

  const panel = await shotOf(panelScenarios, "C9", "queue-outline", false);
  const [qw, qh] = sizeOf(panel);
  await render(
    spotlight(panel, qw, qh, 1.05, "Queue pages, jump around", ["Line up several articles", "Skip through the outline of the current page", "Everything stays on your computer"]),
    1280,
    800,
    "screenshot-5-queue.png",
  );
  Object.assign(shots, { popup, reading });
  expect(Object.keys(shots)).toHaveLength(2);
});

it("promo tiles and icon", async () => {
  copyFileSync(ICON, join(OUT, "icon-128.png"));
  const { popup } = shots;
  const [w0, h0] = sizeOf(popup);
  const tile = (w, h, css, extra = "") => `<style>${BASE}
body{width:${w}px;height:${h}px;background:linear-gradient(120deg,${ACCENT} 0%,#1636A8 100%);color:#fff;position:relative}
.logo{position:absolute;background:#fff;border-radius:22%;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 30px rgba(0,0,20,.3)}.logo img{width:78%;height:78%}
.n{position:absolute;font-weight:800;letter-spacing:-1px}.k{position:absolute;font-weight:500;opacity:.92}${css}</style>
<div class="logo"><img src="${b64(ICON)}"></div><div class="n">Speak Kit</div><div class="k">Natural voices.<br>On your computer.</div>${extra}`;
  await render(
    tile(440, 280, `.logo{left:36px;top:36px;width:92px;height:92px}.n{left:36px;top:150px;font-size:44px;line-height:48px}.k{left:36px;top:204px;font-size:20px;line-height:26px}`),
    440,
    280,
    "promo-small-440x280.png",
  );
  await render(
    tile(
      1400,
      560,
      `.logo{left:96px;top:96px;width:120px;height:120px}.n{left:96px;top:250px;font-size:84px;line-height:90px}.k{left:96px;top:356px;font-size:34px;line-height:44px}
.p1{position:absolute;right:150px;top:50px;width:${Math.round((460 * w0) / h0)}px;height:460px;border-radius:14px;box-shadow:${shadow};overflow:hidden;background:#fff}
.p1 img{width:100%;height:100%;display:block}`,
      `<div class="p1"><img src="${b64(popup)}"></div>`,
    ),
    1400,
    560,
    "promo-marquee-1400x560.png",
  );
});
