import type { CaptureHandle, CaptureResult } from "@speakkit/dictation";
import { CAPABILITIES, CONTROL_VERSION, fail, LIMITS, ok, type Command, type ControlRequest, type Reply } from "../../shared/control/contract";
import { skillText } from "../../shared/control/skill";
import { COMMAND_LINE_KEYS, validateChange, type SettingsChange } from "../../shared/control/settings-registry";
import type { ReaderCommand } from "../../shared/reader";

export interface HistoryRow {
  id: string;
  at: number;
  text: string;
  app?: string;
  kind?: string;
}

/** What the commands need from the app. Every part is a plain function, so the commands run in a test with no app. */
export interface ControlDeps {
  version: string;
  status(): { dictation: { supported: boolean; enabled: boolean; phase: string; paused: boolean }; reader: { status: string }; voice: string };
  readText(text: string): boolean;
  readerCommand(c: ReaderCommand): void;
  voice: { get(): string; set(id: string): void };
  dictation: {
    supported(): boolean;
    capture(opts: { raw: boolean }): CaptureHandle;
    /** A plain dictation that pastes, started and stopped like the Start and Stop buttons. */
    start(): void;
    stop(): void;
    cancel(): void;
    busy(): boolean;
  };
  history: { list(q: { search?: string; limit?: number }): Promise<HistoryRow[]> };
  settings: {
    snapshot(): Record<string, unknown>;
    /** Resolves to the message of a refusal (a clashing shortcut), or nothing when the change was saved. */
    apply(change: Extract<SettingsChange, { ok: true }>): Promise<string | void>;
    busy(): boolean;
    /** Runs `fn` once dictation is idle; `giveUp` runs instead when that takes too long. */
    whenIdle(fn: () => void, giveUp: () => void): void;
  };
  /** Anything a command does after its reply was sent and that failed. */
  warn(message: string, detail: string): void;
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/** Waits for a capture, up to `ms`. A capture that takes longer is cancelled, so it cannot outlive the command that wanted it. */
async function awaitCapture(c: CaptureHandle, ms: number): Promise<CaptureResult> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<CaptureResult>((resolve) => {
    timer = setTimeout(() => {
      c.cancel();
      resolve({ ok: false, code: "cancelled" });
    }, ms);
  });
  try {
    return await Promise.race([c.result, late]);
  } finally {
    clearTimeout(timer);
  }
}

const captureReply = (r: CaptureResult): Reply => {
  if (r.ok) return ok({ text: r.text });
  if (r.code === "no-speech") return fail("no-speech", "No speech was heard.");
  if (r.code === "busy") return fail("busy", "A dictation is already running.");
  if (r.code === "cancelled") return fail("cancelled", "The recording was cancelled.");
  return fail("failed", `Dictation failed (${r.code}).`);
};

type Args = Record<string, unknown>;
type Handler = (a: Args) => Reply | Promise<Reply>;

/** Start, stop and cancel of a dictation, with the print capture that belongs to the command that started it. */
function createDictate(d: ControlDeps): Handler {
  let printing: { handle: CaptureHandle; done: Promise<Reply> } | undefined;

  const startPrint = (raw: boolean): Reply | Promise<Reply> => {
    if (printing) return fail("busy", "A print capture is already running.");
    const handle = d.dictation.capture({ raw });
    // The capture belongs to the command: it answers when the capture ends, however it ends (stop, cancel, the shortcut, a failure, the time limit).
    const done = awaitCapture(handle, LIMITS.printWaitMs * 5).then((r) => {
      printing = undefined;
      return captureReply(r);
    });
    printing = { handle, done };
    return done;
  };

  const stop = (): Reply | Promise<Reply> => {
    if (!printing) return d.dictation.busy() ? (d.dictation.stop(), ok({})) : fail("refused", "Nothing is being recorded.");
    printing.handle.finish();
    return Promise.race([printing.done, new Promise<Reply>((r) => setTimeout(() => r(fail("timeout", "The text did not arrive in time.")), LIMITS.printWaitMs))]);
  };

  return (args) => {
    const action = str(args.action) ?? "start";
    if (!d.dictation.supported()) return fail("unsupported", "Dictation is not available on this computer.");
    if (action === "stop") return stop();
    if (action === "cancel") return ((printing?.handle ?? d.dictation).cancel(), ok({}));
    if (action !== "start") return fail("usage", `Unknown action "${action}".`);
    if (args.print === true) return startPrint(args.raw === true);
    if (d.dictation.busy()) return fail("busy", "A dictation is already running.");
    d.dictation.start();
    return ok({});
  };
}

/** Reading and writing settings through the one validator. */
function createSettings(d: ControlDeps): Handler {
  return async (args) => {
    const set = args.set;
    if (set === undefined) {
      const key = str(args.get);
      const all = d.settings.snapshot();
      if (key === undefined) return ok({ settings: all });
      return key in all ? ok({ key, value: all[key] }) : fail("usage", `Unknown setting "${key}".`);
    }
    if (!set || typeof set !== "object" || Array.isArray(set)) return fail("usage", "set takes an object of settings.");
    const change = validateChange(set as Record<string, unknown>, COMMAND_LINE_KEYS);
    if (!change.ok) return fail("refused", change.message);
    // A change made during a recording waits, so it cannot change the shortcut or the model under it.
    if (d.settings.busy()) {
      d.settings.whenIdle(
        () =>
          void Promise.resolve(d.settings.apply(change)).then(
            (refused) => refused && d.warn("queued setting refused", refused),
            (e) => d.warn("queued setting failed", String(e)),
          ),
        () => d.warn("queued setting dropped", "dictation stayed busy"),
      );
      return ok({ queued: true });
    }
    const refused = await d.settings.apply(change);
    return refused ? fail("refused", refused) : ok({ applied: true });
  };
}

/** The commands of the control server, the command line and the MCP server: one place, so they cannot drift apart. */
export function createCommands(d: ControlDeps): (req: ControlRequest) => Promise<Reply> {
  const reader =
    (type: "pause" | "resume" | "stop"): Handler =>
    () => (d.readerCommand({ type }), ok({}));
  const handlers: Record<Command, Handler> = {
    capabilities: () => ok({ app: d.version, ...CAPABILITIES }),
    status: () => ok({ app: d.version, ...d.status() }),
    read: (a) => {
      const text = str(a.text)?.trim();
      if (!text) return fail("usage", "read needs some text.");
      return d.readText(text) ? ok({}) : fail("refused", "There is nothing to read.");
    },
    pause: reader("pause"),
    resume: reader("resume"),
    stop: reader("stop"),
    voice: (a) => {
      const id = str(a.set);
      if (id === undefined) return ok({ voice: d.voice.get() });
      if (!id || id.length > 64) return fail("usage", "A voice id is 1 to 64 characters.");
      d.voice.set(id);
      return ok({ voice: id });
    },
    dictate: createDictate(d),
    settings: createSettings(d),
    history: async (a) => {
      const limit = typeof a.limit === "number" ? Math.min(200, Math.max(1, Math.floor(a.limit))) : 20;
      const search = str(a.search);
      return ok({ entries: await d.history.list({ limit, ...(search && { search }) }) });
    },
    meetings: () => fail("unsupported", "Meetings are not available in this version."),
    speak: () => fail("unsupported", "Speaking a file to audio is not available in this version."),
    skill: () => ok({ text: skillText(CONTROL_VERSION, d.version) }),
  };
  return async (req) => handlers[req.command](req.args ?? {});
}
