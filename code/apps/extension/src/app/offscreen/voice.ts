import type { VoiceDown, VoicePage, VoiceProblem, VoiceView } from "@speakkit/protocol";
import {
  IdleTimer,
  OPENAI_BASE,
  REALTIME_EVENTS,
  Realtime,
  RealtimeFailure,
  SESSION_CAP_USD,
  SingleSession,
  Turns,
  buildInstructions,
  eventProblem,
  initialView,
  Looker,
  MicLease,
  isLive,
  mintSession,
  reduceVoice,
  type RealtimeEvent,
  type VoiceEvent,
} from "../../features/voicechat";
import type { FromOffscreen, ToOffscreen, VoiceCommand } from "../../shared/internal";
import { ignore } from "../../shared/ignore";
import { holdWorker } from "./link";
import { openMicrophone } from "./mic";
import { Trace, simulatedMicError, testValue } from "./test-hooks";

/**
 * The voice session of the extension. It lives in the offscreen document because that page can hold the microphone and play the
 * model's voice without a visible window. One session at a time (SingleSession); every way out goes through `teardown`, which
 * releases the microphone and closes the peer connection.
 */
const RECONNECT_MS = [800, 1500, 3000, 5000, 8000];
const LEVEL_MS = 70;
const MIC_WAIT_MS = 120_000;
/** Chrome stops an idle service worker after 30 s; a message from here every 20 s keeps it, and so the page's port to it, alive for the whole conversation. */
const BEAT_MS = 20_000;
/** Problems a reconnect attempt may recover from; the rest end the conversation. */
const RETRYABLE = new Set<VoiceProblem>(["offline", "unavailable", "rate-limited", "app-not-running"]);

const post = (tabId: number, sid: number, msg: Extract<FromOffscreen, { kind: "voice" }>["msg"]) => {
  chrome.runtime.sendMessage({ from: "offscreen", kind: "voice", tabId, sid, msg } satisfies FromOffscreen).catch(ignore); // the worker is restarting; it ends orphans itself
};

/** Tests shorten the quiet time (ms), the warning (s) and the hard cap (ms): "600,3,5000". */
const quiet = testValue("idle")?.split(",").map(Number);

class Session {
  view: VoiceView = initialView();
  /** The bill and the context of the conversation: usage metering with the soft cost cap, and the answers to the model's page searches. */
  private readonly turns = new Turns(Number(testValue("cap")) || SESSION_CAP_USD, {
    look: (args) => this.looker.look(args),
    send: (ev) => {
      if (__TEST__) this.trace.sent.push((ev as { type: string }).type);
      this.rt?.sendEvent(ev);
    },
    answered: () => this.dispatch({ t: "response-done" }),
    warn: () => {
      this.idle.stop();
      this.rt?.send(false);
      this.dispatch({ t: "cost-limit" });
    },
    end: () => this.finish({ t: "end" }),
  });
  /** The looks of this conversation at the screen, named to the app once. */
  private readonly looker = new Looker({ app: () => this.cfg, dispatch: (e) => this.dispatch(e), touch: () => this.idle.touch(), phase: () => this.view.phase });
  /** Tells the app while this conversation holds the microphone. */
  private readonly lease = new MicLease(() => ({ fetch: (i, init) => fetch(i, init), ...this.cfg }));
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
    { idleMs: quiet?.[0], warnS: quiet?.[1], capMs: quiet?.[2] },
  );
  /** Holds the port to the worker (its heartbeat keeps the worker awake; if it goes away anyway the microphone is released at once). */
  private letGo: (() => void) | undefined;
  beats = 0;

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
    this.publish();
    if (this.view.phase === "ended") this.teardown();
  }

  /** Sends the view with what the conversation cost so far (the page shows it when the conversation ends, whoever ends it). */
  private publish() {
    this.emit({ t: "view", view: { ...this.view, usage: this.turns.meter.usage(this.turns.capped) } });
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
    this.letGo = holdWorker(
      Number(testValue("beat")) || BEAT_MS,
      () => this.teardown(),
      () => this.beats++,
    );
    this.emit({ t: "view", view: this.view });
    const ctx = buildInstructions(page);
    if (!ctx.ok) return this.fail(ctx.problem);
    this.instructions = ctx.instructions;
    this.turns.index = ctx.index;
    let minted = await this.mint();
    if (this.dead) return;
    if (typeof minted === "string") return this.fail(minted);
    const stream = await this.microphone();
    if (!stream || this.dead) return stream?.getTracks().forEach((t) => t.stop());
    this.stream = stream;
    this.lease.start();
    for (const t of stream.getAudioTracks()) t.addEventListener("ended", () => void this.micEnded()); // unplugged, or the permission was taken back
    if (minted.expiresAt * 1000 < Date.now() + 5000) minted = await this.mint(); // the permission window took its time
    if (this.dead) return;
    const problem = typeof minted === "string" ? minted : await this.connect(minted.clientSecret);
    if (this.dead) return;
    if (problem) this.fail(problem);
    else this.ready();
  }

  /** The microphone stopped by itself: Chrome's permission says whether it was taken back ("blocked") or the device went away ("missing"). */
  private async micEnded() {
    if (this.dead) return;
    const state = await navigator.permissions.query({ name: "microphone" as PermissionName }).then((p) => p.state, ignore);
    this.fail(state === "denied" ? "mic-blocked" : "mic-missing");
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
      search: !!this.turns.index,
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

  readonly trace = new Trace();

  private onEvent(e: RealtimeEvent) {
    if (__TEST__) this.trace.record(e);
    if (e.type === "response.done") {
      this.turns.responseDone(e, this.view.phase === "speaking");
      return this.publish(); // the page keeps the cost to show when the conversation ends
    }
    if (e.type === "output_audio_buffer.stopped") this.turns.audioStopped();
    const m = REALTIME_EVENTS[e.type];
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

  private async microphone(): Promise<MediaStream | undefined> {
    const got = await openMicrophone({ fake: simulatedMicError, askWindow: () => this.askMicWindow() });
    if (typeof got !== "string") return got;
    if (!this.dead) this.fail(got);
    return undefined;
  }

  /** Opens the permission window (the worker does) and waits for its answer, which is "blocked" when it never comes or the session ends first. */
  private askMicWindow() {
    post(this.tabId, this.sid, { t: "need-mic" });
    return new Promise<boolean>((res) => {
      this.micAnswer = res;
      setTimeout(() => res(false), MIC_WAIT_MS);
    }).finally(() => (this.micAnswer = undefined));
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
      this.turns.index = ctx.index;
      try {
        this.rt?.setInstructions(ctx.instructions, undefined, !!ctx.index);
      } catch (e) {
        this.fail(e instanceof RealtimeFailure ? e.problem : "unavailable");
      }
    } else if (c.t === "end") this.finish({ t: "end" });
  }

  /** Test hooks. */
  micLive = () => this.stream?.getAudioTracks().filter((t) => t.readyState === "live").length ?? 0;
  bytesSent = () => this.rt?.bytesSent() ?? Promise.resolve(0);
  /** Test hook: the microphone device went away. */
  unplug() {
    this.stream?.getAudioTracks().forEach((t) => t.dispatchEvent(new Event("ended")));
  }

  /** Releases the microphone, the peer connection and every timer. Safe to call twice. */
  teardown() {
    if (this.dead) return;
    this.dead = true;
    this.idle.stop();
    this.turns.stop();
    clearInterval(this.levels);
    this.letGo?.();
    this.lease.stop();
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
  } else if (current && current.sid === msg.sid && (c.t === "mic" || current.tabId === tabId)) current.command(c); // the microphone window names the conversation that asked
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
      beats: () => (current ?? last)?.beats ?? 0,
      bytesSent: () => current?.bytesSent() ?? 0,
    },
  });
}
