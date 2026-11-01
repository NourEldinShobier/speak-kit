import type { CtxLike, PlayerDeps, SourceLike, StretchNode } from "./deps";

type Analyser = { getFloatTimeDomainData(a: Float32Array): void; fftSize: number };

/** The AudioContext and what hangs off it (analyser, pitch stretcher). Created by the first play, closed when playback goes idle. */
export class AudioOutput {
  analyser: Analyser | undefined;
  private ctx: CtxLike | undefined;
  private out: unknown;
  private stretchNode: StretchNode | undefined;
  private stretchReady: Promise<void> | undefined;

  constructor(
    private deps: Pick<PlayerDeps, "createContext" | "stretch">,
    private wantAnalyser: boolean,
  ) {}

  get current(): CtxLike | undefined {
    return this.ctx;
  }

  ensure(): CtxLike {
    if (!this.ctx) {
      this.ctx = this.deps.createContext();
      if (this.wantAnalyser && this.ctx.createAnalyser) {
        this.analyser = this.ctx.createAnalyser() as Analyser;
        (this.analyser as unknown as { connect(n: unknown): void }).connect(this.ctx.destination);
        this.out = this.analyser;
      } else this.out = this.ctx.destination;
    }
    return this.ctx;
  }

  /** Speeds above 2x: the sources run faster (playbackRate) and the SoundTouch worklet puts the pitch back. Loaded on first use per context. */
  async ensureStretch(): Promise<void> {
    const st = this.deps.stretch;
    if (!st) return;
    const ctx = this.ensure();
    this.stretchReady ??= (async () => {
      await st.register(ctx);
      if (this.ctx !== ctx) return;
      const node = st.create(ctx);
      node.connect(this.out);
      this.stretchNode = node;
    })();
    await this.stretchReady;
  }

  /** Route a source to the speakers, through the pitch corrector when it runs faster than 1x and the corrector is loaded. */
  connect(src: SourceLike, rate: number): void {
    const stretch = rate > 1 ? this.stretchNode : undefined;
    src.connect(stretch ? stretch.input : this.out);
    stretch?.setRate(rate);
  }

  close(): void {
    this.stretchNode?.disconnect();
    this.stretchNode = undefined;
    this.stretchReady = undefined;
    this.analyser = undefined;
    const c = this.ctx;
    this.ctx = undefined;
    this.out = undefined;
    void c?.close?.().catch(() => {});
  }

  clock(): { time: number; state: string } {
    const c = this.ctx as unknown as { currentTime: number; state?: string } | undefined;
    return { time: c?.currentTime ?? 0, state: c?.state ?? "none" };
  }

  waveform(): Float32Array {
    const a = this.analyser;
    if (!a) return new Float32Array(0);
    const buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(buf);
    return buf;
  }

  rms(): number {
    const buf = this.waveform();
    let s = 0;
    for (const v of buf) s += v * v;
    return buf.length ? Math.sqrt(s / buf.length) : 0;
  }
}
