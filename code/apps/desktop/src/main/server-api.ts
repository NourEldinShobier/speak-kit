import * as v from "valibot";
import { FrameDecoder, type EngineId, type EngineList, type ExportJob, type ExportRequest } from "@speakkit/protocol";
import type { PreviewAudio } from "../shared/ipc";
import { EngineListSchema, ErrorBodySchema, ExportJobSchema } from "../shared/server-schemas";

/** The server answered, but not with success: carries the code and message of its error body. */
export class ServerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ServerError";
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

  async #call(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
    const res = await fetch(`${this.#base()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.#token()}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
    if (res.ok) return res;
    const parsed = v.safeParse(ErrorBodySchema, await res.json().catch(() => null));
    throw parsed.success
      ? new ServerError(res.status, parsed.output.error.code, parsed.output.error.message)
      : new ServerError(res.status, "internal", `The server answered HTTP ${res.status}.`);
  }

  async #json<T>(schema: v.GenericSchema<unknown, T>, res: Promise<Response>): Promise<T> {
    return v.parse(schema, await (await res).json());
  }

  /** Synthesizes text through POST /v1/speak and collects the whole answer (a sentence or a short preview). */
  async speak(text: string, voice: string, speed: number, signal?: AbortSignal): Promise<PreviewAudio> {
    const res = await this.#call("POST", "/v1/speak", { sentences: [text], voice, speed }, signal);
    if (!res.body) throw new Error("The server sent no audio.");
    const dec = new FrameDecoder();
    const out: PreviewAudio = { sampleRate: 24000, chunks: [] };
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const f of dec.push(value)) {
        if (f.header.type === "error") throw new Error(f.header.message);
        if (f.header.type === "audio" && f.pcm) {
          out.sampleRate = f.header.sampleRate;
          out.chunks.push(f.pcm);
        }
      }
    }
    return out;
  }

  engines = (): Promise<EngineList> => this.#json(EngineListSchema, this.#call("GET", "/v1/engines"));
  selectEngine = (id: EngineId) => this.#json(EngineListSchema, this.#call("POST", "/v1/engines/select", { id }));
  installEngine = (id: EngineId) => this.#json(EngineListSchema, this.#call("POST", `/v1/engines/${id}/install`));
  removeEngine = (id: EngineId) => this.#json(EngineListSchema, this.#call("DELETE", `/v1/engines/${id}`));

  startExport = (req: ExportRequest): Promise<ExportJob> => this.#json(ExportJobSchema, this.#call("POST", "/v1/export", req));
  exportStatus = (id: string): Promise<ExportJob> => this.#json(ExportJobSchema, this.#call("GET", `/v1/export/${id}`));
  async exportAudio(id: string, signal?: AbortSignal): Promise<Uint8Array> {
    return new Uint8Array(await (await this.#call("GET", `/v1/export/${id}/audio`, undefined, signal)).arrayBuffer());
  }
  async cancelExport(id: string): Promise<void> {
    await this.#call("DELETE", `/v1/export/${id}`);
  }
}
