export interface LabDef {
  title: string;
  description: string;
  /** Who the lab is for; developer labs are hidden from the Experiments page until the developer toggle is on. */
  audience: "everyone" | "developers";
  group: "App" | "Developer";
}

/** The one registration of every lab. A lab that omits its audience or group does not compile; its id is the key used in the config file, the CLI and speakkit://lab/<id>. */
export const LABS = {
  "hide-tray-icon": {
    title: "Hide the tray icon",
    description: "Remove the icon from the system tray or menu bar. Open Speak Kit from the Start menu, Dock or its shortcut instead.",
    audience: "everyone",
    group: "App",
  },
  "verbose-log": {
    title: "Detailed log",
    description: "Write debug lines to the log file. Useful when reporting a problem; the file grows faster.",
    audience: "developers",
    group: "Developer",
  },
} as const satisfies Record<string, LabDef>;

export type LabId = keyof typeof LABS;
export const LAB_IDS = Object.keys(LABS) as LabId[];
export type LabsState = Record<LabId, boolean>;
export const isLabId = (s: string): s is LabId => Object.hasOwn(LABS, s);

/** Labs a person may see: developer labs only when asked for. */
export const visibleLabs = (developer: boolean): LabId[] => LAB_IDS.filter((id) => developer || LABS[id].audience === "everyone");

/** Exit codes of `labs`: 0 ok, 2 bad usage, 3 unknown lab. */
export interface LabsResult {
  code: 0 | 2 | 3;
  out: string;
  /** The new state to save when the command changed something. */
  next?: LabsState;
}

const USAGE = "usage: labs list | labs on <lab> | labs off <lab>";

/** `labs list|on|off` — pure: takes the current state, returns what to print and what to save. */
export function runLabsCommand(args: readonly string[], state: LabsState): LabsResult {
  const [verb, id, ...rest] = args;
  if (verb === "list" && id === undefined) return { code: 0, out: LAB_IDS.map((l) => `${l}\t${state[l] ? "on" : "off"}\t${LABS[l].audience}\t${LABS[l].title}`).join("\n") };
  if ((verb !== "on" && verb !== "off") || id === undefined || rest.length) return { code: 2, out: USAGE };
  if (!isLabId(id)) return { code: 3, out: `unknown lab "${id}". Known: ${LAB_IDS.join(", ")}` };
  return { code: 0, out: `${id} ${verb}`, next: { ...state, [id]: verb === "on" } };
}

/** The args after a leading `labs`, or null when the command line is not a labs command (flags such as --hidden come first and are skipped). */
export function labsArgs(argv: readonly string[]): string[] | null {
  const i = argv.indexOf("labs");
  return i < 0 ? null : argv.slice(i + 1);
}
