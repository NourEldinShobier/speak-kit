import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { STREAM_LIMITS, type StreamCreate, type StreamCreated, type StreamResult, type StreamSegment } from "@speakkit/protocol";
import { AutomationFault } from "../automation";
import { HttpError } from "../http";
import { Segmenter, type Segment } from "./segmenter";

/** What the host app lends: the speech engine for one segment, and the person's dictation rules. */
export type Heard = { ok: true; text: string; speech: boolean } | { ok: false; code: "model_missing" | "busy" | "failed" };

export interface StreamsHost {
  /** One segment of 16 kHz mono audio through the shared engine. `busy` means dictation is recording: dictation always goes first. */
  transcribe(pcm: Int16Array, language: string, signal: AbortSignal): Promise<Heard>;
  /** The text after the person's replacements and clean-up; nothing is pasted or saved. */
  process(text: string, language: string): string;
}

export type StreamEvent = { type: "segment"; segment: StreamSegment } | { type: "done"; result: StreamResult } | { type: "failed"; code: string; message: string };

export interface SessionOptions {
  now(): number;
  /** How often a waiting segment asks the engine again while dictation holds it. */
  retryMs?: number;
  maxStreams?: number;
}

const RETRIES = 120;
const SWEEP_MS = 5000;

class Session {
  readonly id = randomUUID().slice(0, 12);
  readonly owner = randomBytes(24).toString("hex");
  readonly #seg = new Segmenter();
  readonly #segments: StreamSegment[] = [];
  readonly #listeners = new Set<(e: StreamEvent) => void>();
  readonly #abort = new AbortController();
  #work: Promise<void> = Promise.resolve();
  #bytes = 0;
  #n = 0;
  #failed: { code: string; message: string } | undefined;
  #closed = false;
  seenAt: number;

  readonly create: StreamCreate;
  readonly host: StreamsHost;
  readonly o: Required<SessionOptions>;

  constructor(create: StreamCreate, host: StreamsHost, o: Required<SessionOptions>) {
    [this.create, this.host, this.o] = [create, host, o];
    this.seenAt = o.now();
  }

  get closed(): boolean {
    return this.#closed;
  }

  feed(buf: Buffer): void {
    if (this.#failed) throw new AutomationFault("failed", this.#failed.message);
    if (buf.length % 2 !== 0 || buf.length === 0) throw new AutomationFault("invalid_input", "audio is 16-bit samples: an even, non-zero number of bytes");
    if (this.#bytes + buf.length > STREAM_LIMITS.maxStreamBytes) throw new AutomationFault("too_large", "a stream carries at most 30 minutes of audio");
    this.#bytes += buf.length;
    this.seenAt = this.o.now();
    const pcm = new Int16Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
    for (const s of this.#seg.push(pcm)) this.#queue(s);
  }

  on(listener: (e: StreamEvent) => void): () => void {
    for (const segment of this.#segments) listener({ type: "segment", segment });
    if (this.#failed) listener({ type: "failed", ...this.#failed });
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  }

  async finish(): Promise<StreamResult> {
    for (const s of this.#seg.flush()) this.#queue(s);
    await this.#work;
    if (this.#failed) throw new AutomationFault("failed", this.#failed.message);
    const language = this.create.language ?? "auto";
    const text = this.#segments.map((s) => s.text).join(" ");
    const result: StreamResult = { text, ...(this.create.process && { processed: this.host.process(text, language) }), segments: this.#segments };
    this.#emit({ type: "done", result });
    this.close();
    return result;
  }

  close(): void {
    this.#closed = true;
    this.#abort.abort();
    this.#listeners.clear();
  }

  #emit(e: StreamEvent): void {
    for (const l of this.#listeners) l(e);
  }

  #queue(s: Segment): void {
    this.#work = this.#work.then(() => this.#hear(s));
  }

  async #hear(s: Segment): Promise<void> {
    if (this.#failed || this.#closed) return;
    const language = this.create.language ?? "auto";
    for (let i = 0; i < RETRIES; i++) {
      const r = await this.host.transcribe(s.pcm, language, this.#abort.signal);
      if (this.#closed) return;
      if (r.ok) return this.#add(s, r.speech ? r.text.trim() : "");
      if (r.code !== "busy")
        return this.#fail(r.code === "model_missing" ? "model_missing" : "failed", r.code === "model_missing" ? "The speech model is not downloaded yet." : "The speech engine failed on a segment.");
      await new Promise((resolve) => setTimeout(resolve, this.o.retryMs));
    }
    this.#fail("busy", "Dictation kept the speech engine busy for too long.");
  }

  #add(s: Segment, text: string): void {
    if (!text) return;
    const segment: StreamSegment = { n: ++this.#n, text, ...(this.create.timestamps && { startMs: s.startMs, endMs: s.endMs }) };
    this.#segments.push(segment);
    this.#emit({ type: "segment", segment });
  }

  #fail(code: string, message: string): void {
    this.#failed = { code, message };
    this.#emit({ type: "failed", code, message });
  }
}

const same = (a: string, b: string): boolean => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * The open streams: who owns each, how much audio it has taken, when it was last fed. Every call names the stream and proves ownership with the secret given at creation,
 * so another program on this computer that knows the app token still cannot read or feed a stream it did not open. A stream nobody feeds for the lease is dropped by `sweep`.
 */
export class StreamSessions {
  readonly #host: StreamsHost;
  readonly #o: Required<SessionOptions>;
  readonly #open = new Map<string, Session>();
  #timer: NodeJS.Timeout | undefined;

  constructor(host: StreamsHost, o: SessionOptions) {
    this.#host = host;
    this.#o = { retryMs: 500, maxStreams: STREAM_LIMITS.maxStreams, ...o };
  }

  get open(): number {
    return this.#open.size;
  }

  create(req: StreamCreate): StreamCreated {
    if (this.#open.size >= this.#o.maxStreams) throw new AutomationFault("queue_full", `at most ${this.#o.maxStreams} streams at once`);
    this.#timer ??= setInterval(() => this.sweep(), SWEEP_MS).unref(); // looks for forgotten streams once there is one
    const s = new Session(req, this.#host, this.#o);
    this.#open.set(s.id, s);
    return { id: s.id, owner: s.owner, leaseMs: STREAM_LIMITS.leaseMs };
  }

  #get(id: string, owner: string | undefined): Session {
    const s = this.#open.get(id);
    if (!s) throw new HttpError(404, "not-found", "no such stream");
    if (!owner || !same(owner, s.owner)) throw new AutomationFault("permission_denied", "this stream belongs to another program");
    return s;
  }

  audio(id: string, owner: string | undefined, buf: Buffer): number {
    this.#get(id, owner).feed(buf);
    return buf.length;
  }

  heartbeat(id: string, owner: string | undefined): void {
    this.#get(id, owner).seenAt = this.#o.now();
  }

  subscribe(id: string, owner: string | undefined, listener: (e: StreamEvent) => void): () => void {
    return this.#get(id, owner).on(listener);
  }

  async finish(id: string, owner: string | undefined): Promise<StreamResult> {
    const s = this.#get(id, owner);
    try {
      return await s.finish();
    } finally {
      this.#open.delete(id);
      s.close();
    }
  }

  cancel(id: string, owner: string | undefined): void {
    this.#get(id, owner).close();
    this.#open.delete(id);
  }

  /** Drops streams that were not fed or kept alive within the lease. Returns how many. */
  sweep(): number {
    let n = 0;
    for (const [id, s] of this.#open) {
      if (this.#o.now() - s.seenAt <= STREAM_LIMITS.leaseMs) continue;
      s.close();
      this.#open.delete(id);
      n++;
    }
    return n;
  }

  dispose(): void {
    clearInterval(this.#timer);
    this.#timer = undefined;
    for (const s of this.#open.values()) s.close();
    this.#open.clear();
  }
}
