import type { APPS } from "./apps";
import type { EXPERIMENTS } from "./experiments";
import type { EXPORT } from "./export";
import type { LIBRARY } from "./library";
import type { MAIN } from "./main";
import type { SETTINGS } from "./settings";
import type { VOICES } from "./voices";
import type { SHELL } from "./shell";

/** The keys of every pack. The English of a pack loads with the code that uses it; the other languages carry all of them in their tables. */
export type PackKey = keyof typeof SHELL | keyof typeof APPS | keyof typeof EXPERIMENTS | keyof typeof EXPORT | keyof typeof LIBRARY | keyof typeof MAIN | keyof typeof SETTINGS | keyof typeof VOICES;
