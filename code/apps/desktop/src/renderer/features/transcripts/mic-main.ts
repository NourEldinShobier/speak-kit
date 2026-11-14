import { transcripts } from "./api";
import { Batcher, levelOf, micCode, RATE } from "./audio";

/**
 * The page of the recorder's hidden microphone window. getUserMedia with all processing off (speech models do better on the raw signal), an AudioContext at
 * 16 kHz so the browser resamples, and an AudioWorklet that hands over 80 ms blocks. Samples leave in pieces of about a second, which main writes to disk as they
 * arrive. Closing the page closes the microphone.
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

let stream: MediaStream | undefined;
let ctx: AudioContext | undefined;
const batch = new Batcher(RATE);

async function start(): Promise<{ ok: true } | { ok: false; code: ReturnType<typeof micCode> }> {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const c = (ctx = new AudioContext({ sampleRate: RATE, latencyHint: "interactive" }));
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    await c.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const tap = new AudioWorkletNode(c, "tap", { numberOfInputs: 1, numberOfOutputs: 1 });
    tap.port.onmessage = (e: MessageEvent<Float32Array>) => {
      transcripts.mic.level(levelOf(e.data));
      const out = batch.push(e.data);
      if (out) transcripts.mic.chunk(out);
    };
    const mute = c.createGain();
    mute.gain.value = 0;
    c.createMediaStreamSource(stream).connect(tap).connect(mute).connect(c.destination);
    stream.getAudioTracks()[0]?.addEventListener("ended", () => transcripts.mic.ended());
    return { ok: true };
  } catch (e) {
    close();
    return { ok: false, code: micCode(e) };
  }
}

function close(): void {
  stream?.getTracks().forEach((t) => t.stop());
  void ctx?.close();
  stream = undefined;
  ctx = undefined;
}

transcripts.mic.onCommand((c) => {
  void (async () => {
    if (c.op === "start") return transcripts.mic.reply(c.id, await start());
    const tail = batch.flush();
    if (tail) transcripts.mic.chunk(tail);
    close();
    transcripts.mic.reply(c.id, { ok: true });
  })();
});
transcripts.mic.ready();
