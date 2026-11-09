import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { test as base, expect, type Ext } from "../support/ext";
import { FakeOpenAi, FakeVoiceApp } from "../support/voice";

/**
 * Voice chat against fakes: the Speak Kit app (mints client secrets) and OpenAI (a real WebRTC peer in a browser page, driven by the test).
 * Chromium supplies a fake microphone. Screenshots of the real UI go to VOICE_SHOTS (default: the system temp folder).
 */
interface Fx {
  ext: Ext;
  app: FakeVoiceApp;
  ai: FakeOpenAi;
}
const test = base.extend<{ vc: Fx }>({
  vc: async ({ ext, app: real }, use) => {
    const app = await new FakeVoiceApp(real).start();
    ext.fx.set("/peer", FakeOpenAi.html);
    const peer = await ext.ctx.newPage();
    await peer.goto(ext.fx.url("/peer"));
    const ai = await new FakeOpenAi(peer, app.secrets).start();
    await ext.pair(app);
    await ext.voiceTest({ base: ai.base });
    await ext.sw.evaluate(() => chrome.storage.local.set({ "speakkit.voiceConsent": true }));
    await use({ ext, app, ai });
    await ai.stop();
    await app.stop();
  },
});

const SHOTS = process.env.VOICE_SHOTS ?? join(tmpdir(), "speakkit-voice-shots");
mkdirSync(SHOTS, { recursive: true });
const shot = (el: Locator, name: string) => el.screenshot({ path: join(SHOTS, `${name}.png`) });

const sk = (page: Page, name: string) => page.locator(`[data-sk="${name}"]`);
const pill = (page: Page) => sk(page, "voice-pill");
const dots = (page: Page, tone: number) => sk(page, "voice-grid").locator(`i.t${tone}`);
const phase = (page: Page, p: string) => expect(pill(page)).toHaveAttribute("data-phase", p);
const says = (page: Page, text: string) => expect(sk(page, "voice-text")).toHaveText(text);

/** The launcher's Talk button, the way a user reaches it: hover the edge tab, press the mic under play. */
async function talk(page: Page) {
  if (!(await sk(page, "launcher-talk").count())) await sk(page, "launcher-tab").hover();
  await sk(page, "launcher-talk").click();
}
async function connected(page: Page) {
  await talk(page);
  await phase(page, "idle");
}
const closed = (ext: Ext) => expect.poll(() => ext.offscreenCount()).toBe(0);
/** Stops the extension's service worker the way Chrome does when it is idle; it starts again on the next event. */
async function killWorker(ext: Ext, page: Page) {
  const cdp = await ext.ctx.newCDPSession(page);
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.stopAllWorkers");
  await cdp.detach();
}
const lastUpdate = async (ai: FakeOpenAi) => (await ai.received()).filter((e) => e.type === "session.update").at(-1)?.session;

test.describe("starting a conversation", () => {
  test("Talk asks for consent once, then connects; the page reaches the model and only a client secret leaves the app", async ({ vc: { ext, app, ai } }) => {
    await ext.sw.evaluate(() => chrome.storage.local.remove("speakkit.voiceConsent"));
    const page = await ext.open("/article");
    await talk(page);
    const card = sk(page, "voice-consent");
    await expect(card).toBeVisible();
    await expect(card).toContainText("Your voice and the page text go to your provider, OpenAI");
    await expect(card).toContainText("The page address (without its query) is included");
    await expect(card).toContainText("sent again if the connection is restored");
    await expect(card).toContainText("OpenAI bills conversations to your account");
    await shot(card, "consent-card");
    await sk(page, "voice-consent-start").click();
    await expect(pill(page)).toBeVisible();
    await shot(pill(page), "pill-connecting");
    await phase(page, "idle");
    await expect(page.locator(".sk-vp-hint")).toHaveText("Just talk. Click the mic to mute.");

    const session = await lastUpdate(ai);
    expect(session?.instructions).toContain("Page title: The Long Harbor");
    expect(session?.instructions).toContain("P3S1 the quiet harbor wakes");
    expect(session?.instructions).not.toContain("HOMENAV");
    expect([session?.reasoning?.effort, session?.max_output_tokens, session?.audio?.output?.voice]).toEqual(["low", 700, "marin"]);
    expect(ai.calls).toEqual([{ bearer: app.secrets[0]!, type: "application/sdp" }]);
    expect(app.secrets[0]).not.toBe(app.token);
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    expect([html.includes(app.token), html.includes(app.secrets[0]!)]).toEqual([false, false]);

    // the card is not shown a second time, and the launcher's Talk button is filled while the conversation is open
    await sk(page, "launcher-tab").hover();
    await expect(sk(page, "launcher-talk")).toHaveAttribute("aria-pressed", "true");
  });

  test("the model gets the page address without its query and fragment", async ({ vc: { ext, ai } }) => {
    const page = await ext.open("/article?token=SECRETVALUE&q=private#section-2");
    await connected(page);
    const instructions = (await lastUpdate(ai))?.instructions ?? "";
    expect(instructions).toContain(`Page address: ${new URL(page.url()).origin}/article
`);
    expect(instructions).not.toMatch(/SECRETVALUE|private|section-2/);
  });

  test("declining the consent card starts nothing", async ({ vc: { ext, app } }) => {
    await ext.sw.evaluate(() => chrome.storage.local.remove("speakkit.voiceConsent"));
    const page = await ext.open("/article");
    await talk(page);
    await sk(page, "voice-consent-later").click();
    await expect(sk(page, "voice-consent")).toHaveCount(0);
    await expect(pill(page)).toHaveCount(0);
    expect([app.secrets.length, await ext.offscreenCount()]).toEqual([0, 0]);
  });

  test("the keyboard command starts and ends a conversation", async ({ vc: { ext } }) => {
    const page = await ext.open("/article");
    await ext.cmd("voice-chat", page);
    await phase(page, "idle");
    await ext.cmd("voice-chat", page);
    await says(page, "Conversation ended");
  });

  test("one live region outside the pill announces every change; the buttons are labelled", async ({ vc: { ext, ai } }) => {
    const page = await ext.open("/article");
    await connected(page);
    const live = sk(page, "voice-live");
    await expect(live).toHaveAttribute("role", "status");
    await expect(live).toHaveText("Ready. Say something.");
    await expect(pill(page).locator("[data-sk=voice-live]")).toHaveCount(0);
    await expect(sk(page, "voice-mute")).toHaveAttribute("aria-label", "Mute microphone");
    await expect(sk(page, "voice-end")).toHaveAttribute("aria-label", "End conversation");
    const region = await live.elementHandle();
    await ext.voiceTest({ retry: "1500" });
    await ai.drop(); // the pill is rebuilt as the reconnecting notice, and the same region says so
    await expect(live).toHaveText(/^Reconnecting/);
    await phase(page, "idle");
    await sk(page, "voice-end").click();
    await expect(live).toHaveText("Conversation ended");
    expect(await live.elementHandle().then((h) => h!.evaluate((a, b) => a === b, region))).toBe(true);
  });
});

test.describe("states", () => {
  test("listening, thinking, speaking and an interruption follow what the model reports", async ({ vc: { ext, ai } }) => {
    const page = await ext.open("/article");
    await connected(page);
    await expect(sk(page, "voice-grid").locator("i")).toHaveCount(60);
    await expect(dots(page, 1)).toHaveCount(15); // idle: one dim row
    await shot(pill(page), "pill-idle");

    await ai.send({ type: "input_audio_buffer.speech_started" });
    await phase(page, "listening");
    await expect.poll(() => dots(page, 2).count()).toBeGreaterThanOrEqual(10); // bars follow the fake microphone
    await shot(pill(page), "pill-listening");

    await ai.send({ type: "input_audio_buffer.speech_stopped" });
    await phase(page, "thinking");
    await expect.poll(() => dots(page, 2).count()).toBeGreaterThan(0);
    await shot(pill(page), "pill-thinking");

    await ai.speak(1);
    await ai.send({ type: "output_audio_buffer.started" });
    await phase(page, "speaking");
    await expect.poll(() => dots(page, 3).count()).toBeGreaterThan(8); // columns follow the model's voice
    await expect.poll(() => dots(page, 3).count()).toBeGreaterThan(20);
    await shot(pill(page), "pill-speaking");

    await ai.send({ type: "input_audio_buffer.speech_started" }); // interruption: speaking flips to listening
    await phase(page, "listening");
    await ai.speak(0);
    await ai.send({ type: "input_audio_buffer.speech_stopped" });
    await ai.send({ type: "response.done" });
    await phase(page, "idle");
  });

  test("mute switches the dots off and sends no audio; unmute resumes", async ({ vc: { ext, ai } }) => {
    const page = await ext.open("/article");
    await connected(page);
    const grew = async (ms: number) => {
      const a = await ai.inboundBytes();
      await page.waitForTimeout(ms);
      return (await ai.inboundBytes()) - a;
    };
    expect(await grew(700)).toBeGreaterThan(800);
    await sk(page, "voice-mute").click();
    await expect(sk(page, "voice-mute")).toHaveAttribute("aria-pressed", "true");
    await expect(sk(page, "voice-mute")).toHaveAttribute("aria-label", "Unmute microphone");
    await expect(dots(page, 1).or(dots(page, 2)).or(dots(page, 3))).toHaveCount(0);
    await shot(pill(page), "pill-muted");
    await page.waitForTimeout(300);
    expect(await grew(700)).toBeLessThan(300);
    await sk(page, "voice-mute").click();
    await expect(sk(page, "voice-mute")).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => grew(500)).toBeGreaterThan(400);
  });

  test("with reduced motion the thinking wave stands still", async ({ vc: { ext, ai } }) => {
    const page = await ext.open("/article");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await connected(page);
    await ai.send({ type: "input_audio_buffer.speech_started" });
    await ai.send({ type: "input_audio_buffer.speech_stopped" });
    await phase(page, "thinking");
    const grid = () => sk(page, "voice-grid").evaluate((g) => [...g.children].map((c) => c.className).join(""));
    const a = await grid();
    await page.waitForTimeout(500);
    expect(await grid()).toBe(a);
  });

  test("a narrow window gets the 9 column pill", async ({ vc: { ext } }) => {
    const page = await ext.open("/article");
    await page.setViewportSize({ width: 380, height: 700 });
    await connected(page);
    await expect(sk(page, "voice-grid").locator("i")).toHaveCount(36);
    expect((await pill(page).boundingBox())?.width).toBe(156);
    await shot(pill(page), "pill-narrow");
  });

  test("the pill sits 12 px under the top edge, centred, 206 x 44", async ({ vc: { ext } }) => {
    const page = await ext.open("/article");
    await connected(page);
    const box = (await pill(page).boundingBox())!;
    expect([box.y, box.width, box.height]).toEqual([12, 206, 44]);
    expect(Math.abs(box.x + box.width / 2 - 550)).toBeLessThan(1);
  });
});

test.describe("ending", () => {
  test("End closes the connection and the document that holds the microphone; Talk again starts anew", async ({ vc: { ext, app } }) => {
    const page = await ext.open("/article");
    await connected(page);
    expect(await ext.offscreenCount()).toBe(1);
    await sk(page, "voice-end").click();
    await says(page, "Conversation ended");
    await shot(pill(page), "pill-ended");
    await closed(ext);
    await sk(page, "voice-action").click();
    await phase(page, "idle");
    expect(app.secrets).toHaveLength(2); // a new client secret for every conversation
  });

  test("navigating away and closing the tab end the conversation", async ({ vc: { ext, ai } }) => {
    const page = await ext.open("/article");
    await connected(page);
    await page.goto(ext.fx.url("/short"));
    await closed(ext);
    const again = await ext.open("/article?again");
    await connected(again);
    await again.close();
    await closed(ext);
    expect(await ai.received()).toBeDefined();
  });

  test("a second tab takes the conversation over; the first shows it ended", async ({ vc: { ext } }) => {
    const first = await ext.open("/article");
    await connected(first);
    const second = await ext.open("/short");
    await connected(second);
    await says(first, "Conversation ended");
    expect(await ext.offscreenCount()).toBe(1);
    ext.resetCdp();
    await expect.poll(() => ext.off<number | undefined>("window.__speakkitVoice?.tab()")).toBe(await ext.tabId(second));
    await sk(second, "voice-end").click();
    await closed(ext);
  });

  test("a read-aloud that starts ends the conversation; a conversation that starts pauses the read-aloud", async ({ vc: { ext } }) => {
    const page = await ext.open("/article");
    await connected(page);
    await ext.bg({ t: "read-tab", tabId: await ext.tabId(page), mode: "page" });
    await says(page, "Conversation ended");
    ext.resetCdp();
    await ext.waitState("playing");

    await talk(page);
    await phase(page, "idle");
    await expect.poll(async () => (await ext.bgState()).status).toBe("paused");
    await ext.bg({ t: "player", command: { cmd: "resume" } });
    await says(page, "Conversation ended");
    ext.resetCdp(); // the player's document was replaced twice
    await ext.waitState("playing");
  });

  test("the microphone being unplugged ends the conversation cleanly", async ({ vc: { ext } }) => {
    const page = await ext.open("/article");
    await connected(page);
    ext.resetCdp();
    await ext.off("window.__speakkitVoice.unplug()");
    await says(page, "No microphone found");
    await expect(sk(page, "voice-action")).toHaveText("Retry");
    await shot(pill(page), "error-mic-missing");
    await closed(ext);
  });

  test("no microphone at all shows No microphone found with Retry, and a retry works once one is there", async ({ vc: { ext } }) => {
    await ext.voiceTest({ mic: "missing" });
    const page = await ext.open("/article");
    await talk(page);
    await says(page, "No microphone found");
    await expect(sk(page, "voice-action")).toHaveText("Retry");
    expect(ext.ctx.pages().some((p) => p.url().includes("/mic.html"))).toBe(false); // nothing to ask permission for
    await ext.voiceTest({ mic: null });
    await sk(page, "voice-action").click();
    await phase(page, "idle");
  });
});

test.describe("problems", () => {
  const table: [mode: "no-key" | "key-rejected" | "no-credit" | "offline" | "rate-limited" | "unavailable", text: string, action: string][] = [
    ["no-key", "Add your API key", "Set up"],
    ["key-rejected", "Key rejected", "Check key"],
    ["no-credit", "No credit left", "Manage plan"],
    ["offline", "You are offline", "Retry"],
    ["rate-limited", "Too many requests", "Retry"],
    ["unavailable", "Voice chat is unavailable", "Retry"],
  ];
  for (const [mode, text, action] of table) {
    test(`the app says ${mode}`, async ({ vc: { ext, app } }) => {
      app.mode = mode;
      const page = await ext.open("/article");
      await talk(page);
      await says(page, text);
      await expect(sk(page, "voice-action")).toHaveText(action);
      await shot(pill(page), `error-${mode}`);
      await closed(ext);
    });
  }

  test("a retry after an error starts a conversation when the problem is gone", async ({ vc: { ext, app } }) => {
    app.mode = "offline";
    const page = await ext.open("/article");
    await talk(page);
    await says(page, "You are offline");
    app.mode = "ok";
    await sk(page, "voice-action").click();
    await phase(page, "idle");
  });

  test("OpenAI rejecting the secret shows Key rejected and never echoes its message", async ({ vc: { ext, ai } }) => {
    const page = await ext.open("/article");
    ai.failWith = { status: 401, code: "invalid_api_key", times: 1 };
    await talk(page);
    await says(page, "Key rejected");
    await expect(pill(page)).not.toContainText("ek_e2e");
  });

  test("OpenAI answering that the account has no credit shows No credit left", async ({ vc: { ext, ai } }) => {
    const page = await ext.open("/article");
    ai.failWith = { status: 429, code: "insufficient_quota", times: 1 };
    await talk(page);
    await says(page, "No credit left");
    await expect(sk(page, "voice-end")).toBeVisible();
    await sk(page, "voice-end").click(); // dismisses the pill
    await expect(pill(page)).toHaveCount(0);
  });

  test("the app not running", async ({ vc: { ext, app } }) => {
    await app.stop();
    const page = await ext.open("/article");
    await talk(page);
    await says(page, "Speak Kit isn't running");
    await expect(sk(page, "voice-action")).toHaveText("Open Speak Kit");
  });

  test("a page with no text cannot be read", async ({ vc: { ext } }) => {
    ext.fx.set("/empty-voice", "<!doctype html><title>Empty</title><body></body>");
    const page = await ext.open("/empty-voice");
    await talk(page);
    await says(page, "Cannot read this page");
    await expect(sk(page, "voice-action")).toHaveText("Reader view");
    await shot(pill(page), "error-unreadable");
  });

  test("a page that is too long offers the selection", async ({ vc: { ext, ai } }) => {
    const page = await ext.open("/big");
    await talk(page);
    await says(page, "Page is too long");
    await shot(pill(page), "error-too-long");
    await page.evaluate(() => getSelection()!.selectAllChildren(document.querySelector("article p")!));
    await sk(page, "voice-action").click();
    await phase(page, "idle");
    const text = (await lastUpdate(ai))?.instructions ?? "";
    expect(text).toContain("only the selected text above is available");
  });
});

test.describe("microphone", () => {
  test("a blocked microphone opens the permission window, then shows how to allow it", async ({ vc: { ext } }) => {
    await ext.voiceTest({ mic: "denied" });
    const page = await ext.open("/article");
    await talk(page);
    await says(page, "Microphone blocked");
    await shot(pill(page), "error-mic-blocked");
    const win = ext.ctx.pages().find((p) => p.url().includes("/mic.html"));
    await expect(win!.getByRole("heading")).toHaveText("Microphone blocked");
    await win!.close();
    await sk(page, "voice-action").click();
    await expect.poll(() => ext.ctx.pages().some((p) => p.url().endsWith("/options.html#voicechat"))).toBe(true);
    await closed(ext);
  });

  test("a second attempt after a denial opens a fresh permission window instead of reusing the answered one", async ({ vc: { ext } }) => {
    await ext.voiceTest({ mic: "denied" });
    const page = await ext.open("/article");
    await talk(page);
    await says(page, "Microphone blocked");
    const old = ext.ctx.pages().find((p) => p.url().includes("/mic.html"))!;
    await expect(old.getByRole("heading")).toHaveText("Microphone blocked"); // the window stays open, answered
    await sk(page, "voice-end").click(); // dismisses the pill
    await ext.voiceTest({ mic: "prompt" }); // the user fixed the setting
    await talk(page);
    await phase(page, "idle");
    await expect.poll(() => old.isClosed()).toBe(true);
    await expect.poll(() => ext.ctx.pages().some((p) => p.url().includes("/mic.html"))).toBe(false);
  });

  test("closing the permission window without an answer counts as blocked", async ({ vc: { ext } }) => {
    await ext.voiceTest({ mic: "hang" });
    const page = await ext.open("/article");
    await talk(page);
    await expect.poll(() => ext.ctx.pages().some((p) => p.url().includes("/mic.html"))).toBe(true);
    await ext.sw.evaluate(async () => {
      for (const w of await chrome.windows.getAll({ populate: true })) if (w.tabs?.some((t: { url?: string }) => t.url?.includes("/mic.html"))) await chrome.windows.remove(w.id!);
    });
    await says(page, "Microphone blocked");
  });

  test("a granted permission window lets the conversation go on", async ({ vc: { ext } }) => {
    await ext.voiceTest({ mic: "prompt" });
    const page = await ext.open("/article");
    await talk(page);
    await phase(page, "idle");
    await expect.poll(() => ext.ctx.pages().some((p) => p.url().includes("/mic.html"))).toBe(false);
  });
});

test.describe("while talking", () => {
  test("quiet for a while: Still there? with Keep going, then the end", async ({ vc: { ext, ai } }) => {
    await ext.voiceTest({ idle: "600,4" });
    const page = await ext.open("/article");
    await connected(page);
    await says(page, "Still there? 4 s");
    await expect(sk(page, "voice-action")).toHaveText("Keep going");
    await shot(pill(page), "pill-idle-warning");
    const a = await ai.inboundBytes();
    await page.waitForTimeout(500);
    expect((await ai.inboundBytes()) - a).toBeLessThan(300); // no audio is sent while waiting for an answer
    await sk(page, "voice-action").click();
    await phase(page, "idle");
    await says(page, "Still there? 4 s");
    await expect(sk(page, "voice-end")).toBeVisible();
    await says(page, "Conversation ended");
    await closed(ext);
  });

  test("speech keeps the conversation alive", async ({ vc: { ext, ai } }) => {
    await ext.voiceTest({ idle: "1500,3" });
    const page = await ext.open("/article");
    await connected(page);
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(700);
      await ai.send({ type: "input_audio_buffer.speech_started" });
      await ai.send({ type: "input_audio_buffer.speech_stopped" });
      await ai.send({ type: "response.done" });
    }
    await phase(page, "idle");
  });

  test("the conversation ends after the hard cap however much the model hears, and needs a new start", async ({ vc: { ext, ai, app } }) => {
    await ext.voiceTest({ idle: "1200,3,2500" });
    const page = await ext.open("/article");
    await connected(page);
    for (let i = 0; i < 5; i++) {
      await ai.send({ type: "input_audio_buffer.speech_started" }); // noise: restarts the quiet time, never the cap
      await ai.send({ type: "input_audio_buffer.speech_stopped" });
      await ai.send({ type: "response.done" });
      await page.waitForTimeout(400);
    }
    await says(page, "Conversation ended");
    await expect(sk(page, "voice-action")).toHaveText("Talk again");
    await closed(ext);
    await ext.voiceTest({ idle: null });
    await sk(page, "voice-action").click();
    await phase(page, "idle");
    expect(app.secrets).toHaveLength(2);
  });

  test("a clock that ticks and a script that arrives are not a page change; a new article is", async ({ vc: { ext } }) => {
    const page = await ext.open("/article");
    await connected(page);
    await page.evaluate(() => {
      const clock = document.createElement("span");
      document.body.append(clock);
      let n = 0;
      (window as unknown as { tick: ReturnType<typeof setInterval> }).tick = setInterval(() => (clock.textContent = `12:00:${String(n++ % 60).padStart(2, "0")}`), 150);
      const script = document.createElement("script");
      script.type = "application/json";
      script.textContent = "x".repeat(6000);
      document.body.append(script);
    });
    await page.waitForTimeout(3500);
    await phase(page, "idle");
    await page.evaluate(() => {
      const p = document.createElement("p");
      p.textContent = `SWAPPED ${"another article takes the place of the first one. ".repeat(60)}`;
      document.querySelector("article")!.append(p);
    });
    await says(page, "Page changed"); // found although the clock keeps ticking
  });

  test("the page-changed notice does not cover the Still there? warning, and comes back after it", async ({ vc: { ext } }) => {
    await ext.voiceTest({ idle: "2500,20" });
    const page = await ext.open("/article");
    await connected(page);
    await page.evaluate(() => history.pushState({}, "", "/article?next"));
    await says(page, "Page changed");
    await expect(sk(page, "voice-text")).toHaveText(/^Still there\?/);
    await expect(sk(page, "voice-action")).toHaveText("Keep going");
    await sk(page, "voice-action").click();
    await says(page, "Page changed");
  });

  test("a page that changes offers Update, and Update sends the new text", async ({ vc: { ext, ai } }) => {
    const page = await ext.open("/article");
    await connected(page);
    await page.evaluate(() => {
      const p = document.createElement("p");
      p.textContent = `NEWCONTENT ${"fresh words arrive on the page. ".repeat(80)}`;
      document.querySelector("article")!.append(p);
    });
    await says(page, "Page changed");
    await shot(pill(page), "error-page-changed");
    await sk(page, "voice-action").click();
    await phase(page, "idle");
    await expect(sk(page, "voice-grid")).toBeVisible();
    expect((await lastUpdate(ai))?.instructions).toContain("NEWCONTENT");
  });

  test("a single-page navigation shows Page changed too", async ({ vc: { ext } }) => {
    const page = await ext.open("/article");
    await connected(page);
    await page.evaluate(() => history.pushState({}, "", "/article?next"));
    await says(page, "Page changed");
  });

  test("a rejected session.update ends the conversation visibly instead of leaving the model without the page", async ({ vc: { ext, ai } }) => {
    const page = await ext.open("/article");
    await connected(page);
    await ai.send({ type: "error", error: { type: "invalid_request_error", code: "unknown_parameter", message: "Unknown parameter: session.reasoning" } });
    await says(page, "Voice chat is unavailable");
    await expect(sk(page, "voice-action")).toHaveText("Retry");
    await expect(pill(page)).not.toContainText("Unknown parameter");
    await closed(ext);
  });

  test("an empty audio commit error is harmless", async ({ vc: { ext, ai } }) => {
    const page = await ext.open("/article");
    await connected(page);
    await ai.send({ type: "error", error: { type: "invalid_request_error", code: "input_audio_buffer_commit_empty" } });
    await page.waitForTimeout(300);
    await phase(page, "idle");
  });

  test("a lost connection reconnects with a fresh secret, showing the attempts", async ({ vc: { ext, app, ai } }) => {
    await ext.voiceTest({ retry: "500" });
    const page = await ext.open("/article");
    await connected(page);
    ai.failWith = { status: 503, code: "overloaded", times: 2 };
    await ai.drop();
    await says(page, "Reconnecting, 1 of 5");
    await shot(pill(page), "pill-reconnecting");
    await says(page, "Reconnecting, 2 of 5");
    await phase(page, "idle");
    await expect(page.locator(".sk-vp-hint")).toHaveText("Reconnected. The model lost what was said before.");
    expect(app.secrets.length).toBeGreaterThanOrEqual(4);
    expect(new Set(app.secrets).size).toBe(app.secrets.length);
    const session = await lastUpdate(ai);
    expect(session?.instructions).toContain("P3S1");
  });

  test("five failed reconnects end the conversation as offline", async ({ vc: { ext, ai } }) => {
    await ext.voiceTest({ retry: "50" });
    const page = await ext.open("/article");
    await connected(page);
    ai.failWith = { status: 503, code: "overloaded", times: 99 };
    await ai.drop();
    await says(page, "You are offline");
    await closed(ext);
  });
});

test.describe("the service worker", () => {
  test("the voice document keeps the worker awake with a heartbeat while the conversation lasts, and stops when it ends", async ({ vc: { ext } }) => {
    await ext.voiceTest({ beat: "250" });
    const page = await ext.open("/article");
    await connected(page);
    ext.resetCdp();
    const beats = () => ext.off<number>("window.__speakkitVoice.beats()");
    await expect.poll(beats).toBeGreaterThanOrEqual(3);
    const before = await beats();
    await sk(page, "voice-end").click();
    await closed(ext);
    expect(before).toBeGreaterThanOrEqual(3);
  });

  test("when the worker is stopped in the middle of a conversation, the microphone is released and the pill says the conversation ended", async ({ vc: { ext } }) => {
    const page = await ext.open("/article");
    await connected(page);
    expect(await ext.offscreenCount()).toBe(1);
    await killWorker(ext, page);
    await says(page, "Conversation ended");
    // The worker is a new instance now (ext.sw is the dead one): ask the live one. The document closed itself with the microphone and the connection.
    const documents = () =>
      ext.ctx
        .serviceWorkers()[0]
        ?.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length)
        .catch(() => -1);
    await expect.poll(documents, { timeout: 15_000 }).toBe(0);
    await sk(page, "voice-action").click(); // Talk again: a new conversation starts on the restarted worker
    await phase(page, "idle");
    ext.resetCdp();
    expect(await ext.off<number>("window.__speakkitVoice.micLive()")).toBeGreaterThan(0);
  });
});

test.describe("options", () => {
  test("the Voice chat card shows the key state from the app and the microphone", async ({ vc: { ext, app } }) => {
    const opt = await ext.ctx.newPage();
    await opt.goto(`${ext.url("options")}#voicechat`);
    await expect(opt.getByRole("heading", { name: "Voice chat" }).first()).toBeVisible();
    await expect(sk(opt, "voicechat-key")).toHaveText("Key added");
    await expect(opt.getByRole("button", { name: "Open Speak Kit settings" })).toBeVisible();
    await expect(opt.getByRole("button", { name: "Manage in Chrome" })).toBeVisible();
    await expect(opt.locator("input")).toHaveCount(0); // no key field: the key lives in the app
    await shot(opt.locator(".op-main"), "options-voice-chat");
    app.hasKey = false;
    await opt.reload();
    await expect(sk(opt, "voicechat-key")).toHaveText("No key");
    expect(app.auth.length).toBeGreaterThan(0);
  });

  test("Forget voice chat consent takes the first-use agreement back: the card shows again", async ({ vc: { ext } }) => {
    const opt = await ext.ctx.newPage();
    await opt.goto(`${ext.url("options")}#voicechat`);
    await expect(sk(opt, "voicechat-consent")).toHaveText("Agreed");
    await opt.getByRole("button", { name: "Forget voice chat consent" }).click();
    await expect(sk(opt, "voicechat-consent")).toHaveText("Not asked yet");
    await expect(opt.getByRole("button", { name: "Forget voice chat consent" })).toBeDisabled();
    expect(await ext.sw.evaluate(async () => (await chrome.storage.local.get("speakkit.voiceConsent"))["speakkit.voiceConsent"])).toBeUndefined();
    const page = await ext.open("/article");
    await talk(page);
    await expect(sk(page, "voice-consent")).toBeVisible();
  });
});
