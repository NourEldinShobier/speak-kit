import { describe, expect, it } from "vite-plus/test";
import { handleTapEvent } from "./tap-callback";

const setup = (swallow = false) => {
  const log: string[] = [];
  const deps = {
    reenable: () => void log.push("enable"),
    read: (e: string, type: number) => (log.push(`read:${e}`), { type, keycode: 1, flags: 2, userData: 3, button: 0 }),
    onEvent: () => (log.push("event"), swallow),
  };
  return { log, run: (type: number) => handleTapEvent(type, "ev", deps) };
};

describe("event tap callback", () => {
  it.each([0xfffffffe, 0xffffffff])("turns the tap back on when macOS reports it disabled (%i) and does not treat it as a key", (type) => {
    const t = setup();
    expect(t.run(type)).toBe("ev");
    expect(t.log).toEqual(["enable"]);
  });

  it("passes a key on, or swallows it, as the hook decides", () => {
    expect(setup(false).run(10)).toBe("ev");
    const t = setup(true);
    expect(t.run(10)).toBeNull();
    expect(t.log).toEqual(["read:ev", "event"]);
  });
});
