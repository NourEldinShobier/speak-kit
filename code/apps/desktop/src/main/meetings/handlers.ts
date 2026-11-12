import { allProviders, userProvider, type Meetings, type Provider } from "@speakkit/meetings";
import type { AddAppResult, Device, MeetingsBridge, ProviderView, Push, SettingsView } from "../../shared/meetings/contract";
import { BUILT_IN_PROVIDERS } from "@speakkit/meetings";
import type { MeetingsConfig } from "../../shared/meetings/settings";
import { checkAccelerator, normalize } from "../../shared/shortcuts";
import type { MeetingsPorts } from "./service";
import type { CallWatch } from "./watch";
import type { MeetingRecording } from "./session";

export type Handlers = Omit<MeetingsBridge, "onPush" | "rec" | "capsule">;

export interface HandlerEnv {
  core: Meetings;
  ports: MeetingsPorts;
  watch: CallWatch;
  recording: MeetingRecording;
  cfg(): MeetingsConfig;
  folder(): string;
  saveConfig(): void;
  /** The shortcut or settings changed. */
  configChanged(): void;
  live(): Push;
  /** Applies the retention at once, after the person changed it. */
  sweep(): Promise<unknown>;
}

const hint = (p: Provider) => (p.inBrowser && !p.exes.length ? "In Chrome, Edge and other browsers" : undefined);

/** Every call app with its policy. */
export function providerViews(cfg: MeetingsConfig, added: Provider[]): ProviderView[] {
  return allProviders(added).map((p) => ({ id: p.id, name: p.name, mark: p.mark, userAdded: !!p.userAdded, ...(hint(p) && { hint: hint(p)! }), policy: cfg.policies[p.id] ?? "ask" }));
}

/** The apps the person added, as providers (an app that cannot be built is left out, not an error on every start). */
export function addedProviders(cfg: MeetingsConfig): Provider[] {
  const out: Provider[] = [];
  for (const a of cfg.apps) {
    const r = userProvider({ name: a.name, ...(a.exe && { exe: a.exe }), ...(a.link && { link: a.link }) }, [...BUILT_IN_PROVIDERS, ...out]);
    if (r.ok) out.push(r.provider);
  }
  return out;
}

/** Listing, reading and changing meetings. */
function listing({ core, ports }: HandlerEnv): Pick<Handlers, "list" | "get" | "rename" | "trash" | "restore" | "remove" | "retry" | "regenerateNotes" | "applyVocabulary" | "since" | "ack"> {
  return {
    list: async (q) => core.list(q ?? {}),
    get: async (id) => (await core.get(id)) ?? null,
    rename: (id, title) => core.rename(id, title),
    trash: (id) => core.trash(id),
    restore: (id) => core.restore(id),
    remove: (id) => core.remove(id),
    retry: (id) => core.retry(id),
    regenerateNotes: (id) => core.regenerateNotes(id),
    applyVocabulary: (id) => core.applyVocabulary(id),
    since: async (seq) => core.since(seq),
    ack: (c, seq) => core.ack(c, seq).then(() => void ports.changed()),
  };
}

/** Copy, files and Show in folder. */
function exporting({ core, ports }: HandlerEnv): Pick<Handlers, "copyNew" | "copyText" | "writeFiles" | "reveal"> {
  return {
    copyNew: async (id) => {
      const text = await core.copyNew(id);
      if (text) ports.clipboard.writeText(text);
      return !!text;
    },
    copyText: async (id, part) => {
      const d = await core.get(id);
      if (!d) return false;
      const lines = part ? d.lines.filter((l) => l.start >= part.from && l.start < part.to) : d.lines;
      ports.clipboard.writeText(lines.map((l) => l.text).join("\n"));
      return true;
    },
    writeFiles: (id) => core.writeFiles(id),
    reveal: async (id) => {
      const d = await core.get(id);
      const file = d?.files[0];
      if (file) ports.shell.reveal(file);
      return !!file;
    },
  };
}

const failed = (message: string) => ({ ok: false as const, failure: { code: "failed", message } });

/** Starting and stopping by hand. */
function recording(env: HandlerEnv): Pick<Handlers, "start" | "stop" | "push"> {
  return {
    start: async () => {
      if (env.recording.active) return failed("A meeting is already being recorded.");
      return env.recording.start({ providerId: "manual", providerName: "Meeting" });
    },
    stop: () => env.recording.stop(),
    push: async () => env.live(),
  };
}

/** The settings page. */
function settingsOf(env: HandlerEnv): Pick<Handlers, "settings" | "patchSettings" | "setPolicy" | "addApp" | "removeApp" | "chooseFolder" | "openFolder" | "devices"> {
  const { ports, cfg } = env;
  const view = async (): Promise<SettingsView> => {
    const n = env.core.notice();
    const rows = env.core.list();
    const call = env.watch.activeCall;
    return {
      config: { ...cfg() },
      providers: providerViews(cfg(), addedProviders(cfg())),
      folder: env.folder(),
      storage: { audioBytes: rows.reduce((t, r) => t + r.audioBytes, 0), count: rows.length },
      notice: { newer: n.newer, ...(n.recoveredFrom && { recoveredFrom: n.recoveredFrom }) },
      capabilities: ports.platform.capabilities(),
      callApp: call ?? null,
      keySaved: await ports.keySaved(),
      invalid: [],
    };
  };
  const change = async (apply: () => void): Promise<SettingsView> => {
    apply();
    env.saveConfig();
    env.configChanged();
    void env.sweep();
    return view();
  };
  return {
    settings: view,
    patchSettings: (patch) =>
      change(() => {
        const { shortcut, ...rest } = patch;
        Object.assign(cfg(), rest);
        // A shortcut the system would refuse is not saved; the page shows the old one again.
        if (shortcut !== undefined && (shortcut === "" || checkAccelerator(shortcut) === null)) cfg().shortcut = shortcut === "" ? "" : normalize(shortcut)!;
      }),
    setPolicy: (id, policy) => change(() => void (cfg().policies = { ...cfg().policies, [id]: policy })),
    addApp: async (app): Promise<AddAppResult> => {
      const r = userProvider(app, allProviders(addedProviders(cfg())));
      if (!r.ok) return r;
      return { ok: true, view: await change(() => void (cfg().apps = [...cfg().apps, { name: app.name.trim(), ...(app.exe && { exe: app.exe }), ...(app.link && { link: app.link }) }])) };
    },
    removeApp: (id) => {
      const added = addedProviders(cfg());
      const at = added.findIndex((p) => p.id === id);
      return change(() => {
        if (at < 0) return;
        cfg().apps = cfg().apps.filter((a) => a.name !== added[at]!.name);
        const { [id]: _gone, ...rest } = cfg().policies;
        cfg().policies = rest;
      });
    },
    chooseFolder: async () => {
      const dir = await ports.dialog.pickFolder();
      return dir ? change(() => void (cfg().folder = dir)) : null;
    },
    openFolder: () => ports.shell.openFolder(env.folder()),
    devices: async (): Promise<{ inputs: Device[]; outputs: Device[] }> => ports.devices(),
  };
}

/** What the window calls: each method is one thing the person can do, answered from the store, the recorder or the OS ports. */
export function createHandlers(env: HandlerEnv): Handlers {
  return { ...listing(env), ...exporting(env), ...recording(env), ...settingsOf(env) };
}
