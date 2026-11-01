import { globalShortcut } from "electron";
import type { Api } from "../shared/ipc";
import { DEFAULT_SHORTCUTS, type ShortcutId } from "../shared/shortcuts";
import type { Ctx } from "./context";
import { ShortcutRegistry, type ShortcutApi } from "./shortcuts";

/**
 * The global shortcuts and the IPC methods that change them. Tests simulate the OS: a real registration would clash with an
 * installed Speak Kit and cannot be pressed from Playwright, so `fakeKeys` holds the registered accelerators and `foreign` the ones another app owns.
 */
export function setupShortcuts(ctx: Ctx, actions: Record<ShortcutId, () => void>, test: boolean) {
  const fakeKeys = new Map<string, () => void>();
  const foreign = new Set<string>();
  const osApi: ShortcutApi = test
    ? {
        register: (a, cb) => !foreign.has(a) && !fakeKeys.has(a) && (fakeKeys.set(a, cb), true),
        unregister: (a) => void fakeKeys.delete(a),
      }
    : globalShortcut;
  const registry = new ShortcutRegistry(osApi, (id) => actions[id]());
  const apply = () => {
    ctx.state.shortcuts = { bindings: { ...ctx.config.shortcuts }, conflicts: registry.apply(ctx.config.shortcuts) };
  };
  apply();

  const handlers = {
    setShortcut: async (id, accelerator) => {
      const r = registry.set(ctx.config.shortcuts, id, accelerator);
      if (!r.ok) return r.conflict ? { ok: false, error: r.error, conflict: r.conflict } : { ok: false, error: r.error };
      ctx.config.shortcuts = { ...ctx.config.shortcuts, [id]: accelerator };
      ctx.saveConfig();
      apply();
      ctx.publish();
      return { ok: true };
    },
    resetShortcuts: async () => {
      ctx.config.shortcuts = { ...DEFAULT_SHORTCUTS };
      ctx.saveConfig();
      apply();
      return ctx.publish();
    },
  } satisfies Partial<Api>;

  return {
    handlers,
    unregisterAll: () => registry.unregisterAll(),
    testHook: {
      pressShortcut: (accelerator: string) => fakeKeys.get(accelerator)?.(),
      registeredShortcuts: () => [...fakeKeys.keys()].sort(),
      foreignShortcuts: (list: string[]) => {
        foreign.clear();
        list.forEach((a) => foreign.add(a));
        apply();
        ctx.publish();
      },
    },
  };
}
