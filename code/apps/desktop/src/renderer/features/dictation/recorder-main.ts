import { chooseMic, createReopener, createSilenceWatch, isDigitalSilence, levelOf, type MicDevice } from "@speakkit/dictation";
import type { RecorderCommand, RecorderMicConfig, RecorderResult } from "../../../shared/dictation/contract";
import { dictation } from "./api";
import { ClipBuffer, micCode } from "./capture";

/**
 * The page of the hidden microphone window. getUserMedia with all processing off (speech models do better on the raw signal), an AudioContext at
 * 16 kHz so the browser resamples, and an AudioWorklet that hands over 80 ms blocks. The microphone is chosen by `chooseMic` (a saved device wins,
 * virtual inputs and headsets are passed over), released shortly after each recording unless the person asked to keep it ready, and reopened with
 * growing waits when it disappears while kept ready.
 */
const RATE = 16_000;
const RING_MS = 1000;
const BLOCK = 1280;
const BLOCK_MS = (BLOCK / RATE) * 1000;
/** Released-when-idle microphones stay open this long after a recording, so a quick second press (the double tap that locks) finds it open. */
const IDLE_GRACE_MS = 1000;
/** A microphone that is back within this long is bridged with silence; a longer drop cuts the take short. */
const MAX_BRIDGE_MS = 200;

const WORKLET = `class Tap extends AudioWorkletProcessor {
  buf = new Float32Array(${BLOCK}); n = 0;
  process(inputs) {
    const ch = inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice()); this.n = 0; }
    }
    return true;
  }
}
registerProcessor("tap", Tap);`;

interface Live {
  stream: MediaStream;
  ctx: AudioContext;
  deviceId: string;
  label: string;
  bluetooth: boolean;
}

const buffer = new ClipBuffer(RATE, RING_MS, { onPiece: (pcm) => dictation.recorder.chunk(pcm) });
const watch = createSilenceWatch();
let live: Live | null = null;
let opening: Promise<Live> | null = null;
let interrupted = false;
/** When the microphone ended during a recording; cleared by the first sound after it comes back. */
let gapAt: number | undefined;
let warm: ReturnType<typeof setTimeout> | undefined;
let config: RecorderMicConfig = { saved: "", exclusions: [], avoidBluetooth: true, keepMs: 0 };
let reopenedForSilence = false;
let meterOn = false;
const silent = new Set<string>();

const reopener = createReopener({
  open: async () => {
    try {
      await ensureOpen();
      return true;
    } catch {
      return false;
    }
  },
  after: (ms, fn) => {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
  // "recovered" needs no report of its own: the open that succeeded already said which microphone is in use.
  onEvent: (e) => e.type !== "recovered" && dictation.recorder.event(e),
});

async function listDevices(): Promise<MicDevice[]> {
  const all = await navigator.mediaDevices.enumerateDevices();
  const inputs = all.filter((d) => d.kind === "audioinput" && d.deviceId !== "default" && d.deviceId !== "communications");
  return inputs.map((d) => ({ id: d.deviceId, label: d.label }));
}

async function pickDevice(): Promise<{ id: string; label: string; bluetooth: boolean } | null> {
  const devices = await listDevices();
  const def = (await navigator.mediaDevices.enumerateDevices()).find((d) => d.kind === "audioinput" && d.deviceId === "default");
  const defaultId = devices.find((d) => def && d.label && def.label.endsWith(d.label))?.id ?? devices[0]?.id;
  const choice = chooseMic({ devices, saved: config.saved || undefined, defaultId, exclusions: config.exclusions, avoidBluetooth: config.avoidBluetooth, silent: [...silent] });
  if (choice.kind === "none") {
    dictation.recorder.event({ type: "no-device", builtInOff: choice.reason === "built-in-off" });
    return null;
  }
  return { id: choice.id, label: choice.label, bluetooth: choice.bluetooth };
}

async function openMic(): Promise<Live> {
  // Device names are hidden until the page has been given the microphone once: open the default first when they are.
  let first: MediaStream | undefined;
  if (!(await navigator.mediaDevices.enumerateDevices()).some((d) => d.kind === "audioinput" && d.label)) {
    first = await navigator.mediaDevices.getUserMedia({ audio: true });
  }
  const picked = await pickDevice();
  first?.getTracks().forEach((t) => t.stop());
  if (!picked) throw Object.assign(new Error("no microphone"), { name: "NotFoundError" });
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: { exact: picked.id }, channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ctx = new AudioContext({ sampleRate: RATE, latencyHint: "interactive" });
  try {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const tap = new AudioWorkletNode(ctx, "tap", { numberOfInputs: 1, numberOfOutputs: 1 });
    tap.port.onmessage = (e: MessageEvent<Float32Array>) => onBlock(e.data, picked.id);
    // The node must reach the destination to be pulled; its output is silent.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    ctx.createMediaStreamSource(stream).connect(tap).connect(mute).connect(ctx.destination);
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
    throw e;
  }
  const mic = { stream, ctx, deviceId: picked.id, label: picked.label, bluetooth: picked.bluetooth };
  stream.getAudioTracks()[0]?.addEventListener("ended", () => onEnded(mic));
  dictation.recorder.event({ type: "opened", label: picked.label, bluetooth: picked.bluetooth });
  return mic;
}

function onBlock(block: Float32Array, deviceId: string): void {
  if (gapAt !== undefined && buffer.recording) {
    // A short drop is filled with silence so the take keeps its timing; a longer one cuts the take short.
    const gap = Date.now() - gapAt;
    if (gap <= MAX_BRIDGE_MS) buffer.pad(gap);
    else interrupted = true;
    gapAt = undefined;
  }
  buffer.push(block);
  if (buffer.recording || meterOn) dictation.recorder.level(levelOf(block));
  const verdict = watch.feed(isDigitalSilence(block), BLOCK_MS);
  if (verdict === "silent") onSilence(deviceId);
  else if (verdict === "ok") reopenedForSilence = false;
}

/** Exact zeros for three seconds: reopen once (a stuck stream often recovers), and when it is still silent say so and leave this input alone. */
/** Opens the microphone in the background; a failure is reported by the events of the open itself. */
async function tryOpen(): Promise<void> {
  try {
    await ensureOpen();
  } catch {
    // The reopener or the next press tries again; the person sees the microphone state, not this failure.
  }
}

function onSilence(deviceId: string): void {
  if (!reopenedForSilence) {
    reopenedForSilence = true;
    closeMic();
    void tryOpen();
    return;
  }
  silent.add(deviceId);
  dictation.recorder.event({ type: "silent" });
}

function onEnded(mic: Live): void {
  if (buffer.recording && live === mic) gapAt ??= Date.now();
  else interrupted ||= buffer.recording;
  if (live !== mic) return;
  closeMic();
  if (buffer.recording) void ensureOpen().catch(() => reopener.run()); // reopen at once, so a short drop can be bridged
  // A microphone kept ready that vanished is reopened in the background; one released when idle is simply opened by the next press.
  if (config.keepMs !== 0 || meterOn) reopener.run();
}

function closeMic() {
  const mic = live;
  live = null;
  clearTimeout(warm);
  buffer.clear();
  if (!mic) return;
  mic.stream.getTracks().forEach((t) => t.stop());
  void mic.ctx.close();
}

function ensureOpen(): Promise<Live> {
  return (opening ??= openMic()
    .then((mic) => (live = mic))
    .finally(() => (opening = null)));
}

const cool = () => {
  clearTimeout(warm);
  if (config.keepMs < 0) return;
  warm = setTimeout(closeMic, config.keepMs === 0 ? IDLE_GRACE_MS : config.keepMs);
};

/** Lists the microphones for the picker; names are hidden until the microphone was opened once, so it is opened briefly when they are. */
async function announceDevices(): Promise<void> {
  try {
    if (!(await navigator.mediaDevices.enumerateDevices()).some((d) => d.kind === "audioinput" && d.label)) {
      (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop());
    }
    dictation.recorder.event({ type: "devices", devices: (await listDevices()).slice(0, 50) });
  } catch {
    dictation.recorder.event({ type: "devices", devices: [] });
  }
}

const sameDevice = (a: RecorderMicConfig, b: RecorderMicConfig) => a.saved === b.saved && a.avoidBluetooth === b.avoidBluetooth && a.exclusions.join("\n") === b.exclusions.join("\n");

/** Applies new settings at once: another microphone choice reopens, and the microphone is open exactly while it is kept ready or the level meter is on. */
async function configure(on: boolean, mic: RecorderMicConfig): Promise<RecorderResult> {
  const changed = !sameDevice(config, mic);
  meterOn = on;
  config = mic;
  if (buffer.recording) return { ok: true }; // takes effect at the next start
  if (changed) {
    reopener.cancel();
    silent.clear();
    closeMic();
  }
  if (!on && mic.keepMs === 0) {
    if (live) cool();
    return { ok: true };
  }
  clearTimeout(warm);
  try {
    live ??= await ensureOpen();
    if (!on) cool();
    return { ok: true };
  } catch (e) {
    meterOn = false;
    return { ok: false, code: micCode(e) };
  }
}

async function start(prerollMs: number, mic: RecorderMicConfig): Promise<RecorderResult> {
  clearTimeout(warm);
  config = mic;
  if (live && config.saved && live.deviceId !== config.saved) closeMic(); // the person picked another microphone
  try {
    live ??= await ensureOpen();
  } catch (e) {
    return { ok: false, code: micCode(e) };
  }
  interrupted = false;
  gapAt = undefined;
  buffer.start(prerollMs);
  return { ok: true, device: { label: live.label, bluetooth: live.bluetooth } };
}

function stop(): RecorderResult {
  const r = buffer.stop();
  const lost = interrupted || gapAt !== undefined;
  interrupted = false;
  gapAt = undefined;
  if (live) cool();
  return { ok: true, pcm: r?.pcm ?? new Float32Array(0), sampleRate: RATE, peak: r?.peak ?? 0, ...(lost && { interrupted: true }) };
}

// A microphone plugged in or out while kept ready: the saved one returning wins again, and a vanished one is replaced.
navigator.mediaDevices.addEventListener("devicechange", () => {
  silent.clear();
  reopenedForSilence = false;
  if (live && !buffer.recording) closeMic();
  if ((config.keepMs !== 0 || meterOn) && !live) void tryOpen();
});

let speakers: AudioContext | undefined;
/** The tones go through their own context at the system rate: the microphone context runs at 16 kHz and is only for capture. */
function playTone(notes: readonly { at: number; ms: number; hz: number; gain: number }[]): void {
  try {
    speakers ??= new AudioContext();
    const t0 = speakers.currentTime + 0.01;
    for (const n of notes) {
      const osc = speakers.createOscillator();
      const amp = speakers.createGain();
      const from = t0 + n.at / 1000;
      const to = from + n.ms / 1000;
      osc.frequency.value = n.hz;
      // A short fade in and out keeps the tone from clicking.
      amp.gain.setValueAtTime(0, from);
      amp.gain.linearRampToValueAtTime(n.gain, from + 0.008);
      amp.gain.linearRampToValueAtTime(0, to);
      osc.connect(amp).connect(speakers.destination);
      osc.start(from);
      osc.stop(to + 0.01);
    }
  } catch {
    // no output device: the dictation goes on without a tone
  }
}

dictation.recorder.onCommand((c: RecorderCommand) => {
  void (async () => {
    let result: RecorderResult = { ok: true };
    if (c.op === "start") result = await start(c.prerollMs, c.mic);
    else if (c.op === "stop") result = stop();
    else if (c.op === "devices") await announceDevices();
    else if (c.op === "tone") playTone(c.notes);
    else if (c.op === "configure") result = await configure(c.meter, c.mic);
    else if (c.op === "discard") {
      buffer.discard();
      if (live) cool();
    } else {
      reopener.cancel();
      closeMic();
    }
    dictation.recorder.reply(c.id, result);
  })();
});
dictation.recorder.ready();
