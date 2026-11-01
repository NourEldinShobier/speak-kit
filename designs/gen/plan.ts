// File structure (Lumen): pages > numbered sections > frames. Frame ids stay stable where a screen survives.
// theme defaults to dark (Lumen draws the dark frame first); "-L" frames are light twins built from the same builder.
export type FD = { id: string; src?: string; theme?: "dark" | "light"; rule?: string; rules?: string[]; tag?: string; title?: string };
export type Sec = { title: string; cover: string; frames: FD[] };
export type Pg = { name: string; sections: Sec[] };

const f = (id: string, rule?: string, o: Partial<FD> = {}): FD => ({ id, rule, ...o });
const later = (id: string, rule?: string): FD => ({ id, rule, tag: "LATER (v1.1)" });
const sup = (id: string, by: string, rule?: string): FD => ({ id, rule, tag: `SUPERSEDED by ${by}` });
/** light twin of a frame: same builder, light tokens */
const L = (id: string, rule?: string, tag?: string): FD => ({ id: `${id}-L`, src: id, theme: "light", rule: rule ?? "Light twin: same layout and radii, only the tokens swap.", tag });

export const PAGES: Pg[] = [
  {
    name: "Research & feature map",
    sections: [
      { title: "Feature map", cover: "what ships in v1 and what waits, per surface", frames: [f("R1", "Every feature sits on one surface and carries v1 or v1.1; nothing is on two."), f("R2", "Surfaces stay separate: extension, desktop app, loopback server, engine.")] },
      { title: "Flows and resources", cover: "the three flows that matter, and the engine lifecycle behind them", frames: [f("R3", "First read in four steps: install, pair, play, and the engine wakes by itself."), f("R4", "The engine unloads when idle and wakes on play; the model never reloads while reading.")] },
      { title: "Lumen patterns adopted", cover: "which Lumen frame each Speak Kit surface copies", frames: [f("R5", "Every Speak Kit surface names the Lumen frame it copies; no new look is invented."), f("R6", "Decisions that shape the UI: local only, no account, no cloud voice.")] },
    ],
  },
  {
    name: "Chrome extension",
    sections: [
      { title: "Toolbar popup", cover: "idle, selection, preparing, playing, paused", frames: [f("A1"), f("A2"), f("A3"), f("A4"), f("A5")] },
      { title: "Popup pickers and finish", cover: "voice, speed and the finished state", frames: [f("A6"), f("A7"), f("A8")] },
      { title: "Popup engine states", cover: "unloaded, waking, loading: the engine wakes on play", frames: [f("A16"), f("A17"), f("A10")] },
      { title: "Popup problems", cover: "app not running or installed, pairing, permissions, unreadable page", frames: [f("A9"), f("A13"), f("A14"), f("A15"), f("A11")] },
      { title: "Read-aloud pill", cover: "Lumen F5 pill on the page: idle, preparing, reading, paused, finished, error, engine states", frames: [
        f("B4", "Pill appears bottom center on first use: play, paragraph count and time, speed, voice."), f("B5", "Preparing shows a spinner in the play button and a looping bar."), f("B6", "Paragraph 2 of 14 · 9 min left, sentence band plus word marker, page follows."),
        f("B7", "Paused keeps the highlight on the last spoken sentence."), f("B8", "Done replaces the text with Read again."), f("B9", "One surface: the pill explains the problem, Open Speak Kit and Retry."),
        f("B22"), f("B23")] },
      { title: "Selecting and starting", cover: "selection bubble, paragraph gutter, context menu, queue toast, back to current", frames: [f("B1"), f("B2"), f("B3"), f("B13"), f("B14")] },
      { title: "Pill popovers and reading settings", cover: "speed, voice and the Reading popover (Sans, Serif, Dyslexic, size, width, theme, highlight)", frames: [f("B15"), f("B16"), f("B24")] },
      { title: "Reader view", cover: "paper and dark reader at full fidelity, with the pill and the Reading popover", frames: [
        f("B10", "Paper reader, 680 px serif column, current sentence block, Reading popover top right, pill below."), f("B12", "Dark reader, same column; Close keeps playback running in the pill."), L("B10", "Light chrome with the paper reader: the reader looks the same in both modes.")] },
      { title: "Edge launcher", cover: "the 14 px tab at the page edge; the expanded vertical pill is replaced by the read-aloud pill", frames: [
        f("B17"), f("B19"), sup("B18", "B4", "Hover now opens the horizontal read-aloud pill (B4), not a vertical one."), sup("B20", "B6", "Expanded reading state is the read-aloud pill (B6)."), sup("B21", "B4", "Dark is the default theme; the vertical pill is gone.")] },
      { title: "Options page", cover: "connection, voice, highlighting, shortcuts, sites, edge launcher", frames: [f("C1"), f("C2"), f("C3"), f("C4"), f("C5"), f("C6"), f("C7"), f("C12")] },
      { title: "Pairing and permissions", cover: "token field and test connection, Open Speak Kit deep link, per-site permissions, shortcut conflict", frames: [f("C13"), f("C14"), f("C15"), f("C16")] },
      { title: "Side panel", cover: "queue and outline, empty queue", frames: [f("C9"), f("C10")] },
      { title: "Responsive options page", cover: "breakpoint rules and the narrow layout below 1025 px", frames: [f("C17"), f("C18")] },
      { title: "Light mode", cover: "light twins for popup, pill, reader, options and side panel", frames: [L("A1"), L("A4"), L("A9"), L("B6"), L("B15"), L("C1"), L("C6"), L("C9")] },
    ],
  },
  {
    name: "Desktop app",
    sections: [
      { title: "First launch and setup", cover: "status screen, then the 960x680 setup window with its 5-step stepper", frames: [f("W0"), f("W1"), f("W2"), f("W2b"), f("W3"), f("W3b"), f("W4"), f("W5")] },
      { title: "Desktop shell", cover: "title bar with search and status pill, 248 px sidebar, inset card, command palette, narrow rail", frames: [f("L1"), f("L2"), f("L3"), f("L4")] },
      { title: "Library", cover: "readings, adding content, search", frames: [later("E1"), later("E2"), later("E3"), later("E4"), later("E5"), later("E7"), later("E8")] },
      { title: "Library actions", cover: "drag and drop, menus, delete, toasts", frames: [later("E6"), later("E14"), later("E15"), later("E9"), later("E10"), later("E16"), later("E12"), later("E13")] },
      { title: "Reader", cover: "playing, paused, preparing, finished, read from here", frames: [later("F1"), later("F2"), later("F3"), later("F4"), later("F5")] },
      { title: "Reader tools", cover: "outline, display settings, sleep timer, speed and voice, search", frames: [later("F6"), later("F7"), later("F8"), later("F9"), later("F14"), later("F15"), later("F16")] },
      { title: "PDF reader", cover: "PDF playing, scanned page, recognizing text", frames: [later("F10"), later("F11"), later("F13")] },
      { title: "Voices and engines", cover: "Kokoro library, detail, engine manager and warnings", frames: [f("G1"), f("G2"), f("G13"), f("G8"), f("G9"), f("G10"), f("G16")] },
      { title: "Voice cloning", cover: "Chatterbox cloning flow, consent and failures", frames: [later("G3"), later("G4"), later("G5"), later("G6"), later("G7"), later("G15"), later("G11"), later("G14")] },
      { title: "Settings: general and playback", cover: "nav 248, search, groups of rows on a 760 px column", frames: [f("H1"), f("H2"), f("H3"), f("H17")] },
      { title: "Settings: browser and shortcuts", cover: "paired browsers, port, token, shortcut recording and conflicts", frames: [f("H4"), f("H5"), f("H11"), f("H16")] },
      { title: "Settings: memory and performance", cover: "idle unload 1/5/15/never, load at startup, battery saver; storage", frames: [f("H12"), f("H13"), f("H6")] },
      { title: "Settings: notifications and startup", cover: "event table, Do not disturb, sign-in start, tray behavior", frames: [f("H14"), f("H15"), f("H7")] },
      { title: "Updates and about", cover: "about, update available, update pill and popover, updating card", frames: [f("H8"), f("H9"), f("H18"), f("H19")] },
      { title: "Engine states", cover: "Unloaded, Loading, Ready across popup, pill, tray and sidebar", frames: [f("O1"), f("O2"), f("O3")] },
      { title: "Tray and mini player", cover: "right-click menu, left-click panel, icon states, mini player storyboard", frames: [f("I10"), f("I11"), f("I3"), f("I9"), f("I13"), sup("I1", "I10", "Longer menu with a now-playing card; replaced by the short native menu plus panel."), sup("I2", "I10"), sup("I7", "I11", "Loading is an icon state and a menu row now."), sup("I8", "I11", "Errors show in the panel and the orange-dot icon.")] },
      { title: "Notifications and shortcuts", cover: "Windows toasts (no buttons), global shortcut toast, clipboard prompt", frames: [f("I12"), f("I4"), f("I5")] },
      { title: "Export audio", cover: "options, rendering, background, done", frames: [later("J1"), later("J2"), later("J3"), later("J5"), later("J6"), later("J7")] },
      { title: "Quit and system states", cover: "quit confirmation, crashes, resources, permissions, offline", frames: [f("K11"), f("K1"), f("K10"), f("K2"), f("K3"), f("K4"), f("K5"), f("K6"), f("K7"), f("K8")] },
      { title: "Edge-state and empty-state boards", cover: "12 edge cases on one board, empty states for every list", frames: [f("K12"), f("E17")] },
      { title: "Light mode", cover: "light twins for shell, setup, settings, voices, tray and states", frames: [L("L1"), L("W1"), L("W3"), L("H1"), L("H12"), L("G1"), L("I10"), L("K1"), L("O1")] },
      { title: "Superseded first-run layouts", cover: "the nine onboarding screens replaced by the setup window", frames: [
        sup("D1", "W1"), sup("D2", "W2"), sup("D3", "W2b"), sup("D4", "W3"), sup("D5", "W3b"), sup("D6", "W4"), sup("D7", "W5"), sup("D9", "W5")] },
    ],
  },
  {
    name: "Foundations & components",
    sections: [
      { title: "Tokens", cover: "color, type, radius, elevation and the Tabler icon set", frames: [f("Q1"), f("Q2")] },
      { title: "Components and states", cover: "buttons, inputs, selection controls, menus, tags in every state", frames: [f("Q3"), L("Q3")] },
      { title: "Desktop components", cover: "title bar, sidebar, settings rows, stepper, banners, toasts, storage bar, code boxes", frames: [f("Q4"), L("Q4")] },
      { title: "Extension components", cover: "pill, Reading popover, bubble, popup header, banners, tooltips", frames: [f("Q5"), L("Q5")] },
    ],
  },
  {
    name: "Motion",
    sections: [
      { title: "Motion tokens", cover: "durations 83/167/250/333/120 ms, easing, spring 420/34", frames: [f("MO1"), L("MO1")] },
      { title: "Per-element rules", cover: "trigger, animation, duration, easing and reduce-motion fallback for 18 elements", frames: [f("MO2"), f("MO3")] },
    ],
  },
];
