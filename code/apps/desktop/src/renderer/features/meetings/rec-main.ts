import type { Device, SystemAudio } from "../../../shared/meetings/contract";
import { Batcher, levelOf, micCode, RATE } from "./audio";
import { meetings } from "./api";

/**
 * The page of the meeting recorder's hidden window. Two sources into one 16 kHz AudioContext: the microphone (You), and the sound the computer plays (Them), taken
 * as a loopback of a screen source whose picture is thrown away. Each source goes through its own AudioWorklet in 80 ms blocks, which leave in pieces of about a
 * second with their time since the start, so main keeps both tracks on one clock. A glitch in the loopback is a gap in time (main fills it); only the track ending is reported.
 */
const BLOCK = 1280;
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

type Track = "you" | "them";
const batch: Record<Track, Batcher> = { you: new Batcher(RATE), them: new Batcher(RATE) };
let ctx: AudioContext | undefined;
let mic: MediaStream | undefined;
let system: MediaStream | undefined;
let nodes: AudioNode[] = [];
let t0 = 0;

const secondsNow = () => (performance.now() - t0) / 1000;

function send(track: Track, out: Int16Array | undefined): void {
  if (out) meetings.rec.chunk(track, out, Math.max(0, secondsNow() - out.length / RATE));
}

function attach(track: Track, stream: MediaStream, tap: AudioWorkletNode): void {
  const c = ctx!;
  tap.port.onmessage = (e: MessageEvent<Float32Array>) => {
    meetings.rec.level(track, levelOf(e.data));
    send(track, batch[track].push(e.data));
  };
  const mute = c.createGain();
  mute.gain.value = 0;
  const source = c.createMediaStreamSource(stream);
  source.connect(tap).connect(mute).connect(c.destination);
  nodes.push(source, tap, mute);
  stream.getAudioTracks()[0]?.addEventListener("ended", () => meetings.rec.ended(track));
}

async function openMic(device: string): Promise<MediaStream> {
  const base = { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: device ? { ...base, deviceId: { exact: device } } : base });
  } catch (e) {
    // The saved microphone is gone: the default one is used, never nothing.
    if (device && (e as { name?: string }).name === "OverconstrainedError") return navigator.mediaDevices.getUserMedia({ audio: base });
    throw e;
  }
}

/** The loopback: a screen source for the video the system requires, of which only the sound is kept. */
async function openSystem(): Promise<MediaStream | undefined> {
  try {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    s.getVideoTracks().forEach((t) => t.stop());
    return s.getAudioTracks().length ? s : undefined;
  } catch {
    return undefined;
  }
}

async function tapNode(): Promise<AudioWorkletNode> {
  return new AudioWorkletNode(ctx!, "tap", { numberOfInputs: 1, numberOfOutputs: 1 });
}

async function start(device: string, wantSystem: boolean): Promise<{ ok: true; system: SystemAudio } | { ok: false; code: ReturnType<typeof micCode> }> {
  try {
    mic = await openMic(device);
    const c = (ctx = new AudioContext({ sampleRate: RATE, latencyHint: "interactive" }));
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    await c.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    t0 = performance.now();
    attach("you", mic, await tapNode());
    let state: SystemAudio = "off";
    if (wantSystem) {
      system = await openSystem();
      if (system) attach("them", system, await tapNode());
      state = system ? "on" : "unavailable";
    }
    return { ok: true, system: state };
  } catch (e) {
    close();
    return { ok: false, code: micCode(e) };
  }
}

async function reopenSystem(): Promise<SystemAudio> {
  system?.getTracks().forEach((t) => t.stop());
  system = await openSystem();
  if (!system || !ctx) return "unavailable";
  attach("them", system, await tapNode());
  return "on";
}

function close(): void {
  for (const track of ["you", "them"] as const) send(track, batch[track].flush());
  nodes.forEach((n) => n.disconnect());
  nodes = [];
  mic?.getTracks().forEach((t) => t.stop());
  system?.getTracks().forEach((t) => t.stop());
  void ctx?.close();
  mic = system = ctx = undefined;
}

async function devices(): Promise<{ inputs: Device[]; outputs: Device[] }> {
  const all = await navigator.mediaDevices.enumerateDevices();
  const pick = (kind: MediaDeviceKind): Device[] =>
    all
      .filter((d) => d.kind === kind && d.deviceId !== "communications")
      .map((d, i) => ({ id: d.deviceId, label: (d.label || `${kind === "audioinput" ? "Microphone" : "Output"} ${i + 1}`).replace(/^Default - /, ""), isDefault: d.deviceId === "default" }));
  return { inputs: pick("audioinput"), outputs: pick("audiooutput") };
}

meetings.rec.onCommand((c) => {
  void (async () => {
    if (c.op === "start") return meetings.rec.reply(c.id, await start(c.micDevice, c.system));
    if (c.op === "reopen-system") return meetings.rec.reply(c.id, { ok: true, system: await reopenSystem() });
    if (c.op === "devices") return meetings.rec.reply(c.id, { ok: true, devices: await devices().catch(() => ({ inputs: [], outputs: [] })) });
    close();
    meetings.rec.reply(c.id, { ok: true });
  })();
});
meetings.rec.ready();
