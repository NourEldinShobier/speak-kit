import type { SttModel, SttModelId } from "./catalog";
import type { IdleDeps } from "./idle";
import type { SttLanguage } from "./languages";

export interface SwitchDeps {
  current(): SttModelId;
  downloaded(id: SttModelId): Promise<boolean>;
  /** Loads the model and warms it up; throws when it cannot be used. The engine holds one model, so the old one is unloaded by this. */
  load(id: SttModelId): Promise<void>;
  /** Stops a load in progress and unloads. */
  abort(): Promise<void>;
  /** Saves the choice. Only called once the new model has loaded. */
  save(id: SttModelId): void;
  recording(): boolean;
}

export type SwitchResult = { ok: true } | { ok: false; reason: "recording" | "not-downloaded" | "busy" | "cancelled" | "failed"; message: string };

const MESSAGES = {
  recording: "Finish the recording first, then switch.",
  "not-downloaded": "That model is not downloaded.",
  busy: "Another switch is still running.",
  cancelled: "The switch was cancelled. The previous model is back in use.",
} as const;

/**
 * Switches the speech model without risking dictation: the choice is saved only after the new model has loaded, and when it fails or is cancelled the old
 * model is loaded again, so a failed switch leaves dictation as it was. Not during a recording, and never two switches at once.
 */
export class ModelSwitcher {
  readonly #d: SwitchDeps;
  #target: SttModelId | undefined;
  #cancelled = false;

  constructor(deps: SwitchDeps) {
    this.#d = deps;
  }

  /** The model being switched to, while a switch runs. */
  get switching(): SttModelId | undefined {
    return this.#target;
  }

  async switchTo(id: SttModelId): Promise<SwitchResult> {
    if (this.#d.recording()) return { ok: false, reason: "recording", message: MESSAGES.recording };
    if (this.#target) return { ok: false, reason: "busy", message: MESSAGES.busy };
    const old = this.#d.current();
    if (id === old) return { ok: true };
    if (!(await this.#d.downloaded(id))) return { ok: false, reason: "not-downloaded", message: MESSAGES["not-downloaded"] };
    this.#target = id;
    this.#cancelled = false;
    try {
      await this.#d.load(id);
      if (this.#cancelled) throw new Error("cancelled");
      this.#d.save(id);
      return { ok: true };
    } catch (e) {
      const cancelled = this.#cancelled;
      await this.#d.load(old).catch(() => undefined); // dictation goes on with what it had
      return cancelled
        ? { ok: false, reason: "cancelled", message: MESSAGES.cancelled }
        : { ok: false, reason: "failed", message: `${id} could not be loaded: ${e instanceof Error ? e.message : String(e)}. The previous model is still in use.` };
    } finally {
      this.#target = undefined;
    }
  }

  /** Cancel entry of the tray menu. */
  async cancel(): Promise<void> {
    if (!this.#target) return;
    this.#cancelled = true;
    await this.#d.abort().catch(() => undefined);
  }
}

/** Automatic switching: when the keyboard layout or the app in front matches a rule, its model (and language) is used. */
export interface SwitchRule {
  id: string;
  /** Keyboard layout, "de" or "de-DE"; a short code matches every region. */
  layout?: string | undefined;
  /** Program name, with or without .exe. */
  app?: string | undefined;
  model: SttModelId;
  language?: SttLanguage | undefined;
}

export interface RuleContext {
  layout?: string | undefined;
  app?: string | undefined;
}

const stem = (s: string) => s.toLowerCase().replace(/\.exe$/, "");
const layoutMatches = (rule: string, layout: string) => {
  const r = rule.toLowerCase();
  const l = layout.toLowerCase();
  return l === r || l.startsWith(`${r}-`);
};

export interface RuleMatch {
  /** The first rule that applies and whose model is on disk. */
  rule: SwitchRule | undefined;
  /** Rules that apply but were skipped because their model is not downloaded; the page says so on the rule. */
  skipped: SwitchRule[];
}

export function matchRule(rules: readonly SwitchRule[], ctx: RuleContext, downloaded: ReadonlySet<string>): RuleMatch {
  const skipped: SwitchRule[] = [];
  for (const rule of rules) {
    if (!rule.layout && !rule.app) continue; // a rule that names nothing would match everything
    if (rule.layout && !(ctx.layout && layoutMatches(rule.layout, ctx.layout))) continue;
    if (rule.app && !(ctx.app && stem(rule.app) === stem(ctx.app))) continue;
    if (!downloaded.has(rule.model)) skipped.push(rule);
    else return { rule, skipped };
  }
  return { rule: undefined, skipped };
}

export const RULE_WAIT_MS = 300;

export interface AutoSwitchDeps {
  enabled(): boolean;
  rules(): readonly SwitchRule[];
  downloaded(): ReadonlySet<string>;
  current(): { model: SttModelId; language: SttLanguage };
  recording(): boolean;
  apply(model: SttModelId, language: SttLanguage | undefined): Promise<unknown>;
  timers?: Pick<IdleDeps, "setTimeout" | "clearTimeout">;
}

/** Waits for the context to stay the same for 300 ms, holds back during a recording, and applies the matching rule only when it changes something. */
export class AutoSwitch {
  readonly #d: AutoSwitchDeps;
  #ctx: RuleContext = {};
  #timer: unknown;
  #held = false;
  #skipped: SwitchRule[] = [];

  constructor(d: AutoSwitchDeps) {
    this.#d = d;
  }

  get skipped(): readonly SwitchRule[] {
    return this.#skipped;
  }

  update(ctx: RuleContext): void {
    this.#ctx = ctx;
    const t = this.#d.timers ?? { setTimeout: (f: () => void, ms: number) => setTimeout(f, ms), clearTimeout: (h: unknown) => clearTimeout(h as NodeJS.Timeout) };
    if (this.#timer !== undefined) t.clearTimeout(this.#timer);
    this.#timer = t.setTimeout(() => {
      this.#timer = undefined;
      void this.evaluate();
    }, RULE_WAIT_MS);
  }

  /** Call when a recording ends: a switch held back during it happens now. */
  recordingEnded(): void {
    if (this.#held) void this.evaluate();
  }

  async evaluate(): Promise<void> {
    if (!this.#d.enabled()) return;
    if (this.#d.recording()) {
      this.#held = true;
      return;
    }
    this.#held = false;
    const m = matchRule(this.#d.rules(), this.#ctx, this.#d.downloaded());
    this.#skipped = m.skipped;
    const now = this.#d.current();
    if (!m.rule || (m.rule.model === now.model && (m.rule.language ?? now.language) === now.language)) return;
    await this.#d.apply(m.rule.model, m.rule.language);
  }
}

/** A newer model that replaces one the person has installed, unless they dismissed the hint for it. Never switches or downloads on its own. */
export function newerModelHint(
  catalog: readonly Pick<SttModel, "id" | "name" | "replaces">[],
  installed: ReadonlySet<string>,
  dismissed: readonly string[],
): { id: SttModelId; name: string; replaces: SttModelId } | undefined {
  const m = catalog.find((c) => c.replaces && installed.has(c.replaces) && !installed.has(c.id) && !dismissed.includes(c.id));
  return m?.replaces ? { id: m.id, name: m.name, replaces: m.replaces } : undefined;
}
