import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { Page } from "@playwright/test";
import type { LookErrorCode, LookRequest, ScreenLook, VoiceChatErrorCode } from "@speakkit/protocol";

/**
 * Stand-ins for the two servers a voice conversation talks to:
 *  - FakeVoiceApp: the Speak Kit app on loopback (health, pairing check, /v1/voice-chat/status and /session), which mints client secrets;
 *  - FakeOpenAi: api.openai.com's /v1/realtime/calls. The SDP answer comes from a real RTCPeerConnection in a browser page ("the peer"), so the
 *    extension's WebRTC connection, data channel and audio are real; the test scripts what the model says through the peer's data channel.
 */

const json = (res: ServerResponse, status: number, body: unknown) => res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }).end(JSON.stringify(body));
const read = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => resolve(b));
  });
const listen = async (srv: Server) => {
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  return (srv.address() as { port: number }).port;
};

const STATUS: Record<string, number> = { offline: 502, "no-key": 409, "no-credit": 402 };
const LOOK_STATUS: Record<LookErrorCode, number> = { declined: 403, "no-window": 404, busy: 409, "rate-limited": 429, unsupported: 501, "capture-failed": 502, unavailable: 503 };

export class FakeVoiceApp {
  readonly token = "e2e-token-" + Math.random().toString(16).slice(2).padEnd(24, "0");
  port = 0;
  /** What POST /v1/voice-chat/session answers: a session, or one of the app's error codes. */
  mode: "ok" | VoiceChatErrorCode = "ok";
  hasKey = true;
  voice = "marin";
  /** What POST /v1/voice-chat/look answers: a look, or one of the app's look error codes. */
  look: ScreenLook | LookErrorCode = { image: "/9j/4AAQSkZJRg==", width: 1280, height: 720, text: "Invoice 48213\nTotal 129.50 EUR", ocr: "ok", target: "Report.docx - Word", scope: "window" };
  /** How long the app takes to answer a look (the user answering the consent card, the capture). */
  lookDelayMs = 0;
  /** The requests to the look route, with the Authorization header they carried. */
  readonly looks: (LookRequest & { auth: string })[] = [];
  /** Client secrets handed out, in order. */
  readonly secrets: string[] = [];
  /** The Authorization headers of every request to the voice routes. */
  readonly auth: string[] = [];
  private srv!: Server;
  private readonly backend: { port: number; token: string };

  /** `backend`: a real app (server and fake engine) that answers everything but the voice routes, so reading aloud works in the same test. */
  constructor(backend: { port: number; token: string }) {
    this.backend = backend;
  }

  async start() {
    this.srv = createServer((req, res) => void this.route(req, res));
    this.port = await listen(this.srv);
    return this;
  }
  stop = () => new Promise<void>((r) => this.srv.close(() => r()));

  private async route(req: IncomingMessage, res: ServerResponse) {
    const path = (req.url ?? "").split("?")[0];
    if (path === "/v1/health") return json(res, 200, { app: "speakkit", version: "e2e", apiVersion: 1, engine: { id: "kokoro", state: "ready" } });
    if (req.headers.authorization !== `Bearer ${this.token}`) return json(res, 401, { error: { code: "token-rejected", message: "no" } });
    if (path === "/v1/auth/check") return void res.writeHead(204).end();
    if (path === "/v1/voice-chat/status") {
      this.auth.push(req.headers.authorization);
      return json(res, 200, { hasKey: this.hasKey });
    }
    if (path === "/v1/voice-chat/look" && req.method === "POST") return this.answerLook(req, res);
    if (path === "/v1/voice-chat/session" && req.method === "POST") {
      await read(req);
      this.auth.push(req.headers.authorization);
      return this.mint(res);
    }
    return this.forward(req, res);
  }

  private async answerLook(req: IncomingMessage, res: ServerResponse) {
    this.looks.push({ ...(JSON.parse(await read(req)) as LookRequest), auth: String(req.headers.authorization) });
    if (this.lookDelayMs) await new Promise((r) => setTimeout(r, this.lookDelayMs));
    if (typeof this.look === "string") return json(res, LOOK_STATUS[this.look], { code: this.look, error: { code: this.look, message: "no" } });
    return json(res, 200, this.look);
  }

  private mint(res: ServerResponse) {
    if (this.mode !== "ok") return json(res, STATUS[this.mode] ?? 503, { code: this.mode });
    const secret = `ek_e2e_${this.secrets.length + 1}_${Math.random().toString(16).slice(2, 10)}`;
    this.secrets.push(secret);
    return json(res, 200, { clientSecret: secret, expiresAt: Math.floor(Date.now() / 1000) + 600, model: "gpt-realtime-2.1", voice: this.voice });
  }

  /** Everything else goes to the real app. */
  private async forward(req: IncomingMessage, res: ServerResponse) {
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : await read(req);
    const headers: Record<string, string> = { Authorization: `Bearer ${this.backend.token}` };
    for (const h of ["content-type", "x-speakkit-replace"]) if (req.headers[h]) headers[h] = String(req.headers[h]);
    const r = await fetch(`http://127.0.0.1:${this.backend.port}${req.url}`, { method: req.method ?? "GET", headers, ...(body === undefined ? {} : { body }) });
    res.writeHead(r.status, Object.fromEntries(r.headers));
    if (r.body) Readable.fromWeb(r.body as never).pipe(res);
    else res.end();
  }
}

export interface PeerEvent {
  type: string;
  item?: { id?: string; type?: string; role?: string; call_id?: string; output?: string; content?: { type?: string; text?: string; image_url?: string }[] };
  item_id?: string;
  session?: {
    instructions?: string;
    max_output_tokens?: number;
    truncation?: { type?: string; retention_ratio?: number; token_limits?: { post_instructions?: number } };
    tools?: { name?: string }[];
    reasoning?: { effort?: string };
    audio?: { output?: { voice?: string } };
  };
}

/** Page that plays the model: answers the offer, keeps the data channel and can speak (a tone on the audio track). */
const PEER_HTML = `<!doctype html><title>peer</title><script>
window.peer = {
  pcs: [], received: [], dc: null, gain: null,
  async answer(offer) {
    const pc = new RTCPeerConnection();
    this.pcs.push(pc);
    pc.ondatachannel = (e) => { this.dc = e.channel; e.channel.onmessage = (m) => this.received.push(JSON.parse(m.data)); };
    if (!this.out) {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator(); osc.frequency.value = 330;
      this.gain = ctx.createGain(); this.gain.gain.value = 0;
      const dest = ctx.createMediaStreamDestination();
      osc.connect(this.gain).connect(dest); osc.start();
      this.out = dest.stream;
    }
    pc.addTrack(this.out.getAudioTracks()[0], this.out);
    await pc.setRemoteDescription({ type: "offer", sdp: offer });
    await pc.setLocalDescription(await pc.createAnswer());
    if (pc.iceGatheringState !== "complete") await new Promise((r) => { pc.onicegatheringstatechange = () => pc.iceGatheringState === "complete" && r(); setTimeout(r, 4000); });
    return pc.localDescription.sdp;
  },
  send(ev) { this.dc && this.dc.readyState === "open" && this.dc.send(JSON.stringify(ev)); },
  speak(level) { this.gain.gain.value = level; },
  drop() { for (const pc of this.pcs) pc.close(); this.dc = null; },
  async inboundBytes() {
    let n = 0;
    for (const pc of this.pcs) { if (pc.connectionState === "closed") continue; for (const s of (await pc.getStats()).values()) if (s.type === "inbound-rtp" && s.kind === "audio") n += s.bytesReceived; }
    return n;
  },
  open() { return this.pcs.filter((pc) => pc.connectionState !== "closed").length; },
};
</script>`;

export class FakeOpenAi {
  port = 0;
  /** Requests to /v1/realtime/calls: the bearer secret and content type. */
  readonly calls: { bearer: string; type: string }[] = [];
  /** Answer the next calls with this error instead of an SDP answer (0 = never). */
  failWith: { status: number; code: string; times: number } | undefined;
  private srv!: Server;
  private readonly peer: Page;
  private readonly secrets: string[];

  constructor(peer: Page, secrets: string[]) {
    this.peer = peer;
    this.secrets = secrets;
  }

  static html = PEER_HTML;

  async start() {
    this.srv = createServer(async (req, res) => {
      const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
      if (req.method === "OPTIONS") return void res.writeHead(204, cors).end();
      const offer = await read(req);
      const bearer = (req.headers.authorization ?? "").replace(/^Bearer /, "");
      this.calls.push({ bearer, type: String(req.headers["content-type"]) });
      if (this.failWith && this.failWith.times > 0) {
        this.failWith.times--;
        return json(res, this.failWith.status, { error: { code: this.failWith.code, message: `rejected ${bearer}` } });
      }
      if (!this.secrets.includes(bearer)) return json(res, 401, { error: { code: "invalid_api_key", message: "bad secret" } });
      const answer = await this.peer.evaluate((sdp) => (window as unknown as { peer: { answer(s: string): Promise<string> } }).peer.answer(sdp), offer);
      return void res.writeHead(201, { ...cors, "Content-Type": "application/sdp" }).end(answer);
    });
    this.port = await listen(this.srv);
    return this;
  }
  get base() {
    return `http://127.0.0.1:${this.port}`;
  }
  stop = () => new Promise<void>((r) => this.srv.close(() => r()));

  /** The data channel messages the extension sent. */
  received = () => this.peer.evaluate(() => (window as unknown as { peer: { received: PeerEvent[] } }).peer.received);
  send = (ev: object) => this.peer.evaluate((e) => (window as unknown as { peer: { send(e: object): void } }).peer.send(e), ev);
  /** The model's voice: a tone at this loudness (0 to 1) on the audio track. */
  speak = (level: number) => this.peer.evaluate((l) => (window as unknown as { peer: { speak(l: number): void } }).peer.speak(l), level);
  drop = () => this.peer.evaluate(() => (window as unknown as { peer: { drop(): void } }).peer.drop());
  inboundBytes = () => this.peer.evaluate(() => (window as unknown as { peer: { inboundBytes(): Promise<number> } }).peer.inboundBytes());
  openConnections = () => this.peer.evaluate(() => (window as unknown as { peer: { open(): number } }).peer.open());
}
