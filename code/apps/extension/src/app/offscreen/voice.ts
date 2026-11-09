import type { VoiceDown, VoicePage, VoiceProblem, VoiceView } from "@speakkit/protocol";
import {
  IdleTimer,
  OPENAI_BASE,
  Realtime,
  RealtimeFailure,
  SingleSession,
  buildInstructions,
  eventProblem,
  initialView,
  isLive,
  mintSession,
  reduceVoice,
  type RealtimeEvent,
  type VoiceEvent,
} from "../../features/voicechat";
import type { FromOffscreen, ToOffscreen, VoiceCommand } from "../../shared/internal";
import { ignore } from "../../shared/ignore";

/**
 * The voice session of the extension. It lives in the offscreen document because that page can hold the microphone and play the
 * model's voice without a visible window. One session at a time (SingleSession); every way out goes through `teardown`, which
 * releases the microphone and closes the peer connection.
 */
const RECONNECT_MS = [800, 1500, 3000, 5000, 8000];
const LEVEL_MS = 70;
const MIC_WAIT_MS = 120_000;
/** Problems a reconnect attempt may recover from; the rest end the conversation. */
const RETRYABLE = new Set<VoiceProblem>(["offline", "unavailable", "rate-limited", "app-not-running"]);

// Tests aim the connection at a fake server and simulate a blocked microphone; the values live in this extension origin's own storage, out of reach of pages.
const testValue = (key: string) => {
  try {
    return __TEST__ ? localStorage.getItem(`speakkit.voice.${key}`) : null;
  } catch {
    return null;
  }
};

const post = (tabId: number, sid: number, msg: Extract<FromOffscreen, { kind: "voice" }>["msg"]) => {
  chrome.runtime.sendMessage({ from: "offscreen", kind: "voice", tabId, sid, msg } satisfies FromOffscreen).catch(ignore); // the worker is restarting; it ends orphans itself
};

/** Tests shorten the quiet time (ms) and the warning (s): "600,3". */
const quiet = testValue("idle")?.split(",").map(Number);

class Session {
  view: VoiceView = initialView();
  private rt: Realtime | undefined;
  private stream: MediaStream | undefined;
  private instructions = "";
  private voice = "";
  private dead = false;
  private levels: ReturnType<typeof setInterval> | undefined;
  private lastLevel = -1;
  private micAnswer: ((ok: boolean) => void) | undefined;
  private readonly idle = new IdleTimer(
    {
      warn: (secondsLeft) => {
        this.rt?.send(false);
        this.dispatch({ t: "idle-warning", secondsLeft });
      },
      end: () => this.finish({ t: "end" }),
    },
    quiet?.[0],
    quiet?.[1],
  );

  readonly tabId: number;
  readonly sid: number;
  private readonly cfg: { port: number; token: string };
  private readonly onClosed: () => void;
  constructor(id: { tabId: number; sid: number }, cfg: { port: number; token: string }, onClosed: () => void) {
    this.tabId = id.tabId;
    this.sid = id.sid;
    this.cfg = cfg;
    this.onClosed = onClosed;
  }

  private emit(m: VoiceDown) {
    if (!this.dead || m.t === "view") post(this.tabId, this.sid, m);
  }

  dispatch(e: VoiceEvent) {
    const before = this.view;
    this.view = reduceVoice(before, e);
    if (this.view === before) return;
    if (e.t === "speech-start" || e.t === "audio-start" || e.t === "connected") this.idle.touch();
    this.emit({ t: "view", view: this.view });
    if (this.view.phase === "ended") this.teardown();
  }

  /** Ends the conversation with `e` and closes everything. */
  finish(e: VoiceEvent) {
    this.dispatch(e);
    if (this.view.phase !== "ended") this.dispatch({ t: "end" });
  }
  private fail(problem: VoiceProblem) {
    this.finish({ t: "problem", problem });
  }

  async start(page: VoicePage) {
    this.emit({ t: "view", view: this.view });
    const ctx = buildInstructions(page);
    if (!ctx.ok) return this.fail(ctx.problem);
    this.instructions = ctx.instructions;
    let minted = await this.mint();
    if (this.dead) return;
    if (typeof minted === "string") return this.fail(minted);
    const stream = await this.microphone();
    if (!stream || this.dead) return stream?.getTracks().forEach((t) => t.stop());
    this.stream = stream;
    for (const t of stream.getAudioTracks()) t.addEventListener("ended", () => !this.dead && this.fail("mic-blocked")); // unplugged
    if (minted.expiresAt * 1000 < Date.now() + 5000) minted = await this.mint(); // the permission window took its time
    if (this.dead) return;
    const problem = typeof minted === "string" ? minted : await this.connect(minted.clientSecret);
    if (this.dead) return;
    if (problem) this.fail(problem);
    else this.ready();
  }

  /** A fresh client secret from the app, or the problem to show. Each connection uses its own. */
  private async mint(): Promise<{ clientSecret: string; expiresAt: number } | VoiceProblem> {
    const m = await mintSession({ fetch: (i, init) => fetch(i, init), ...this.cfg });
    if (!m.ok) return m.problem;
    this.voice = m.session.voice;
    return m.session;
  }

  /** Opens the peer connection with `secret`. Resolves to the problem when it fails. */
  private async connect(secret: string): Promise<VoiceProblem | undefined> {
    const rt = new Realtime({
      base: testValue("base") ?? OPENAI_BASE,
      secret,
      voice: this.voice,
      instructions: this.instructions,
      stream: this.stream!,
      fetch: (i, init) => fetch(i, init),
      onEvent: (e) => this.onEvent(e),
      onLost: () => {
        if (this.view.phase !== "connecting" && this.view.phase !== "reconnecting") void this.recover(); // while connecting, connect() reports the failure
      },
    });
    this.rt = rt;
    try {
      await rt.connect();
    } catch (e) {
      rt.close();
      if (this.rt === rt) this.rt = undefined;
      return e instanceof RealtimeFailure ? e.problem : "unavailable";
    }
    return undefined;
  }

  private ready() {
    this.rt?.send(!this.view.muted);
    this.dispatch({ t: "connected" });
    this.idle.touch();
    this.levels ??= setInterval(() => this.sendLevel(), LEVEL_MS);
  }

  /** Test builds keep what the model said and what went wrong, for the live check. */
  readonly trace = { events: [] as string[], transcript: "", errors: [] as string[], outPeak: 0 };

  private onEvent(e: RealtimeEvent) {
    if (__TEST__) {
      this.trace.events.push(e.type);
      if (e.type === "response.output_audio_transcript.done") this.trace.transcript += `${e.transcript ?? ""} `;
      if (e.type === "error") this.trace.errors.push(String(e.error?.code ?? e.error?.type));
    }
    const map: Record<string, VoiceEvent> = {
      "input_audio_buffer.speech_started": { t: "speech-start" },
      "input_audio_buffer.speech_stopped": { t: "speech-stop" },
      "output_audio_buffer.started": { t: "audio-start" },
      "output_audio_buffer.stopped": { t: "audio-stop" },
      "output_audio_buffer.cleared": { t: "audio-stop" },
      "response.done": { t: "response-done" },
    };
    const m = map[e.type];
    if (m) this.dispatch(m);
    else if (e.type === "error") {
      const p = eventProblem(e);
      if (p) this.fail(p);
    }
  }

  /** The connection dropped: new secret, new peer connection, same microphone and instructions, up to five tries. */
  private async recover() {
    if (this.dead) return;
    this.rt = undefined;
    for (;;) {
      this.dispatch({ t: "lost" });
      if (this.dead || this.view.phase !== "reconnecting") return;
      await new Promise((r) => setTimeout(r, Number(testValue("retry")) || RECONNECT_MS[(this.view.attempt ?? 1) - 1]));
      if (this.dead) return;
      const minted = await this.mint();
      let problem: VoiceProblem | undefined;
      if (typeof minted === "string") problem = minted;
      else if (!this.dead) problem = await this.connect(minted.clientSecret);
      if (this.dead) return;
      if (!problem) return this.ready();
      if (!RETRYABLE.has(problem)) return this.fail(problem);
    }
  }

  private sendLevel() {
    const rt = this.rt;
    const p = this.view.phase;
    if (!rt || this.view.muted || !(p === "listening" || p === "speaking" || p === "idle")) return;
    const v = Math.round(rt.level(p === "speaking" ? "out" : "mic") * 50) / 50;
    if (v === this.lastLevel) return;
    this.lastLevel = v;
    if (__TEST__ && p === "speaking") this.trace.outPeak = Math.max(this.trace.outPeak, v);
    this.emit({ t: "level", v });
  }

  /** The microphone: the browser's, else the answer of the permission window. */
  private async microphone(): Promise<MediaStream | undefined> {
    const grab = async () => {
      if (testValue("mic")) throw new DOMException("denied", "NotAllowedError");
      return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    };
    try {
      return await grab();
    } catch (e) {
      if ((e as DOMException).name !== "NotAllowedError") return void this.fail("mic-blocked");
    }
    post(this.tabId, this.sid, { t: "need-mic" });
    const ok = await new Promise<boolean>((res) => {
      this.micAnswer = res;
      setTimeout(() => res(false), MIC_WAIT_MS);
    });
    this.micAnswer = undefined;
    if (this.dead) return undefined;
    if (!ok) return void this.fail("mic-blocked");
    return grab().catch(() => void this.fail("mic-blocked"));
  }

  command(c: VoiceCommand) {
    if (c.t === "mic") this.micAnswer?.(c.ok);
    else if (c.t === "mute") {
      this.dispatch({ t: "mute", on: c.on });
      this.rt?.send(!c.on && isLive(this.view));
    } else if (c.t === "keep-going") {
      this.dispatch({ t: "keep-going" });
      this.rt?.send(!this.view.muted);
      this.idle.touch();
    } else if (c.t === "update") {
      const ctx = buildInstructions(c.page);
      if (!ctx.ok) return this.fail(ctx.problem);
      this.instructions = ctx.instructions;
      this.rt?.setInstructions(ctx.instructions);
    } else if (c.t === "end") this.finish({ t: "end" });
  }

  /** Test hooks. */
  micLive() {
    return this.stream?.getAudioTracks().filter((t) => t.readyState === "live").length ?? 0;
  }
  bytesSent() {
    return this.rt?.bytesSent() ?? Promise.resolve(0);
  }
  /** Test hook: the microphone device went away. */
  unplug() {
    this.stream?.getAudioTracks().forEach((t) => t.dispatchEvent(new Event("ended")));
  }

  /** Releases the microphone, the peer connection and every timer. Safe to call twice. */
  teardown() {
    if (this.dead) return;
    this.dead = true;
    this.idle.stop();
    clearInterval(this.levels);
    this.micAnswer?.(false);
    this.rt?.close();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.rt = this.stream = undefined;
    this.onClosed();
  }
}

const slot = new SingleSession();
let current: Session | undefined;
/** The session that ended last (test hooks read its trace). */
let last: Session | undefined;

/** Ends the current session, whoever owns it (the document is going away, or the worker lost track of it). */
export function endVoice() {
  current?.teardown();
}

export function onVoice(msg: Extract<ToOffscreen, { voice: VoiceCommand }>) {
  const { voice: c, tabId } = msg;
  if (c.t === "start") {
    const evicted = slot.claim(tabId);
    if (evicted !== undefined && current) post(evicted, current.sid, { t: "view", view: { phase: "ended", muted: false } });
    current?.teardown(); // the same tab starting again, or another tab taking over
    const s = new Session({ tabId, sid: msg.sid }, msg.cfg ?? { port: 0, token: "" }, () => {
      if (current === s) current = undefined;
      slot.release(tabId);
      post(tabId, msg.sid, { t: "closed" });
    });
    current = last = s;
    void s.start(c.page);
  } else if (current && (c.t === "mic" || (current.tabId === tabId && current.sid === msg.sid))) current.command(c);
  else if (c.t === "end") post(tabId, msg.sid, { t: "closed" });
}

if (__TEST__) {
  Object.defineProperty(window, "__speakkitVoice", {
    value: {
      active: () => !!current,
      tab: () => slot.tab,
      view: () => current?.view,
      unplug: () => void setTimeout(() => current?.unplug(), 50), // the document closes, so the call must return first
      trace: () => (current ?? last)?.trace,
      micLive: () => current?.micLive() ?? 0,
      bytesSent: () => current?.bytesSent() ?? 0,
    },
  });
}
