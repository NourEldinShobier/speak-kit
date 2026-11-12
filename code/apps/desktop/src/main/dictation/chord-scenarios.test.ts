import { describe, expect, it } from "vite-plus/test";
import { createChordTracker, type Decision } from "./chord-tracker";
import { EXTENDED, VK, type Chord } from "./types";

// Built key strokes, no physical keyboard: each row is a typed sequence and the literal answer for every stroke.
// Stroke: "+name" down, "-name" up. Answer: swallow (S or -), mask (M or -), then the events.
const KEYS: Record<string, number> = {
  RC: VK.rightCtrl,
  LC: VK.leftCtrl,
  RA: VK.rightAlt,
  LA: VK.leftAlt,
  LW: VK.leftWin,
  LS: VK.leftShift,
  SP: VK.space,
  ESC: VK.escape,
  F9: 0x78,
  A: 0x41,
  B: 0x42,
  L: 0x4c,
  ZERO: 0x30,
  NUM7: 0x24,
  HOME: 0x24 + EXTENDED,
};
const NAMES = Object.fromEntries(Object.entries(KEYS).map(([n, vk]) => [vk, n]));

const show = (d: Decision): string =>
  `${d.swallow ? "S" : "-"}${d.mask ? "M" : "-"}:${d.events.map((e) => (e.kind === "other" || e.kind === "grabbed" ? `${e.kind} ${NAMES[e.vk]}` : e.kind)).join(",")}`;

function play(chord: Chord, script: string, grab: number[] = []): string[] {
  const t = createChordTracker(chord);
  t.grab(grab);
  return script.split(" ").map((s) => show(t.feed({ vk: KEYS[s.slice(1)]!, down: s[0] === "+" })));
}

const rows: [name: string, chord: number[], script: string, answer: string[]][] = [
  ["a lone modifier reports down and up and swallows nothing", [VK.rightCtrl], "+RC -RC", ["--:down", "--:up"]],
  ["a modifier held before the chord key is a combination, not a press", [VK.rightCtrl], "+LC +RC -RC -LC", ["--:", "--:", "--:", "--:"]],
  ["Shift held first blocks a lone modifier chord", [VK.rightCtrl], "+LS +RC -RC -LS", ["--:", "--:", "--:", "--:"]],
  ["a key typed during the hold is reported once and reaches the app", [VK.rightCtrl], "+RC +A +B -B -A -RC", ["--:down", "--:other A", "--:other B", "--:", "--:", "--:up"]],
  ["the first key after a release is reported once (it ends a double-tap window)", [VK.rightCtrl], "+RC -RC +A +B", ["--:down", "--:up", "--:other A", "--:"]],
  ["two quick taps give two down and two up events", [VK.rightCtrl], "+RC -RC +RC -RC", ["--:down", "--:up", "--:down", "--:up"]],
  ["a key between two taps is reported, then the next tap starts fresh", [VK.rightCtrl], "+RC -RC +A -A +RC -RC", ["--:down", "--:up", "--:other A", "--:", "--:down", "--:up"]],
  ["key repeat of the held modifier adds no events", [VK.rightCtrl], "+RC +RC +RC -RC", ["--:down", "--:", "--:", "--:up"]],
  ["a function key is swallowed with its repeats and its release", [0x78], "+F9 +F9 -F9", ["S-:down", "S-:", "S-:up"]],
  ["a key already down when the chord key arrives does not stop a plain key chord", [0x78], "+A +F9 -F9 -A", ["--:", "S-:down", "S-:up", "--:"]],
  ["Ctrl+Space: Ctrl passes, only Space is swallowed", [VK.leftCtrl, VK.space], "+LC +SP -SP -LC", ["--:", "S-:down", "S-:up", "--:"]],
  ["Space then Ctrl completes the chord on the modifier, which is never swallowed", [VK.leftCtrl, VK.space], "+SP +LC -LC -SP", ["--:", "--:down", "--:up", "--:"]],
  ["Space alone does nothing", [VK.leftCtrl, VK.space], "+SP -SP", ["--:", "--:"]],
  ["releasing Ctrl first ends the chord, and the Space release is still swallowed", [VK.leftCtrl, VK.space], "+LC +SP -LC -SP", ["--:", "S-:down", "--:up", "S-:"]],
  ["a lone Alt release asks for the menu mask", [VK.leftAlt], "+LA -LA", ["--:down", "-M:up"]],
  ["a lone Win release asks for the menu mask", [VK.leftWin], "+LW -LW", ["--:down", "-M:up"]],
  ["Win+L typed while Win is the chord is passed on, and the Win release is masked", [VK.leftWin], "+LW +L -L -LW", ["--:down", "--:other L", "--:", "-M:up"]],
  ["Alt+0 (Alt first): the mask comes on the Alt release only", [VK.leftAlt, KEYS.ZERO!], "+LA +ZERO -ZERO -LA", ["--:", "S-:down", "S-:up", "-M:"]],
  ["Alt+0 with the number released last: Alt up ends the chord and is masked", [VK.leftAlt, KEYS.ZERO!], "+LA +ZERO -LA -ZERO", ["--:", "S-:down", "-M:up", "S-:"]],
  ["Ctrl+Alt (an AltGr layout) never masks, because Ctrl is not a menu key", [VK.leftCtrl, VK.leftAlt], "+LC +LA -LA -LC", ["--:", "--:down", "-M:up", "--:"]],
  ["the dedicated Home key is the chord, the numpad 7 is not", [KEYS.HOME!], "+NUM7 -NUM7 +HOME -HOME", ["--:", "--:", "S-:down", "S-:up"]],
  ["a grabbed key is swallowed and reported until the grab ends", [VK.rightCtrl], "+ESC -ESC", ["S-:grabbed ESC", "S-:"]],
  ["a key that is not grabbed passes while idle", [VK.rightCtrl], "+ESC -ESC", ["--:", "--:"]],
];

describe("chord tracker over built key strokes", () => {
  for (const [name, chord, script, answer] of rows) {
    const grab = name.startsWith("a grabbed") ? [VK.escape] : [];
    it(name, () => expect(play({ keys: chord }, script, grab)).toEqual(answer));
  }

  it("a shared chord lets the completing key reach the app too", () => {
    expect(play({ keys: [0x78], share: true }, "+F9 -F9")).toEqual(["--:down", "--:up"]);
  });
});

describe("repairs after lost key events", () => {
  const stroke = (vk: number, down: boolean) => ({ vk, down });

  it("Win+L: the Win release goes to the lock screen, the next press still counts as a fresh one", () => {
    const t = createChordTracker({ keys: [VK.leftWin] });
    expect(t.feed(stroke(VK.leftWin, true)).events).toEqual([{ kind: "down" }]);
    expect(t.rebuild(() => false)).toEqual([{ kind: "up" }]);
    expect(t.feed(stroke(VK.leftWin, true)).events).toEqual([{ kind: "down" }]);
  });

  it("a repair never reports a press for a key the keyboard says is down but the hook never saw", () => {
    const t = createChordTracker({ keys: [VK.rightCtrl] });
    expect(t.rebuild(() => true)).toEqual([]);
    expect(t.active).toBe(false);
    expect(t.unseenDown(() => true)).toBe(true);
  });

  it("a repair that finds the chord key still down changes nothing", () => {
    const t = createChordTracker({ keys: [VK.rightCtrl] });
    t.feed(stroke(VK.rightCtrl, true));
    expect(t.rebuild(() => true)).toEqual([]);
    expect(t.active).toBe(true);
  });

  it("a key found up that was not part of the chord is forgotten without an event", () => {
    const t = createChordTracker({ keys: [VK.rightCtrl] });
    t.feed(stroke(VK.rightCtrl, true));
    t.feed(stroke(0x41, true));
    expect(t.rebuild((vk) => vk === VK.rightCtrl)).toEqual([]);
    expect(t.feed(stroke(0x41, true)).events).toEqual([{ kind: "other", vk: 0x41 }]);
  });

  it("after a lost release of a swallowed key the repair frees the key for the next press", () => {
    const t = createChordTracker({ keys: [0x78] });
    t.feed(stroke(0x78, true));
    expect(t.rebuild(() => false)).toEqual([{ kind: "up" }]);
    expect(t.feed(stroke(0x78, true))).toEqual({ swallow: true, events: [{ kind: "down" }] });
  });
});
