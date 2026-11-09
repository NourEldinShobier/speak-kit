// LIVE check of voice chat against the real OpenAI Realtime API. Not a test file and not run in CI: it costs real money (one short conversation).
//
//   node e2e/live/voice-chat.live.mjs [--no-build]      (from code/)
//
// What it does: builds the test extension, starts a stand-in for the Speak Kit app that mints a client secret with the real key (the
// job of the desktop app; the extension never sees the key), asks a spoken question through Chromium's fake microphone, and checks that
// the model connected, answered out loud about a fixed article, that mute stops audio being sent and that ending releases the microphone.
// The key is read from a file outside the repo (SPEAKKIT_LIVE_KEY_FILE, default tmp/.secrets/openai-test-key) and is never printed.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const code = resolve(here, "../..");
const dist = resolve(code, "apps/extension/dist-e2e");
const work = resolve(here, "../../../../../voice-live"); // tmp/voice-live, outside the repo
const keyFile = process.env.SPEAKKIT_LIVE_KEY_FILE ?? resolve(here, "../../../../../.secrets/openai-test-key");
const KEY = (process.env.OPENAI_API_KEY ||= readFileSync(keyFile, "utf8").trim());
const QUESTION = "Who runs the morning ferry, and what color is it?";
const redact = (s) => String(s).split(KEY).join("[key]");
const log = (...a) => console.log(...a.map(redact));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const ARTICLE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>The Harbor Light Bulletin</title></head><body><main><article>
<h1>The Harbor Light Bulletin</h1>
<p>Captain Imara Okonkwo has run the morning ferry between Saltmere and Greywick for twenty-one years. She knows every sandbank on the crossing.</p>
<p>The crossing takes forty minutes, and the ferry carries sixty passengers and eight cars. Last winter the whole ferry was repainted bright orange, so that fishing boats can see it in the fog.</p>
<p>Next spring the town council will vote on a second ferry, which would run in the afternoon.</p>
</article></main></body></html>`;

// ---- the spoken question: Windows speech synthesis, or the OpenAI speech endpoint when that is not available (once, then cached) ----
function wavParts(buf) {
  let fmt, data;
  for (let i = 12; i + 8 <= buf.length;) {
    const id = buf.toString("ascii", i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    if (id === "fmt ") fmt = buf.subarray(i + 8, i + 8 + size);
    if (id === "data") data = buf.subarray(i + 8, Math.min(buf.length, i + 8 + size));
    i += 8 + size + (size % 2);
  }
  return { fmt, data };
}
/** The question after 5 s of silence (the conversation connects meanwhile) and 60 s of silence after it. */
function padded(buf) {
  const { fmt, data } = wavParts(buf);
  const rate = fmt.readUInt32LE(4);
  const bytesPerSecond = rate * fmt.readUInt16LE(12);
  const pcm = Buffer.concat([Buffer.alloc(bytesPerSecond * 5), data, Buffer.alloc(bytesPerSecond * 60)]);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + pcm.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  fmt.copy(head, 20, 0, 16);
  head.write("data", 36);
  head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}
async function questionWav() {
  mkdirSync(work, { recursive: true });
  const out = join(work, "question.wav");
  if (existsSync(out)) return out;
  const raw = join(work, "question-raw.wav");
  if (process.platform === "win32") {
    const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $f = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(24000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono); $s.SetOutputToWaveFile('${raw}', $f); $s.Speak('${QUESTION}'); $s.Dispose()`;
    spawnSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "ignore" });
  }
  if (!existsSync(raw)) {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "alloy", input: QUESTION, response_format: "wav" }),
    });
    if (!res.ok) throw new Error(`speech request failed: HTTP ${res.status}`);
    writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
  }
  writeFileSync(out, padded(readFileSync(raw)));
  return out;
}

// ---- stand-in for the Speak Kit app: mints a real client secret per request, like the desktop app does ----
const TOKEN = `live-token-${Math.random().toString(16).slice(2)}`;
let mints = 0;
async function mint() {
  const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expires_after: { anchor: "created_at", seconds: 300 }, session: { type: "realtime", model: "gpt-realtime-2.1", audio: { output: { voice: "marin" } } } }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { status: res.status, body: { code: { 401: "key-rejected", 429: "no-credit" }[res.status] ?? "unavailable" } };
  mints++;
  return { status: 200, body: { clientSecret: body.value, expiresAt: body.expires_at, model: "gpt-realtime-2.1", voice: "marin" } };
}
const app = createServer(async (req, res) => {
  const send = (status, body) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
  const path = (req.url ?? "").split("?")[0];
  if (path === "/v1/health") return send(200, { app: "speakkit", version: "live", apiVersion: 1, engine: { id: "kokoro", state: "ready" } });
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, { error: { code: "token-rejected", message: "no" } });
  if (path === "/v1/auth/check") return void res.writeHead(204).end();
  if (path === "/v1/voice-chat/status") return send(200, { hasKey: true });
  if (path === "/v1/voice-chat/session") {
    const m = await mint();
    return send(m.status, m.body);
  }
  return send(404, { error: { code: "not-found", message: "no" } });
});
const site = createServer((req, res) => res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(ARTICLE));
const listen = (s) => new Promise((r) => s.listen(0, "127.0.0.1", () => r(s.address().port)));

if (!process.argv.includes("--no-build")) {
  const b = spawnSync("pnpm", ["exec", "vp", "build", "--outDir", "dist-e2e"], {
    cwd: resolve(code, "apps/extension"),
    shell: process.platform === "win32",
    env: { ...process.env, SPEAKKIT_TEST: "1" },
    stdio: "ignore",
  });
  if (b.status) throw new Error("extension build failed");
}
const wav = await questionWav();
const appPort = await listen(app);
const sitePort = await listen(site);
const profile = mkdtempSync(join(tmpdir(), "speakkit-live-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: process.env.LIVE_HEADED !== "1",
  args: [
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
    "--no-first-run",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    `--use-file-for-fake-audio-capture=${wav}%noloop`,
  ],
});
try {
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  const extId = new URL(sw.url()).host;
  for (let i = 0; i < 100 && !(await sw.evaluate(async () => (await chrome.storage.sync.get("speakkit.settingsVersion"))["speakkit.settingsVersion"])); i++)
    await new Promise((r) => setTimeout(r, 100));
  await sw.evaluate(
    async ([port, token]) => {
      const KEY = "speakkit.settings";
      const cur = (await chrome.storage.sync.get(KEY))[KEY] ?? {};
      await chrome.storage.sync.set({ [KEY]: { ...cur, port } });
      await chrome.storage.local.set({ "speakkit.token": token, "speakkit.voiceConsent": true });
    },
    [appPort, TOKEN],
  );
  await new Promise((r) => setTimeout(r, 300));

  const page = await ctx.newPage();
  await page.goto(`http://localhost:${sitePort}/`);
  const sk = (name) => page.locator(`[data-sk="${name}"]`);
  const phase = () => sk("voice-pill").getAttribute("data-phase");
  const waitPhase = async (want, ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const p = await phase().catch(() => null);
      if (want.includes(p)) return p;
      await page.waitForTimeout(100);
    }
    return null;
  };
  // the offscreen document hosts the session; its test hook exposes what the model said and the microphone state
  const hook = async (expr) => {
    const port = Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]);
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const t = list.find((x) => x.url.endsWith("/offscreen.html"));
    if (!t) return undefined;
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
    const out = await new Promise((resolve) => {
      ws.onmessage = (m) => {
        const d = JSON.parse(String(m.data));
        if (d.id === 1) resolve(d.result?.result?.value);
      };
      ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: expr, returnByValue: true, awaitPromise: true } }));
    });
    ws.close();
    return out;
  };

  await page.waitForSelector('[data-sk="launcher-tab"]', { timeout: 15000 });
  await sk("launcher-tab").hover();
  await sk("launcher-talk").click();

  const first = await waitPhase(["idle", "listening", "thinking", "speaking"], 30000);
  check("connected to gpt-realtime-2.1 over WebRTC", !!first, `phase ${first}`);
  check("one client secret was minted, and the page never saw it", mints === 1 && !(await page.evaluate(() => document.documentElement.outerHTML)).includes("ek_"), `${mints} mint`);

  // the question plays after 5 s of silence; the answer follows
  const heard = await waitPhase(["thinking", "speaking"], 25000);
  const spoke = await waitPhase(["speaking"], 25000);
  check("the model answered out loud", !!heard && !!spoke, `phases seen: ${heard}, ${spoke}`);
  const done = await (async () => {
    const end = Date.now() + 40000;
    while (Date.now() < end) {
      if ((await phase()) === "idle" && (await hook("JSON.stringify(window.__speakkitVoice.trace()?.events ?? [])")).includes("output_audio_buffer.stopped")) return true;
      await page.waitForTimeout(250);
    }
    return false;
  })();
  const trace = JSON.parse((await hook("JSON.stringify(window.__speakkitVoice.trace())")) ?? "{}");
  log(`model said: ${String(trace.transcript ?? "").trim()}`);
  if (trace.errors?.length) log(`error events: ${trace.errors.join(", ")}`);
  check("the reply finished and the output level rose above the threshold", done && trace.outPeak > 0.05, `peak ${trace.outPeak}`);
  check("the reply is about the article (Captain Imara Okonkwo, orange)", /imara|okonkwo/i.test(trace.transcript ?? "") && /orange/i.test(trace.transcript ?? ""));

  // mute: the microphone track is detached, so no audio packets leave the browser
  const sent = async () => Number(await hook("window.__speakkitVoice.bytesSent()"));
  const live0 = Number(await hook("window.__speakkitVoice.micLive()"));
  const a = await sent();
  await page.waitForTimeout(1500);
  const unmuted = (await sent()) - a;
  await sk("voice-mute").click();
  await page.waitForTimeout(400);
  const b = await sent();
  await page.waitForTimeout(1500);
  const muted = (await sent()) - b;
  check("mute stops audio being sent", unmuted > 300 && muted < 100, `unmuted ${unmuted} bytes, muted ${muted} bytes in 1.5 s`);

  // end: the peer connection closes and the document holding the microphone goes away
  await sk("voice-end").click();
  let gone = false;
  for (let i = 0; i < 40 && !gone; i++) {
    gone = (await sw.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length)) === 0;
    if (!gone) await page.waitForTimeout(150);
  }
  check("end released the microphone", live0 > 0 && gone, `${live0} live track(s) before, document gone: ${gone}`);
  void extId;
} catch (e) {
  log(`FAIL  unexpected error: ${e?.message ?? e}`);
  results.push(false);
} finally {
  await ctx.close().catch(() => {});
  app.close();
  site.close();
  rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
}
log(results.every(Boolean) && results.length ? "LIVE CHECK PASSED" : "LIVE CHECK FAILED");
process.exit(results.every(Boolean) && results.length ? 0 : 1);
