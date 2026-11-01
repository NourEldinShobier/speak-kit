import { DEFAULT_PORT, DEFAULT_VOICE, SAMPLE_RATE, parseHealth } from "@speakkit/protocol";
import { createEngineClient } from "../../features/connection";
import { IDLE_CLOSE_MS, Player, soundTouchStretch } from "@speakkit/player";
import type { FromOffscreen, ToOffscreen } from "../../shared/internal";
import { withDeadline } from "./deadline";

const testHook = __TEST__ || safeStorage("speakkit.test") !== null;
const fastIdle = __TEST__ ? Number(safeStorage("speakkit.idleclose")) || 0 : 0;

function safeStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

const post = (m: FromOffscreen) => {
  chrome.runtime.sendMessage(m).catch(() => {}); // the worker is asleep or restarting; it reads the state again on wake
};

let cfg = { port: DEFAULT_PORT, token: "" };
const timedFetch = withDeadline((i, init) => fetch(i, init));
const engine = createEngineClient({ fetch: timedFetch, port: async () => cfg.port, token: async () => cfg.token });

const player = new Player(
  {
    // AudioContext is created on the first play, suspended while paused and closed when playback stops (see Player).
    createContext: () => new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: "playback" }) as never,
    fetch: timedFetch,
    emitState: (state) => post({ from: "offscreen", kind: "state", state }),
    emitSentence: (start, tabId) => post({ from: "offscreen", kind: "sentence-start", start, ...(tabId === undefined ? {} : { tabId }) }),
    emitQueue: (queue) => post({ from: "offscreen", kind: "queue", queue }),
    stretch: soundTouchStretch(),
    // Tests can shorten the 60 s idle close (localStorage speakkit.idleclose, in ms).
    ...(fastIdle ? { setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms === IDLE_CLOSE_MS ? fastIdle : ms) } : {}),
    hold: (ms) => void engine.hold(ms),
    engineState: async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${cfg.port}/v1/health`, { signal: AbortSignal.timeout(2000) });
        return parseHealth(await r.json())?.engine.state;
      } catch {
        return undefined;
      }
    },
    // 60 s after playback stopped the worker closes this document; the next play creates it again.
    onIdle: () => post({ from: "offscreen", kind: "idle" }),
  },
  { port: DEFAULT_PORT, token: "", voice: DEFAULT_VOICE, speed: 1.2, pause: "short" },
  testHook,
);

chrome.runtime.onMessage.addListener((msg: ToOffscreen, _sender, sendResponse) => {
  if (!msg || msg.to !== "offscreen") return false;
  if ("autoPlay" in msg) {
    player.autoPlay = msg.autoPlay;
    return false;
  }
  if ("query" in msg) {
    sendResponse(player.queueItems());
    return false;
  }
  cfg = { port: msg.cfg.port, token: msg.cfg.token };
  player.command(msg.command, msg.cfg);
  return false;
});

if (testHook) {
  Object.defineProperty(window, "__speakkit", {
    value: {
      get state() {
        return player.state();
      },
      get framesReceived() {
        return player.probe.framesReceived;
      },
      get scheduledMs() {
        return player.probe.scheduledMs;
      },
      rms: () => player.probe.rms(),
      wave: () => player.probe.waveform(),
      get maxLateMs() {
        return player.probe.maxLateMs;
      },
      get retainedBytes() {
        return player.probe.retainedBytes();
      },
      get rate() {
        return player.probe.lastRate;
      },
      get ctxTime() {
        return player.probe.audioClock().time;
      },
      get ctxState() {
        return player.probe.audioClock().state;
      },
    },
  });
}

post({ from: "offscreen", kind: "state", state: player.state() });
