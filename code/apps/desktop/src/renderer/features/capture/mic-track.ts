const RATE = 16_000;
const BLOCK = 1280;
/** One second of samples per message to the main process. */
const CHUNK = RATE;
/** A microphone that delivers nothing but zeros for this long is reopened (it went silent after a call or a device change). */
const SILENT_MS = 3000;
const REOPEN_GAP_MS = 10_000;

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

type Silence = (pcm: Int16Array, rate: number, ms: number) => boolean;

/**
 * The microphone of a capture: raw signal (no processing, quiet speech stays quiet), 16 kHz mono, sent on in one-second pieces. If the device
 * goes digitally silent it is opened again, at most every ten seconds. Nothing is thrown away: no loudness gate sits before the transcriber.
 */
export class MicTrack {
  #stream: MediaStream | undefined;
  #ctx: AudioContext | undefined;
  #pending: Int16Array[] = [];
  #pendingLen = 0;
  #recent = new Int16Array(0);
  #lastReopen = 0;
  #closed = false;
  readonly #send: (chunk: Int16Array) => void;
  readonly #silence: Silence;

  private constructor(send: (chunk: Int16Array) => void, silence: Silence) {
    this.#send = send;
    this.#silence = silence;
  }

  /** Opens the microphone; resolves undefined when it cannot be opened (no device, permission refused). */
  static async open(send: (chunk: Int16Array) => void, silence: Silence): Promise<MicTrack | undefined> {
    const t = new MicTrack(send, silence);
    try {
      await t.#start();
      return t;
    } catch {
      // No microphone: the capture goes on without words and the capsule says so.
      return undefined;
    }
  }

  async #start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const ctx = new AudioContext({ sampleRate: RATE, latencyHint: "interactive" });
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const tap = new AudioWorkletNode(ctx, "tap", { numberOfInputs: 1, numberOfOutputs: 1 });
    tap.port.onmessage = (e: MessageEvent<Float32Array>) => this.#push(e.data);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    ctx.createMediaStreamSource(stream).connect(tap).connect(mute).connect(ctx.destination);
    this.#stream = stream;
    this.#ctx = ctx;
  }

  #push(block: Float32Array): void {
    const pcm = new Int16Array(block.length);
    for (let i = 0; i < block.length; i++) pcm[i] = Math.round(Math.max(-1, Math.min(1, block[i]!)) * 32767);
    this.#pending.push(pcm);
    this.#pendingLen += pcm.length;
    const merged = new Int16Array(this.#recent.length + pcm.length);
    merged.set(this.#recent);
    merged.set(pcm, this.#recent.length);
    const keep = (RATE * SILENT_MS) / 1000;
    this.#recent = merged.length > keep ? merged.subarray(merged.length - keep) : merged;
    if (this.#pendingLen >= CHUNK) this.#drain();
    if (this.#silence(this.#recent, RATE, SILENT_MS) && performance.now() - this.#lastReopen > REOPEN_GAP_MS) void this.#reopen();
  }

  #drain(): void {
    const out = new Int16Array(this.#pendingLen);
    let at = 0;
    for (const p of this.#pending) {
      out.set(p, at);
      at += p.length;
    }
    this.#pending = [];
    this.#pendingLen = 0;
    this.#send(out);
  }

  async #reopen(): Promise<void> {
    this.#lastReopen = performance.now();
    this.#release();
    this.#recent = new Int16Array(0);
    if (this.#closed) return;
    try {
      await this.#start();
    } catch {
      // The device is gone: the track stays closed and the words end here; the picture goes on.
    }
  }

  #release(): void {
    this.#stream?.getTracks().forEach((t) => t.stop());
    void this.#ctx?.close();
  }

  /** Sends what is still waiting. */
  async flush(): Promise<void> {
    if (this.#pendingLen) this.#drain();
  }

  close(): void {
    this.#closed = true;
    this.#release();
  }
}
