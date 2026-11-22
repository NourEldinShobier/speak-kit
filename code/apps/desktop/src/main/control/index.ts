import { plainText } from "@speakkit/transcripts";
import type { AutomationHost } from "@speakkit/server";
import { SLOT_NAMES } from "../../shared/dictation/conflicts";
import "../../shared/settings/builtin-experiments";
import { experiments, toggled } from "../../shared/settings/experiments";
import type { Ctx } from "../context";
import type { DictationService } from "../dictation/service";
import type { Handlers as TranscriptHandlers } from "../transcripts/handlers";
import type { Reading } from "../reader/service";
import { createCommands, type ControlDeps } from "./commands";
import { createControlServer } from "./server";

interface Parts {
  reading: Pick<Reading, "readText" | "command">;
  automation: AutomationHost;
  dictation: DictationService;
  transcripts: Pick<TranscriptHandlers, "importFile" | "get">;
  dataDir: string;
  version: string;
}

const busy = (d: DictationService): boolean => d.state.status !== "idle" && d.state.status !== "error";

/** Longer than the longest recording, so a queued change only gives up when dictation is stuck. */
const IDLE_WAIT_MS = 10 * 60_000;

/** Runs `fn` once dictation is idle, checking again every quarter second; `giveUp` runs instead after `IDLE_WAIT_MS`. */
function whenIdle(d: DictationService, fn: () => void, giveUp: () => void): void {
  const until = Date.now() + IDLE_WAIT_MS;
  const check = (): void => {
    if (!busy(d)) fn();
    else if (Date.now() >= until) giveUp();
    else setTimeout(check, 250).unref();
  };
  check();
}

/** The dictation settings the way a script names them: `dictation.<key>`. */
const dictationKeys = (c: Ctx["config"]["dictation"]): Record<string, unknown> => Object.fromEntries(Object.entries(c).map(([k, v]) => [`dictation.${k}`, v]));

function settingsDeps(ctx: Ctx, p: Parts): ControlDeps["settings"] {
  return {
    snapshot: () => ({ voice: ctx.config.voice, speed: ctx.config.speed, ...dictationKeys(ctx.config.dictation) }),
    busy: () => busy(p.dictation),
    whenIdle: (fn, giveUp) => whenIdle(p.dictation, fn, giveUp),
    async apply(change) {
      // Dictation first: a refused shortcut must leave every other setting of the same call unsaved too.
      if (Object.keys(change.dictation).length) {
        const { rejected } = await p.dictation.patchSettings(change.dictation);
        if (rejected) return `That shortcut is already used by ${SLOT_NAMES[rejected.with]}.`;
      }
      Object.assign(ctx.config, change.app);
      ctx.saveConfig();
      ctx.publish();
      return undefined;
    },
  };
}

/** The transcripts store as the `transcribe` command sees it: the words of a job exist once it is done. */
function transcriptsDeps(t: Parts["transcripts"]): ControlDeps["transcripts"] {
  return {
    importFile: t.importFile,
    job: async (id) => {
      const d = await t.get(id);
      if (!d) return undefined;
      const { status, chunksDone, chunksTotal, failure } = d;
      return { id, status, chunksDone, chunksTotal, ...(failure && { failure }), ...(status === "done" && { text: plainText(d.segments) }) };
    },
  };
}

/** What the commands need, taken from the running app. */
function controlDeps(ctx: Ctx, p: Parts): ControlDeps {
  const d = p.dictation;
  return {
    version: p.version,
    status: () => ({
      dictation: { supported: d.supported, enabled: ctx.config.dictation.enabled, phase: d.state.status, paused: d.controls.paused },
      reader: { status: ctx.state.reader.status },
      voice: ctx.config.voice,
    }),
    readText: (text) => p.reading.readText(text, "text"),
    readerCommand: (c) => p.reading.command(c),
    automation: p.automation,
    voices: async () => (await ctx.server.voices()).voices.map((v) => ({ id: v.id, name: v.name })),
    labs: {
      known: (id) => {
        const e = experiments().find((x) => x.id === id);
        if (!e) return "no";
        return e.audience === "dev" && ctx.state.packaged ? "dev-only" : "yes";
      },
      set: async (id, on) => {
        ctx.config.experiments = toggled(ctx.config.experiments, id, on);
        ctx.saveConfig();
        ctx.publish();
      },
    },
    voice: {
      get: () => ctx.config.voice,
      set: (id) => {
        ctx.config.voice = id;
        ctx.saveConfig();
        ctx.publish();
      },
    },
    dictation: {
      supported: () => d.supported && ctx.config.dictation.enabled && !!d.core,
      capture: (opts) => d.core!.capture(opts),
      start: () => d.core?.start(),
      stop: () => d.core?.stop(),
      cancel: () => d.core?.cancel(),
      busy: () => busy(d),
    },
    transcripts: transcriptsDeps(p.transcripts),
    history: { list: async (q) => d.history.list(q.search, q.limit) },
    warn: (message, detail) => ctx.log.warn(message, detail),
    settings: settingsDeps(ctx, p),
  };
}

/** The local control server and its commands, wired to the running app. It starts at once and stops with the app. */
export function setupControl(ctx: Ctx, p: Parts) {
  const server = createControlServer({ dataDir: p.dataDir, version: p.version, dispatch: createCommands(controlDeps(ctx, p)) });
  server.start().catch((e) => ctx.log.warn("control server", String(e)));
  return { dispose: () => server.stop() };
}
