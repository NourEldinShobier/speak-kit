import type { AutomationHost } from "@speakkit/server";
import { SLOT_NAMES } from "../../shared/dictation/conflicts";
import "../../shared/settings/builtin-experiments";
import { experiments, toggled } from "../../shared/settings/experiments";
import type { ConfigPatch } from "../../shared/schemas";
import type { Ctx } from "../context";
import type { DictationService } from "../dictation/service";
import type { Reading } from "../reader/service";
import type { AutomationInfo, CommandLineAction } from "../../shared/control/info";
import type { AgentSkill } from "../agent-skill";
import type { CommandLine } from "../cli-path";
import { manualInstallCommand } from "../cli-path/manual";
import { openTryCommand, type Terminal } from "../cli-terminal";
import { createCommands, type ControlDeps } from "./commands";
import { discoveryFile } from "./discovery";
import { createControlServer } from "./server";

interface Parts {
  reading: Pick<Reading, "readText" | "command">;
  automation: AutomationHost;
  commandLine: CommandLine;
  agentSkill: AgentSkill;
  terminal: Terminal;
  /** The folder of the shipped launcher, when this is an installed app. */
  shippedDir: string | undefined;
  dictation: DictationService;
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

function settingsDeps(ctx: Ctx, p: Parts, sync: () => void): ControlDeps["settings"] {
  return {
    snapshot: () => ({ voice: ctx.config.voice, speed: ctx.config.speed, controlServer: ctx.config.controlServer, ...dictationKeys(ctx.config.dictation) }),
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
      if (change.app.controlServer !== undefined) setTimeout(sync, 300).unref(); // after this reply has been sent
      ctx.publish();
      return undefined;
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
    history: { list: async (q) => d.history.list(q.search, q.limit) },
    warn: (message, detail) => ctx.log.warn(message, detail),
    settings: settingsDeps(ctx, p, sync),
  };
}

/** The local control server and its commands, wired to the running app. Started and stopped with the `controlServer` setting. */
export function setupControl(ctx: Ctx, p: Parts) {
  const sync = (): void => void (ctx.config.controlServer ? server.start() : server.stop()).catch((e) => ctx.log.warn("control server", String(e)));
  const server = createControlServer({ dataDir: p.dataDir, version: p.version, dispatch: createCommands(controlDeps(ctx, p, sync)) });
  sync();
  const info = async (): Promise<AutomationInfo> => ({
    running: server.running,
    discoveryFile: discoveryFile(p.dataDir),
    commandLine: await p.commandLine.status(),
    skill: await p.agentSkill.status(),
    manualInstall: manualInstallCommand(process.platform, p.shippedDir),
  });
  return {
    server,
    /** The IPC methods of the Automation page. */
    handlers: {
      automationInfo: info,
      resetControlToken: async () => (await server.resetToken(), info()),
      commandLine: async (action: CommandLineAction) => (await p.commandLine[action](), info()),
      installAgentSkill: async () => (await p.agentSkill.install(), info()),
      testInTerminal: async () => openTryCommand(await p.commandLine.status(), p.terminal, p.shippedDir),
    },
    onConfigPatch: (patch: ConfigPatch) => {
      if (patch.controlServer !== undefined) sync();
    },
    dispose: () => server.stop(),
  };
}
