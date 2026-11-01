import type { PlayerState } from "@speakkit/protocol";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { byLabel, click, installDom, mount, text } from "../../testing/dom";
import { PopupScreen } from "./Popup";
import type { PopupActions, PopupModel } from "./types";

beforeEach(installDom);

const actions = () => {
  const fn = vi.fn();
  const a = new Proxy({} as PopupActions, {
    get:
      (_, k) =>
      (...args: unknown[]) =>
        fn(String(k), ...args.filter((x) => !(x as { nativeEvent?: unknown } | null)?.nativeEvent)),
  });
  return { a, fn };
};

const player = (over: Partial<PlayerState> = {}): PlayerState => ({
  status: "playing",
  docId: "d",
  sentenceIndex: 1,
  sentenceCount: 8,
  elapsedMs: 60_000,
  totalMs: 240_000,
  speed: 1.2,
  voice: "af_heart",
  queueLength: 0,
  ...over,
});
const model = (over: Partial<PopupModel> = {}): PopupModel => ({
  view: "idle",
  title: "Quiet return of local-first software",
  host: "example.com",
  player: null,
  voice: "af_heart",
  speed: 1.2,
  selection: "",
  chars: 9000,
  queued: 0,
  voices: {
    status: "ready",
    default: "af_heart",
    voices: [
      { id: "af_heart", name: "Heart", lang: "en-US", gender: "female", quality: "A" },
      { id: "bm_george", name: "George", lang: "en-GB", gender: "male", quality: "B" },
    ] as never,
  },
  shortcuts: { "read-selection": "Ctrl+Shift+S", "play-pause": "Ctrl+Shift+Y" },
  launch: "idle",
  ...over,
});
const button = (root: Element, name: string) => [...root.querySelectorAll("button")].find((b) => text(b) === name || b.getAttribute("aria-label") === name) ?? null;

describe("problem screens", () => {
  const cases: [PopupModel["view"], string, string, string][] = [
    ["install", "Install Speak Kit to start listening", "Download Speak Kit for Windows", "download"],
    ["offline", "Speak Kit isn't running", "Open Speak Kit", "openApp"],
    ["token", "Pair Speak Kit with this browser again", "Paste new token", "pasteToken"],
    ["version", "Speak Kit needs an update", "Download the latest app", "download"],
    ["pdf", "Chrome's PDF viewer can't be read", "Paste text in the app", "openApp"],
    ["unreadable", "Can't read this page", "Paste text in the app", "openApp"],
    ["fileurl", "Allow access to file URLs", "Open extension settings", "extSettings"],
    ["engine-missing", "The voice engine isn't ready", "Open Speak Kit", "openApp"],
  ];
  test.each(cases)("%s shows its message and a primary action", async (view, title, label, action) => {
    const { a, fn } = actions();
    const m = await mount(<PopupScreen m={model({ view })} a={a} />);
    expect(m.root.querySelector(".pp")!.getAttribute("data-view")).toBe(view);
    expect(text(m.root.querySelector("section[role=alert]"))).toContain(title);
    await click(button(m.root, label));
    expect(fn.mock.calls).toEqual([[action]]);
    await m.unmount();
  });

  test.each([
    ["install", "Not set up"],
    ["offline", "App offline"],
    ["token", "Not paired"],
    ["version", "Update needed"],
    ["engine-missing", "No voice engine"],
  ] as const)("%s sets the header badge to %s", async (view, badge) => {
    const { a } = actions();
    const m = await mount(<PopupScreen m={model({ view })} a={a} />);
    expect(text(m.root.querySelector(".pp-head .lm-pill"))).toBe(badge);
    await m.unmount();
  });

  test("offline: the button reads Starting... while the app starts, and a failed start is explained", async () => {
    const { a } = actions();
    const m = await mount(<PopupScreen m={model({ view: "offline", launch: "starting" })} a={a} />);
    expect(button(m.root, "Starting...")).not.toBeNull();
    expect(text(m.root.querySelector(".pp-launch"))).toBe("Starting Speak Kit...");
    await m.rerender(<PopupScreen m={model({ view: "offline", launch: "failed" })} a={a} />);
    expect(text(m.root.querySelector(".pp-launch"))).toBe("Speak Kit did not start. Open it from the Start menu, or download it first.");
    await m.unmount();
  });

  test("the header settings button opens options", async () => {
    const { a, fn } = actions();
    const m = await mount(<PopupScreen m={model()} a={a} />);
    await click(byLabel(m.root, "Open settings"));
    expect(fn.mock.calls).toEqual([["options"]]);
    await m.unmount();
  });
});

describe("idle and selection", () => {
  test("idle: estimate in the sub line, Listen to this page, From selection disabled without a selection", async () => {
    const { a, fn } = actions();
    const m = await mount(<PopupScreen m={model()} a={a} />);
    expect(text(m.root.querySelector(".pp-sub"))).toBe("example.com · 8:20 at 1.2x");
    expect(button(m.root, "From selection")!.hasAttribute("disabled")).toBe(true);
    await click(button(m.root, "Listen to this page"));
    await click(button(m.root, "Reader view"));
    expect(fn.mock.calls).toEqual([["listenPage"], ["readerView"]]);
    await m.unmount();
  });

  test("idle with an unloaded engine says the voice wakes on play", async () => {
    const { a } = actions();
    const m = await mount(<PopupScreen m={model({ engine: "unloaded" })} a={a} />);
    expect(text(m.root.querySelector(".pp-hint"))).toBe("The voice wakes when you press play. Select text to read just that part.");
    await m.unmount();
  });

  test("selection: quotes the text, cuts it at 160 characters and Listen to selection reads it", async () => {
    const { a, fn } = actions();
    const long = `${"word ".repeat(40)}end.`;
    const m = await mount(<PopupScreen m={model({ view: "selection", selection: long })} a={a} />);
    expect(text(m.root.querySelector(".pp-title"))).toBe("Selected text");
    const quote = text(m.root.querySelector(".pp-quote"));
    expect(quote.endsWith("word wo…”")).toBe(true);
    expect(quote.length).toBe(160);
    await click(button(m.root, "Listen to selection"));
    expect(fn.mock.calls).toEqual([["listenSelection"]]);
    await m.unmount();
  });
});

describe("playback screens", () => {
  test("loading the model shows download progress in percent", async () => {
    const { a } = actions();
    const m = await mount(<PopupScreen m={model({ view: "loading-model", engine: "downloading", engineProgress: 0.4, player: player({ status: "preparing" }) })} a={a} />);
    expect(text(m.root.querySelector(".pp-prog p"))).toBe("Downloading the voice model, 40%.");
    expect(m.root.querySelector('[aria-label="Downloading voice model"]')).not.toBeNull();
    await m.unmount();
  });

  test("waking an unloaded engine says so and Cancel stops", async () => {
    const { a, fn } = actions();
    const m = await mount(<PopupScreen m={model({ view: "loading-model", engine: "unloaded", player: player({ status: "preparing" }) })} a={a} />);
    expect(text(m.root.querySelector(".pp-prog p"))).toBe("Waking the voice engine. This takes a few seconds.");
    expect(text(m.root.querySelector(".pp-head .lm-pill"))).toBe("Waking up");
    await click(button(m.root, "Cancel"));
    expect(fn.mock.calls).toEqual([["stop"]]);
    await m.unmount();
  });

  test("playing: times, Pause and the skip buttons send their commands", async () => {
    const { a, fn } = actions();
    const m = await mount(<PopupScreen m={model({ view: "playing", player: player() })} a={a} />);
    expect(text(m.root.querySelector(".pp-times"))).toBe("1:003:00 left");
    for (const l of ["Pause", "Previous paragraph", "Next paragraph", "Back 10 seconds", "Forward 10 seconds"]) await click(byLabel(m.root, l));
    expect(fn.mock.calls).toEqual([["toggle"], ["block", -1], ["block", 1], ["seekMs", -10000], ["seekMs", 10000]]);
    await m.unmount();
  });

  test("paused offers Play", async () => {
    const { a } = actions();
    const m = await mount(<PopupScreen m={model({ view: "paused", player: player({ status: "paused" }) })} a={a} />);
    expect(byLabel(m.root, "Play")).not.toBeNull();
    await m.unmount();
  });

  test("finished: Replay restarts and the next queued article can be played", async () => {
    const { a, fn } = actions();
    const next = { docId: "n", tabId: 2, title: "Next read", url: "https://news.test/x", sentenceCount: 4, estMs: 300_000 };
    const m = await mount(<PopupScreen m={model({ view: "finished", player: player({ status: "finished", elapsedMs: 240_000 }), next, queued: 2 })} a={a} />);
    expect(text(m.root.querySelector(".pp-times"))).toBe("4:00Finished");
    expect(text(m.root.querySelector(".pp-next"))).toBe("Up next · 1 of 2 queuedNext readnews.test · 5 minPlay next");
    await click(byLabel(m.root, "Replay from the start"));
    await click(button(m.root, "Play next"));
    expect(fn.mock.calls).toEqual([["replay"], ["playNext"]]);
    await m.unmount();
  });
});

describe("speed and voice", () => {
  test("the speed button opens the panel; a preset sets the speed and Reset goes back to 1x", async () => {
    const { a, fn } = actions();
    const m = await mount(<PopupScreen m={model()} a={a} />);
    expect(m.root.querySelector(".pp-speed")).toBeNull();
    await click(byLabel(m.root, "Speed 1.2x"));
    expect(m.root.querySelector(".pp-speed")).not.toBeNull();
    expect(byLabel(m.root, "Speed 1.2x")!.getAttribute("aria-expanded")).toBe("true");
    await click(button(m.root, "2x"));
    await click(button(m.root, "Reset to 1x"));
    expect(fn.mock.calls).toEqual([
      ["setSpeed", 2],
      ["setSpeed", 1],
    ]);
    await click(byLabel(m.root, "Speed 1.2x"));
    expect(m.root.querySelector(".pp-speed")).toBeNull();
    await m.unmount();
  });

  test("the preset that matches the current speed is the pressed one", async () => {
    const { a } = actions();
    const m = await mount(<PopupScreen m={model({ speed: 1.5 })} a={a} />);
    await click(byLabel(m.root, "Speed 1.5x"));
    const pressed = [...m.root.querySelectorAll(".pp-presets button")].filter((b) => b.getAttribute("aria-pressed") === "true").map(text);
    expect(pressed).toEqual(["1.5x"]);
    await m.unmount();
  });

  test("the voice button opens the picker, a voice row selects it and Done returns", async () => {
    const { a, fn } = actions();
    const m = await mount(<PopupScreen m={model()} a={a} />);
    await click(m.root.querySelector(".pp-voicebtn"));
    expect(m.root.querySelector(".sk-voices")).not.toBeNull();
    expect(m.root.querySelector(".pp-actions")).toBeNull();
    const george = [...m.root.querySelectorAll(".sk-voices button")].find((b) => text(b).includes("George"));
    await click(george ?? null);
    expect(fn).toHaveBeenCalledWith("setVoice", "bm_george");
    await click([...m.root.querySelectorAll(".sk-link")].find((b) => text(b).startsWith("Done")) ?? null);
    expect(m.root.querySelector(".sk-voices")).toBeNull();
    await m.unmount();
  });
});

describe("shortcuts", () => {
  test("the home screen lists the commands as Chrome has them assigned", async () => {
    const { a } = actions();
    const m = await mount(<PopupScreen m={model()} a={a} />);
    const rows = [...m.root.querySelectorAll(".pp-keys > div")].map(text);
    expect(rows).toEqual(["Read selectionCtrlShiftS", "Play / pauseCtrlShiftY"]);
    await m.unmount();
  });
});
