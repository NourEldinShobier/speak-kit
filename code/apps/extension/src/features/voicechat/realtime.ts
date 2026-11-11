import { voiceChatSessionLimits, type VoiceProblem } from "@speakkit/protocol";
import type { RealtimeUsage } from "./cost";
import { openAiCode, openAiProblem } from "./errors";
import { SEARCH_TOOL, type ToolEvent } from "./search-tool";
import { ignore } from "../../shared/ignore";

/** The Realtime API over WebRTC, in a page that owns the microphone. Authenticates with a client secret only. */
export const OPENAI_BASE = "https://api.openai.com";
const CONNECT_TIMEOUT_MS = 15_000;
const DISCONNECT_GRACE_MS = 4000;
/** A session.update over this is not sent: the instructions at their cap, the session fields around them and the JSON escaping of the page text fit with room to spare. */
const MAX_UPDATE_BYTES = 262_144;

/** A server event of the data channel that the session reacts to. */
export type RealtimeEvent = ToolEvent & { type: string; error?: { code?: string; type?: string }; transcript?: string; response?: ToolEvent["response"] & { usage?: RealtimeUsage } };

export class RealtimeFailure extends Error {
  readonly problem: VoiceProblem;
  constructor(problem: VoiceProblem) {
    super(problem);
    this.problem = problem;
  }
}

export interface RealtimeOptions {
  base: string;
  secret: string;
  voice: string;
  instructions: string;
  /** the page is only outlined in the instructions: the session gets the search_page tool */
  search?: boolean;
  stream: MediaStream;
  fetch: typeof fetch;
  onEvent(e: RealtimeEvent): void;
  /** the connection is gone (not called after close()) */
  onLost(): void;
}

const rms = (a: AnalyserNode, buf: Uint8Array<ArrayBuffer>) => {
  a.getByteTimeDomainData(buf);
  let sum = 0;
  for (const b of buf) sum += ((b - 128) / 128) ** 2;
  return Math.min(1, Math.sqrt(sum / buf.length) * 4);
};

/** One peer connection with the model; the microphone stream belongs to the caller and survives a reconnect. */
export class Realtime {
  private pc = new RTCPeerConnection();
  private dc: RTCDataChannel;
  private audio = new Audio();
  private ctx = new AudioContext();
  private micLevel: AnalyserNode;
  private outLevel: AnalyserNode;
  private buf = new Uint8Array(new ArrayBuffer(512));
  private closed = false;
  private grace: ReturnType<typeof setTimeout> | undefined;
  private readonly o: RealtimeOptions;

  constructor(o: RealtimeOptions) {
    this.o = o;
    this.micLevel = this.analyser(o.stream);
    this.outLevel = this.ctx.createAnalyser();
    this.outLevel.fftSize = 512;
    this.audio.autoplay = true;
    this.pc.ontrack = (e) => {
      const remote = e.streams[0] ?? new MediaStream([e.track]);
      this.audio.srcObject = remote;
      this.ctx.createMediaStreamSource(remote).connect(this.outLevel);
    };
    for (const t of o.stream.getAudioTracks()) this.pc.addTrack(t, o.stream);
    this.dc = this.pc.createDataChannel("oai-events");
    this.dc.onmessage = (m) => this.onMessage(m.data);
    this.dc.onclose = () => this.lost();
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      clearTimeout(this.grace);
      if (s === "failed" || s === "closed") this.lost();
      else if (s === "disconnected") this.grace = setTimeout(() => this.lost(), DISCONNECT_GRACE_MS);
    };
  }

  private analyser(s: MediaStream) {
    const a = this.ctx.createAnalyser();
    a.fftSize = 512;
    this.ctx.createMediaStreamSource(s).connect(a);
    return a;
  }

  private onMessage(data: unknown) {
    try {
      const e = JSON.parse(String(data)) as RealtimeEvent;
      if (typeof e.type === "string") this.o.onEvent(e);
    } catch {
      /* not JSON: ignore */
    }
  }

  private lost() {
    if (this.closed) return;
    this.close();
    this.o.onLost();
  }

  /** Offers the microphone, trades the SDP for the model's answer and configures the session once the data channel is open. */
  async connect(): Promise<void> {
    const open = new Promise<void>((res, rej) => {
      this.dc.onopen = () => res();
      setTimeout(() => rej(new RealtimeFailure("offline")), CONNECT_TIMEOUT_MS);
    });
    open.catch(ignore); // a failure before it is awaited is reported by the step that failed
    await this.pc.setLocalDescription(await this.pc.createOffer());
    let res: Response;
    try {
      res = await this.o.fetch(`${this.o.base}/v1/realtime/calls`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.o.secret}`, "Content-Type": "application/sdp" },
        body: this.pc.localDescription?.sdp ?? "",
        signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
      });
    } catch {
      throw new RealtimeFailure("offline");
    }
    if (!res.ok) throw new RealtimeFailure(openAiProblem({ status: res.status, code: openAiCode(await res.json().catch(ignore)) }));
    await this.pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
    await open;
    this.setInstructions(this.o.instructions, this.o.voice, this.o.search);
    void this.ctx.resume().catch(ignore);
  }

  /**
   * Cost control: low reasoning, short answers, old turns dropped at a token limit, server VAD (the model hears turns, nothing is sent while the track is off).
   * Throws a RealtimeFailure when the update is over the size cap ("too-long") or the channel refuses it ("unavailable"): the model must not run without the page.
   */
  setInstructions(instructions: string, voice?: string, search = false) {
    const session = {
      type: "realtime",
      instructions,
      ...voiceChatSessionLimits(),
      tools: search ? [SEARCH_TOOL] : [],
      tool_choice: "auto",
      reasoning: { effort: "low" },
      audio: { input: { turn_detection: { type: "server_vad", silence_duration_ms: 600, create_response: true, interrupt_response: true } }, ...(voice ? { output: { voice } } : {}) },
    };
    if (this.dc.readyState !== "open") return;
    const payload = JSON.stringify({ type: "session.update", session });
    if (new TextEncoder().encode(payload).length > MAX_UPDATE_BYTES) throw new RealtimeFailure("too-long");
    try {
      this.dc.send(payload);
    } catch {
      throw new RealtimeFailure("unavailable");
    }
  }

  /** Sends one client event (tool answers, item deletes). False when the channel is not open. */
  sendEvent(ev: object): boolean {
    if (this.dc.readyState !== "open") return false;
    try {
      this.dc.send(JSON.stringify(ev));
      return true;
    } catch {
      return false;
    }
  }

  /** Mute and idle switch the microphone off: the track is disabled and detached from the connection, so no audio packets leave the page. */
  send(on: boolean) {
    for (const t of this.o.stream.getAudioTracks()) t.enabled = on;
    for (const s of this.pc.getSenders()) if (s.track?.kind === "audio" || !s.track) void s.replaceTrack(on ? (this.o.stream.getAudioTracks()[0] ?? null) : null).catch(ignore);
  }

  /** Audio bytes sent so far (tests check that nothing is sent while muted). */
  async bytesSent(): Promise<number> {
    let n = 0;
    for (const s of (await this.pc.getStats()).values()) if (s.type === "outbound-rtp" && s.kind === "audio") n += s.bytesSent as number;
    return n;
  }

  level(which: "mic" | "out"): number {
    return rms(which === "mic" ? this.micLevel : this.outLevel, this.buf);
  }

  /** Closes the connection and the audio plumbing. Does not stop the microphone stream. */
  close() {
    this.closed = true;
    clearTimeout(this.grace);
    this.dc.onclose = this.dc.onmessage = this.pc.onconnectionstatechange = null;
    this.dc.close();
    this.pc.close();
    this.audio.srcObject = null;
    void this.ctx.close().catch(ignore);
  }
}
