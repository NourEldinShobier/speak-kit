import type { RecorderCommand, RecorderResult } from "../../../shared/dictation/contract";
import { dictation } from "./api";
import { ClipBuffer, levelOf, micCode } from "./capture";

/**
 * The page of the hidden microphone window. getUserMedia with all processing off (speech models do better on the raw signal), an AudioContext at
 * 16 kHz so the browser resamples, and an AudioWorklet that hands over 80 ms blocks. After a recording the microphone stays open for a few seconds,
 * so the next press has pre-roll and no start-up delay, then closes: the Windows microphone indicator is not left on.
 */
const RATE = 16_000;
const KEEP_MS = 1000;
const WARM_MS = 8000;
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

interface Live {
  stream: MediaStream;
  ctx: AudioContext;
}

const buffer = new ClipBuffer(RATE, KEEP_MS);
let live: Live | null = null;
let opening: Promise<Live> | null = null;
let interrupted = false;
let warm: ReturnType<typeof setTimeout> | undefined;

async function openMic(): Promise<Live> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const ctx = new AudioContext({ sampleRate: RATE, latencyHint: "interactive" });
  try {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const tap = new AudioWorkletNode(ctx, "tap", { numberOfInputs: 1, numberOfOutputs: 1 });
    tap.port.onmessage = (e: MessageEvent<Float32Array>) => {
      buffer.push(e.data);
      if (buffer.recording) dictation.recorder.level(levelOf(e.data));
    };
    // The node must reach the destination to be pulled; its output is silent.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    ctx.createMediaStreamSource(stream).connect(tap).connect(mute).connect(ctx.destination);
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
    throw e;
  }
  const mic = { stream, ctx };
  stream.getAudioTracks()[0]?.addEventListener("ended", () => {
    interrupted ||= buffer.recording;
    if (live === mic) closeMic();
  });
  return mic;
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

const cool = () => {
  clearTimeout(warm);
  warm = setTimeout(closeMic, WARM_MS);
};

async function start(prerollMs: number): Promise<RecorderResult> {
  clearTimeout(warm);
  try {
    live ??= await (opening ??= openMic().finally(() => (opening = null)));
  } catch (e) {
    return { ok: false, code: micCode(e) };
  }
  interrupted = false;
  buffer.start(prerollMs);
  return { ok: true };
}

function stop(): RecorderResult {
  const r = buffer.stop();
  const lost = interrupted;
  interrupted = false;
  if (live) cool();
  return { ok: true, pcm: r?.pcm ?? new Float32Array(0), sampleRate: RATE, peak: r?.peak ?? 0, ...(lost && { interrupted: true }) };
}

dictation.recorder.onCommand((c: RecorderCommand) => {
  void (async () => {
    let result: RecorderResult = { ok: true };
    if (c.op === "start") result = await start(c.prerollMs);
    else if (c.op === "stop") result = stop();
    else if (c.op === "discard") {
      buffer.discard();
      if (live) cool();
    } else closeMic();
    dictation.recorder.reply(c.id, result);
  })();
});
dictation.recorder.ready();
