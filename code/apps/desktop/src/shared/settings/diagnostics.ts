import type { Activity } from "../ipc";
import { at } from "../i18n";
import "../i18n/packs/settings";

export interface RedactContext {
  /** Home folder and user name of this computer; both are replaced. */
  home?: string;
  user?: string;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Removes what must not leave the computer in a pasted report: folders under the home directory, the user name, e-mail addresses, API keys and the pairing token. */
export function redactReport(text: string, ctx: RedactContext = {}): string {
  let out = text;
  if (ctx.home) {
    const forms = new Set([ctx.home, ctx.home.replaceAll("\\", "/"), ctx.home.replaceAll("/", "\\")]);
    for (const h of forms) out = out.replace(new RegExp(esc(h), "gi"), "~");
  }
  if (ctx.user && ctx.user.length > 2) out = out.replace(new RegExp(`\\b${esc(ctx.user)}\\b`, "gi"), "user");
  return out
    .replace(/\b(?:sk|ek)[-_][A-Za-z0-9_-]{8,}/g, "[key removed]")
    .replace(/\b[0-9a-f]{32,}\b/gi, "[token removed]")
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[email removed]")
    .replace(/Bearer\s+\S+/g, "Bearer [removed]");
}

export interface ReportInput {
  version: string;
  platform: string;
  arch: string;
  osVersion: string;
  cpu: string;
  cores: number;
  ramGb: number;
  packaged: boolean;
  engine: string;
  listener: string;
  updateChannel: string;
  /** Settings that matter for support; never keys or paths. */
  settings: Record<string, string | number | boolean>;
  /** Newest last. */
  activity: Pick<Activity, "atMs" | "kind" | "title" | "body">[];
  logTail: string[];
}

const iso = (ms: number) => new Date(ms).toISOString();

/** The text Copy diagnostics puts on the clipboard, already redacted. */
export function buildReport(i: ReportInput, ctx: RedactContext = {}): string {
  const lines = [
    `Speak Kit ${i.version} (${i.packaged ? "installed" : "from source"}, channel ${i.updateChannel})`,
    `System: ${i.platform} ${i.arch}, ${i.osVersion}`,
    `Hardware: ${i.cpu}, ${i.cores} cores, ${i.ramGb} GB memory`,
    `Voice engine: ${i.engine}`,
    `Listener: ${i.listener}`,
    "",
    "Settings",
    ...Object.entries(i.settings).map(([k, v]) => `  ${k}: ${String(v)}`),
    "",
    "Recent activity",
    ...(i.activity.length ? i.activity.slice(-20).map((a) => `  ${iso(a.atMs)} ${a.kind}: ${a.title}${a.body ? ` - ${a.body}` : ""}`) : ["  none"]),
    "",
    "Log (last lines)",
    ...(i.logTail.length ? i.logTail.slice(-40).map((l) => `  ${l}`) : ["  empty"]),
  ];
  return redactReport(lines.join("\n"), ctx);
}

export type ActivityFilter = "all" | "errors" | "updates" | "exports";

export const ACTIVITY_FILTERS: readonly { id: ActivityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "errors", label: "Errors" },
  { id: "updates", label: "Updates" },
  { id: "exports", label: "Exports" },
];

const FILTER_KINDS: Record<Exclude<ActivityFilter, "all">, Activity["kind"][]> = { errors: ["error"], updates: ["update"], exports: ["export"] };

/** Newest first, narrowed to one kind of event. */
export function filterActivity(list: readonly Activity[], f: ActivityFilter): Activity[] {
  const kinds = f === "all" ? null : FILTER_KINDS[f];
  return list.filter((a) => !kinds || kinds.includes(a.kind)).sort((a, b) => b.atMs - a.atMs);
}

/** Plain-language row: what happened, without the raw event. */
export function activityRow(a: Activity): { title: string; detail: string } {
  const prefix: Record<Activity["kind"], string> = {
    error: at("s.diag.kind.error"),
    pair: at("s.diag.kind.pair"),
    info: at("s.diag.kind.info"),
    export: at("s.diag.kind.export"),
    update: at("s.diag.kind.update"),
    reading: at("s.diag.kind.reading"),
  };
  return { title: a.title, detail: a.body ? `${prefix[a.kind]}: ${a.body}` : prefix[a.kind] };
}

/** Keeps the last `n` lines of a text, dropping a half line cut by the read window. */
export function tailLines(text: string, n: number, cut = false): string[] {
  const all = text.split(/\r?\n/);
  if (cut) all.shift();
  return all.filter(Boolean).slice(-n);
}
