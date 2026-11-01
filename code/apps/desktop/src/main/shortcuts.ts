import {
  checkAccelerator,
  duplicateIds,
  normalize,
  SHORTCUT_IDS,
  suggestAlternative,
  type Bindings,
  type ShortcutConflict,
  type ShortcutId,
} from "../shared/shortcuts";

/** The part of Electron's globalShortcut this module uses. */
export interface ShortcutApi {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}

export type Conflicts = Partial<Record<ShortcutId, ShortcutConflict>>;
export type SetResult = { ok: true; conflicts: Conflicts } | { ok: false; error: string; conflict?: ShortcutConflict };

/** Holding the keys repeats the shortcut; actions closer together than this are one press. */
const REPEAT_GAP_MS = 400;

/** Registers the user's global shortcuts with the OS and reports clashes; it never takes a combination another app owns. */
export class ShortcutRegistry {
  #api: ShortcutApi;
  #run: (id: ShortcutId) => void;
  #now: () => number;
  #registered: string[] = [];
  #lastRun = new Map<ShortcutId, number>();

  constructor(api: ShortcutApi, run: (id: ShortcutId) => void, now: () => number = Date.now) {
    this.#api = api;
    this.#run = run;
    this.#now = now;
  }

  /** Replaces every registration with `bindings`. Returns the ones that could not be registered. */
  apply(bindings: Bindings): Conflicts {
    this.unregisterAll();
    const conflicts: Conflicts = {};
    const dup = duplicateIds(bindings);
    const taken = new Set(Object.values(bindings).map((a) => normalize(a) ?? a));
    const claimed = new Set<string>();
    for (const id of SHORTCUT_IDS) {
      const acc = normalize(bindings[id]) ?? bindings[id];
      if (dup.has(id) && claimed.has(acc)) {
        conflicts[id] = { accelerator: acc, reason: "duplicate", suggestion: suggestAlternative(acc, taken) };
        continue;
      }
      if (this.#api.register(acc, () => this.#fire(id))) {
        this.#registered.push(acc);
        claimed.add(acc);
      } else conflicts[id] = { accelerator: acc, reason: "taken", suggestion: suggestAlternative(acc, taken) };
    }
    return conflicts;
  }

  /** Changes one binding. When the OS refuses it the old set is restored and the conflict is returned. */
  set(current: Bindings, id: ShortcutId, raw: string): SetResult {
    const why = checkAccelerator(raw);
    if (why) return { ok: false, error: why };
    const accelerator = normalize(raw)!;
    const next = { ...current, [id]: accelerator };
    const others = SHORTCUT_IDS.filter((o) => o !== id && normalize(current[o]) === accelerator);
    if (others.length) {
      const taken = new Set(Object.values(next).map((a) => normalize(a) ?? a));
      return { ok: false, error: "Another SpeakKit action already uses it.", conflict: { accelerator, reason: "duplicate", suggestion: suggestAlternative(accelerator, taken) } };
    }
    const conflicts = this.apply(next);
    const mine = conflicts[id];
    if (!mine) return { ok: true, conflicts };
    this.apply(current);
    return { ok: false, error: "Another app is using it.", conflict: mine };
  }

  unregisterAll() {
    for (const a of this.#registered.splice(0)) this.#api.unregister(a);
  }

  #fire(id: ShortcutId) {
    const now = this.#now();
    const last = this.#lastRun.get(id);
    if (last !== undefined && now - last < REPEAT_GAP_MS) return;
    this.#lastRun.set(id, now);
    this.#run(id);
  }
}
