import type { ConfigPatch } from "../../shared/schemas";
import type { Ctx } from "../context";
import type { DictationService } from "../dictation/service";
import type { Reading } from "../reader/service";
import { createCommands, type ControlDeps } from "./commands";
import { discoveryFile, removeDiscoverySync } from "./discovery";
import { createControlServer } from "./server";

interface Parts {
  reading: Pick<Reading, "readText" | "command">;
  dictation: DictationService;
  dataDir: string;
  version: string;
}

const busy = (d: DictationService): boolean => d.state.status !== "idle" && d.state.status !== "error";

/** Runs `fn` once dictation is idle, checking again every quarter second. */
function whenIdle(d: DictationService, fn: () => void): void {
  if (busy(d)) setTimeout(() => whenIdle(d, fn), 250).unref();
  else fn();
}

/** The dictation settings the way a script names them: `dictation.<key>`. */
const dictationKeys = (c: Ctx["config"]["dictation"]): Record<string, unknown> => Object.fromEntries(Object.entries(c).map(([k, v]) => [`dictation.${k}`, v]));

function settingsDeps(ctx: Ctx, p: Parts, sync: () => void): ControlDeps["settings"] {
  return {
    snapshot: () => ({ voice: ctx.config.voice, speed: ctx.config.speed, controlServer: ctx.config.controlServer, ...dictationKeys(ctx.config.dictation) }),
    busy: () => busy(p.dictation),
    whenIdle: (fn) => whenIdle(p.dictation, fn),
    async apply(change) {
      Object.assign(ctx.config, change.app);
      ctx.saveConfig();
      if (change.app.controlServer !== undefined) setTimeout(sync, 300).unref(); // after this reply has been sent
      if (Object.keys(change.dictation).length) await p.dictation.patchSettings(change.dictation);
      ctx.publish();
    },
  };
}

/** What the commands need, taken from the running app. */
function controlDeps(ctx: Ctx, p: Parts, sync: () => void): ControlDeps {
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
    history: { list: async (q) => d.history.list(q.search) },
    settings: settingsDeps(ctx, p, sync),
  };
}

/** The local control server and its commands, wired to the running app. Started and stopped with the `controlServer` setting. */
export function setupControl(ctx: Ctx, p: Parts) {
  const sync = (): void => void (ctx.config.controlServer ? server.start() : server.stop()).catch((e) => ctx.log.warn("control server", String(e)));
  const server = createControlServer({ dataDir: p.dataDir, version: p.version, dispatch: createCommands(controlDeps(ctx, p, sync)) });
  sync();
  return {
    server,
    onConfigPatch: (patch: ConfigPatch) => {
      if (patch.controlServer !== undefined) sync();
    },
    dispose: () => {
      removeDiscoverySync(discoveryFile(p.dataDir), process.pid);
      return server.stop();
    },
  };
}
