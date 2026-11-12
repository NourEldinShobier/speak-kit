import type { Frontmost, MacNative, TapEvent } from "./native";

/** A MacNative whose every call is recorded and whose answers the test sets: the macOS side of dictation runs against it without a Mac. */
const initialState = () => ({
  down: new Set<number>(),
  flags: 0,
  secure: false,
  passwordFocused: false,
  front: { pid: 501, bundleId: "com.apple.TextEdit", name: "TextEdit" } as Frontmost | null,
  /** Window bounds by process id; a process not listed has no window on screen. */
  windows: new Map<number, { x: number; y: number; width: number; height: number }>(),
  seq: 1,
  types: [] as string[],
  posted: [] as Array<{ keycode: number; down: boolean; flags: number } | { units: number[] }>,
  acceptPosts: Infinity,
  addTypesOk: true,
  access: "granted" as "granted" | "denied" | "unknown",
  requested: 0,
  /** Process ids `activate` was asked for; an app listed in `running` comes to the front. */
  activated: [] as number[],
  running: new Map<number, Frontmost>(),
});

export function fakeMacNative(opts: { refuseTap?: boolean; refuseMouseTap?: boolean } = {}) {
  const handlers: Partial<Record<"keys" | "mouse", (e: TapEvent) => boolean>> = {};
  const calls = { taps: 0, removed: 0 };
  const state = initialState();
  const post = (item: (typeof state.posted)[number]) => state.posted.length < state.acceptPosts && (state.posted.push(item), true);
  const native: MacNative = {
    createTap(onEvent, kind = "keys") {
      if (opts.refuseTap || (opts.refuseMouseTap && kind === "mouse")) throw new Error("tap refused");
      calls.taps++;
      handlers[kind] = onEvent;
      return { remove: () => void calls.removed++ };
    },
    keyIsDown: (code) => state.down.has(code),
    modifierFlags: () => state.flags,
    postKey: (keycode, down, flags) => post({ keycode, down, flags }),
    postUnits: (units) => post({ units: [...units] }),
    secureInput: () => state.secure,
    passwordFocused: () => state.passwordFocused,
    frontmost: () => state.front,
    windowBounds: (pid) => state.windows.get(pid) ?? null,
    activate(pid) {
      state.activated.push(pid);
      const app = state.running.get(pid);
      if (app) state.front = app;
      return !!app;
    },
    pasteboard: {
      changeCount: () => state.seq,
      types: () => state.types,
      addTypes(types) {
        if (state.addTypesOk) state.types.push(...types);
        return state.addTypesOk;
      },
    },
    inputMonitoring: { status: () => state.access, request: () => (state.requested++, true) },
  };
  return {
    native,
    state,
    calls,
    /** Delivers one event to the installed tap and returns whether it was swallowed. */
    send: (e: Partial<TapEvent> & { keycode: number }) => handlers.keys!({ type: 10, flags: 0, userData: 0, button: 0, ...e }),
    /** Delivers one mouse button event to the installed mouse tap and returns whether it was swallowed. */
    sendMouse: (e: Partial<TapEvent> & { type: number }) => handlers.mouse!({ keycode: 0, flags: 0, userData: 0, button: 0, ...e }),
  };
}
