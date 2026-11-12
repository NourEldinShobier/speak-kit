import * as v from "valibot";
import {
  FrameDecoder,
  automationLimitsSchema,
  engineListSchema,
  errorBodySchema,
  exportJobSchema,
  healthSchema,
  voiceListSchema,
  type AutomationLimits,
  type EngineList,
  type ExportJob,
  type ExportRequest,
  type Health,
  type VoiceList,
} from "@speakkit/protocol";
import { DesktopFault } from "../shared/errors";
import type { PreviewAudio } from "../shared/ipc";
import { APP_CLIENT_HEADER } from "./pairing";

/** The server answered, but not with success: carries the code and message of its error body. */
export class ServerError extends DesktopFault {
  readonly status: number;
  readonly code: string;
  /** `detail` is the diagnostic of the server's error body; without a body the renderer words the HTTP status itself. */
  constructor(status: number, code: string, detail: string | null) {
    super({ code: "server-error", args: { status, detail } });
    this.name = "ServerError";
    this.status = status;
    this.code = code;
  }
}

/** Client for the engine and export routes of the local server (the desktop app talks to its own server over loopback). */
export class ServerApi {
  #base: () => string;
  #token: () => string;
  constructor(base: () => string, token: () => string) {
    this.#base = base;
    this.#token = token;
  }

  async #call(method: string, path: string, { body, signal }: { body?: unknown; signal?: AbortSignal | undefined } = {}): Promise<Response> {
    const res = await fetch(`${this.#base()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.#token()}`, [APP_CLIENT_HEADER]: "1", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });
    if (res.ok) return res;
    const parsed = v.safeParse(errorBodySchema, await res.json().catch(() => null));
    if (!parsed.success) throw new ServerError(res.status, "internal", null);
    const { code, message } = parsed.output.error;
    throw new ServerError(res.status, code, message);
  }

  async #json<T>(schema: v.GenericSchema<unknown, T>, res: Promise<Response>): Promise<T> {
    return v.parse(schema, await (await res).json());
  }

  /** Synthesizes text through POST /v1/speak and collects the whole answer (a sentence or a short preview). */
  async speak({ text, voice, speed }: { text: string; voice: string; speed: number }, signal?: AbortSignal): Promise<PreviewAudio> {
    const res = await this.#call("POST", "/v1/speak", { body: { sentences: [text], voice, speed }, signal });
    if (!res.body) throw new DesktopFault({ code: "no-audio" });
    const dec = new FrameDecoder();
    const out: PreviewAudio = { sampleRate: 24000, chunks: [] };
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const f of dec.push(value)) {
        if (f.header.type === "error") throw new DesktopFault({ code: "unexpected", args: { detail: f.header.message } });
        if (f.header.type === "audio" && f.pcm) {
          out.sampleRate = f.header.sampleRate;
          out.chunks.push(f.pcm);
        }
      }
    }
    return out;
  }

  /** POST /v1/engine/warm: starts loading the model without waiting. */
  async warm(): Promise<void> {
    await this.#call("POST", "/v1/engine/warm");
  }

  health = (signal?: AbortSignal): Promise<Health> => this.#json(healthSchema, this.#call("GET", "/v1/health", { signal }));
  voices = (): Promise<VoiceList> => this.#json(voiceListSchema, this.#call("GET", "/v1/voices"));
  limits = (): Promise<AutomationLimits> => this.#json(automationLimitsSchema, this.#call("GET", "/v1/limits"));
  engines = (): Promise<EngineList> => this.#json(engineListSchema, this.#call("GET", "/v1/engines"));

  startExport = (req: ExportRequest): Promise<ExportJob> => this.#json(exportJobSchema, this.#call("POST", "/v1/export", { body: req }));
  exportStatus = (id: string): Promise<ExportJob> => this.#json(exportJobSchema, this.#call("GET", `/v1/export/${id}`));
  async exportAudio(id: string, signal?: AbortSignal): Promise<Uint8Array> {
    return new Uint8Array(await (await this.#call("GET", `/v1/export/${id}/audio`, { signal })).arrayBuffer());
  }
  async cancelExport(id: string): Promise<void> {
    await this.#call("DELETE", `/v1/export/${id}`);
  }
}
