import type { Frontmost, MacNative, TapEvent } from "./native";

/** A MacNative whose every call is recorded and whose answers the test sets: the macOS side of dictation runs against it without a Mac. */
const initialState = () => ({
  down: new Set<number>(),
  flags: 0,
  secure: false,
  front: { pid: 501, bundleId: "com.apple.TextEdit", name: "TextEdit" } as Frontmost | null,
  seq: 1,
  types: [] as string[],
  posted: [] as Array<{ keycode: number; down: boolean; flags: number } | { units: number[] }>,
  acceptPosts: Infinity,
  addTypesOk: true,
  access: "granted" as "granted" | "denied" | "unknown",
  requested: 0,
});

export function fakeMacNative(opts: { refuseTap?: boolean } = {}) {
  let handler: ((e: TapEvent) => boolean) | undefined;
  const calls = { taps: 0, removed: 0 };
  const state = initialState();
  const native: MacNative = {
    createTap(onEvent) {
      if (opts.refuseTap) throw new Error("tap refused");
      calls.taps++;
      handler = onEvent;
      return { remove: () => void calls.removed++ };
    },
    keyIsDown: (code) => state.down.has(code),
    modifierFlags: () => state.flags,
    postKey(keycode, down, flags) {
      if (state.posted.length >= state.acceptPosts) return false;
      state.posted.push({ keycode, down, flags });
      return true;
    },
    postUnits(units) {
      if (state.posted.length >= state.acceptPosts) return false;
      state.posted.push({ units: [...units] });
      return true;
    },
    secureInput: () => state.secure,
    frontmost: () => state.front,
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
    send: (e: Partial<TapEvent> & { keycode: number }) => handler!({ type: 10, flags: 0, userData: 0, ...e }),
  };
}
