// LIVE check of voice chat against the real OpenAI Realtime API. Not a test file and not run in CI: it costs real money (one short conversation).
//
//   node e2e/live/voice-chat.live.mjs [--no-build] [--bad-key]      (from code/; --bad-key = an invalid key string, the error path, costs nothing)
//
// What it does: builds the test extension and starts the REAL local server (packages/server) with the REAL voice chat service of the desktop
// app (apps/desktop/src/main/voice-chat: the same code that tests the key and mints client secrets), reading the key from a file outside the
// repo into SPEAKKIT_LIVE_KEY. The extension is paired with the server's token, asks a spoken question through Chromium's fake microphone, and
// the script checks that the model connected, answered out loud about a fixed article, that the pill went connecting -> listening ->
// thinking -> speaking, that mute stops audio being sent and that ending releases the microphone. Screenshots go to tmp/voice-shots/live.
// LIVE_DEBUG=1 prints status codes and OpenAI error code/type fields only. The key and client secrets are never printed (output is redacted).
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
// Not OPENAI_API_KEY: an unrelated key in the shell environment must never stand in for the test key.
const BAD = process.argv.includes("--bad-key");
const KEY = (process.env.SPEAKKIT_LIVE_KEY = BAD ? `sk-invalid-${"0123456789abcdef".repeat(4)}` : readFileSync(keyFile, "utf8").trim());
const shots = resolve(here, "../../../../../voice-shots/live");
const QUESTION = "Who runs the morning ferry, and what color is it?";
const redact = (s) =>
  String(s)
    .split(KEY)
    .join("[key]")
    .replace(/ek_[A-Za-z0-9_-]+/g, "[secret]");
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
  mkdirSync(shots, { recursive: true });
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

// ---- the real local server with the desktop app's real voice chat service (only the key store is in memory, so the key never touches the disk) ----
await import("../../packages/server/register.mjs");
const { FakeEngine } = await import("../../packages/engine/src/index.ts");
const { createServer: createSpeakServer } = await import("../../packages/server/src/index.ts");
const { createVoiceChat } = await import("../../apps/desktop/src/main/voice-chat/service.ts");
const TOKEN = `live-token-${Math.random().toString(16).slice(2)}`;
const stats = { sessions: 0 };
const debug = (...a) => process.env.LIVE_DEBUG && log(...a);
/** fetch to OpenAI with a one-line report per call: method, path, status and the error code/type, never headers, bodies or messages. */
const openAiFetch = async (url, init) => {
  const res = await fetch(url, init);
  const path = new URL(url).pathname;
  if (path.endsWith("client_secrets") && res.ok) stats.sessions++;
  if (!res.ok) {
    const e = (
      await res
        .clone()
        .json()
        .catch(() => null)
    )?.error;
    debug(`openai ${init?.method ?? "GET"} ${path} -> ${res.status} code=${e?.code ?? "-"} type=${e?.type ?? "-"}`);
  } else debug(`openai ${init?.method ?? "GET"} ${path} -> ${res.status}`);
  return res;
};
let heldKey = KEY;
const store = { has: async () => !!heldKey, read: async () => heldKey, canEncrypt: () => true, save: async (k) => ((heldKey = k), true), remove: async () => void (heldKey = undefined) };
const chat = createVoiceChat({
  store,
  config: { voiceChatVoice: "marin" },
  saveConfig() {},
  log: { info() {}, warn: (...a) => debug("app warn:", ...a), error: (...a) => debug("app error:", ...a) },
  fetch: openAiFetch,
});
const dataDir = mkdtempSync(join(tmpdir(), "speakkit-live-app-"));
const speak = createSpeakServer({ engine: new FakeEngine(), dataDir, port: 0, version: "live", token: TOKEN, voiceChat: chat.server });
await speak.listen();
const appPort = speak.port;
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
const sitePort = await listen(site);
const profile = mkdtempSync(join(tmpdir(), "speakkit-live-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: process.env.LIVE_HEADED !== "1",
  args: [
    `--disable-extensions-except=${dist}`,
    `--load-extension=${dist}`,
    "--no-first-run",
    "--remote-debugging-port=0", // writes DevToolsActivePort into the profile: the script reads the offscreen document's test hooks through it
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
  if (process.env.LIVE_DEBUG) {
    page.on("console", (m) => log(`page ${m.type()}: ${m.text()}`));
    page.on("pageerror", (e) => log(`page error: ${e.message}`));
    sw.on("console", (m) => log(`worker ${m.type()}: ${m.text()}`));
  }
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
    const port = parseInt(readFileSync(join(profile, "DevToolsActivePort"), "utf8"), 10); // first line of the file
    const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const ws = new WebSocket(webSocketDebuggerUrl);
    await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
    let id = 0;
    const waiting = new Map();
    ws.onmessage = (m) => {
      const d = JSON.parse(String(m.data));
      waiting.get(d.id)?.(d);
    };
    const cmd = (method, params, sessionId) =>
      new Promise((resolve) => {
        waiting.set(++id, resolve);
        ws.send(JSON.stringify({ id, method, params, sessionId }));
      });
    try {
      // offscreen documents are not in /json/list, so go through the browser endpoint
      const { result } = await cmd("Target.getTargets", {});
      const t = result.targetInfos.find((x) => new URL(x.url).pathname.endsWith("/offscreen.html"));
      if (!t) return (debug("hook: no offscreen document"), undefined);
      const { result: att } = await cmd("Target.attachToTarget", { targetId: t.targetId, flatten: true });
      const out = await cmd("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, att.sessionId);
      if (out.result?.exceptionDetails) debug(`hook: exception ${out.result.exceptionDetails.exception?.description?.slice(0, 160)}`);
      return out.result?.result?.value;
    } finally {
      ws.close();
    }
  };

  debug(`devtools port file: ${existsSync(join(profile, "DevToolsActivePort"))}`);
  await page.waitForSelector('[data-sk="launcher-tab"]', { timeout: 15000 });
  await sk("launcher-tab").hover();

  // watch the pill from the click on: every phase in order, and one screenshot of each state the first time it shows
  const seen = [];
  let watching = true;
  const shoot = (name) =>
    sk("voice-pill")
      .screenshot({ path: join(shots, `${name}.png`), timeout: 3000 })
      .catch(() => {});
  const watcher = (async () => {
    while (watching) {
      const p = await sk("voice-pill")
        .getAttribute("data-phase", { timeout: 300 })
        .catch(() => null);
      if (p && seen.at(-1) !== p) {
        seen.push(p);
        debug(`pill phase ${p}`);
        await shoot(`live-pill-${p}-${seen.length}`);
      }
      await page.waitForTimeout(40);
    }
  })();
  await sk("launcher-talk").click();

  if (BAD) {
    // the error path: an invalid key string; OpenAI answers 401 to the app, which tells the extension {code: "key-rejected"}
    const end = Date.now() + 20000;
    while (
      Date.now() < end &&
      !/rejected/i.test(
        (await sk("voice-text")
          .textContent({ timeout: 500 })
          .catch(() => "")) ?? "",
      )
    )
      await page.waitForTimeout(150);
    const text =
      (await sk("voice-text")
        .textContent()
        .catch(() => "")) ?? "";
    await shoot("live-error-key-rejected");
    check("an invalid key shows Key rejected, not Pair Speak Kit first", /key rejected/i.test(text) && !/pair/i.test(text), `pill says "${text}"`);
    watching = false;
    await watcher;
    throw Object.assign(new Error("bad-key run done"), { done: true });
  }

  const first = await waitPhase(["idle", "listening", "thinking", "speaking"], 30000);
  check("connected to gpt-realtime-2.1 over WebRTC", !!first, `phase ${first}`);
  check(
    "one client secret was minted by the app, and the page never saw it",
    stats.sessions === 1 && !(await page.evaluate(() => document.documentElement.outerHTML)).includes("ek_"),
    `${stats.sessions} mint`,
  );

  // the question plays after 5 s of silence; the answer follows
  const heard = await waitPhase(["thinking", "speaking"], 25000);
  const spoke = await waitPhase(["speaking"], 25000);
  check("the model answered out loud", !!heard && !!spoke, `phases seen: ${heard}, ${spoke}`);
  const done = await (async () => {
    const end = Date.now() + 40000;
    while (Date.now() < end) {
      if (seen.includes("speaking") && (await phase()) === "idle") return true; // the pill went back to idle after the model's voice
      await page.waitForTimeout(250);
    }
    return false;
  })();
  const trace = JSON.parse((await hook("JSON.stringify(window.__speakkitVoice.trace())")) ?? "{}");
  log(`model said: ${String(trace.transcript ?? "").trim()}`);
  if (trace.errors?.length) log(`error events: ${trace.errors.join(", ")}`);
  if (process.env.LIVE_DEBUG) log(`event types: ${[...new Set(trace.events ?? [])].join(" ")}`);
  check("the reply finished and the output level rose above the threshold", done && trace.outPeak > 0.05, `peak ${trace.outPeak}`);
  check("the reply is about the article (Captain Imara Okonkwo, orange)", /imara|okonkwo/i.test(trace.transcript ?? "") && /orange/i.test(trace.transcript ?? ""));
  const order = ["connecting", "listening", "thinking", "speaking"];
  const at = order.map((p) => seen.indexOf(p));
  check(
    "the pill advanced connecting -> listening -> thinking -> speaking",
    at.every((i, k) => i >= 0 && (k === 0 || i > at[k - 1])),
    seen.join(" > "),
  );

  // mute: the microphone track is detached, so no audio packets leave the browser
  const sent = async () => Number(await hook("window.__speakkitVoice.bytesSent()"));
  const live0 = Number(await hook("window.__speakkitVoice.micLive()"));
  const a = await sent();
  await page.waitForTimeout(1500);
  const unmuted = (await sent()) - a;
  await sk("voice-mute").click();
  await page.waitForTimeout(400);
  await shoot("live-pill-muted");
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
  watching = false;
  await watcher;
  void extId;
} catch (e) {
  if (!e?.done) {
    log(`FAIL  unexpected error: ${e?.message ?? e}`);
    results.push(false);
  }
} finally {
  await ctx.close().catch(() => {});
  await speak.close().catch(() => {});
  rmSync(dataDir, { recursive: true, force: true });
  site.close();
  rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
}
log(results.every(Boolean) && results.length ? "LIVE CHECK PASSED" : "LIVE CHECK FAILED");
process.exit(results.every(Boolean) && results.length ? 0 : 1);
