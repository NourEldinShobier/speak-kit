import * as v from "valibot";
import {
  automationErrorSchema,
  automationExportSchema,
  automationLimitsSchema,
  automationQueueSchema,
  automationSpeakResultSchema,
  automationStatusSchema,
  capabilitiesSchema,
  parseVoiceList,
  type AutomationExport,
  type AutomationLimits,
  type AutomationQueue,
  type AutomationSpeakRequest,
  type AutomationSpeakResult,
  type AutomationStatus,
  type Capabilities,
  type VoiceList,
} from "@speakkit/protocol";
import type { Connection } from "./discover";
import { CliError } from "./errors";
import { orNull } from "./or-null";
import { parseSse } from "./sse";

/** A control call that takes longer than this is given up (the server's own deadline is 8 s). */
const CALL_TIMEOUT_MS = 15_000;

type Fetch = typeof fetch;

/** The app marks its own calls to its server with this header so they never count as a browser pairing; scripts are the app's own tool, not a browser. */
const APP_HEADER = "x-speakkit-app";

/** The running app as seen from a script: typed calls, and every failure becomes a CliError with a code. */
export class AppClient {
  readonly #c: Connection;
  readonly #fetch: Fetch;
  readonly #timeoutMs: number;
  constructor(c: Connection, fetcher: Fetch = fetch, timeoutMs = CALL_TIMEOUT_MS) {
    this.#c = c;
    this.#fetch = fetcher;
    this.#timeoutMs = timeoutMs;
  }

  async #send(path: string, init: RequestInit = {}, timeout: number | null = this.#timeoutMs): Promise<Response> {
    let res: Response;
    try {
      res = await this.#fetch(`${this.#c.base}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${this.#c.token}`, [APP_HEADER]: "1", ...(init.body !== undefined && { "Content-Type": "application/json" }), ...init.headers },
        ...(timeout !== null && { signal: AbortSignal.timeout(timeout) }),
      });
    } catch (e) {
      if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) throw new CliError("timeout");
      throw new CliError("not_running", `Speak Kit is not running on ${this.#c.base}.`);
    }
    if (res.ok) return res;
    throw await failure(res);
  }

  async #json<T>(schema: v.GenericSchema<unknown, T>, path: string, init?: RequestInit): Promise<T> {
    const res = await this.#send(path, init);
    const r = v.safeParse(schema, await orNull(res.json()));
    if (!r.success) throw new CliError("failed", `Speak Kit answered ${path} in a form this tool does not know. Update both to the same version.`);
    return r.output;
  }

  limits = (): Promise<AutomationLimits> => this.#json(automationLimitsSchema, "/v1/limits");
  capabilities = (): Promise<Capabilities> => this.#json(capabilitiesSchema, "/v1/capabilities");
  status = (): Promise<AutomationStatus> => this.#json(automationStatusSchema, "/v1/automation/status");
  queue = (): Promise<AutomationQueue> => this.#json(automationQueueSchema, "/v1/automation/queue");
  speak = (req: AutomationSpeakRequest): Promise<AutomationSpeakResult> => this.#json(automationSpeakResultSchema, "/v1/automation/speak", { method: "POST", body: JSON.stringify(req) });
  stop = (clear: boolean): Promise<AutomationStatus> => this.#json(automationStatusSchema, "/v1/automation/stop", { method: "POST", body: JSON.stringify({ clear }) });
  startExport = (text: string, out: string): Promise<AutomationExport> => this.#json(automationExportSchema, "/v1/automation/export", { method: "POST", body: JSON.stringify({ text, out }) });
  exportStatus = (id: string): Promise<AutomationExport> => this.#json(automationExportSchema, `/v1/automation/export/${encodeURIComponent(id)}`);

  async voices(): Promise<VoiceList> {
    const res = await this.#send("/v1/voices");
    const list = parseVoiceList(await orNull(res.json()));
    if (!list) throw new CliError("failed", "Speak Kit answered /v1/voices in a form this tool does not know.");
    return list;
  }

  /** Status events until the caller stops iterating or the app goes away (that throws not_running). */
  async *events(signal?: AbortSignal): AsyncGenerator<AutomationStatus> {
    const res = await this.#send("/v1/automation/events", signal ? { signal } : {}, null);
    if (!res.body) throw new CliError("failed", "the event stream had no body");
    try {
      for await (const e of parseSse(res.body)) {
        if (e.event !== "status") continue;
        const r = v.safeParse(automationStatusSchema, safeJson(e.data));
        if (r.success) yield r.output;
      }
    } catch (e) {
      if (signal?.aborted) return;
      throw e instanceof CliError ? e : new CliError("not_running", "Speak Kit stopped answering.");
    }
    if (!signal?.aborted) throw new CliError("not_running", "Speak Kit closed the event stream.");
  }
}

const safeJson = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

/** The typed error of a failed response: the automation body when there is one, else a code chosen from the HTTP status. */
async function failure(res: Response): Promise<CliError> {
  const body: unknown = await orNull(res.json());
  const typed = v.safeParse(automationErrorSchema, body);
  if (typed.success) return new CliError(typed.output.code, typed.output.error.message);
  if (res.status === 401) return new CliError("token_rejected");
  if (res.status === 429) return new CliError("queue_full", "Speak Kit is busy; try again in a moment.");
  const message = v.safeParse(v.object({ error: v.object({ message: v.string() }) }), body);
  return new CliError(res.status === 400 ? "invalid_input" : "failed", message.success ? message.output.error.message : `Speak Kit answered HTTP ${res.status}.`);
}
