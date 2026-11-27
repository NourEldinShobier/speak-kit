import { DIVERTED_PERSISTENT, DIVERTED_TEMPORARY, type Control } from "./hidpp";

/** Left and right click: diverting them would take the mouse away from its owner, so they are never diverted. */
export const NEVER_DIVERT: ReadonlySet<number> = new Set([0x50, 0x51]);

const free = (flags: number): boolean => (flags & (DIVERTED_TEMPORARY | DIVERTED_PERSISTENT)) === 0;
const candidate = (c: Control): boolean => c.divertable && !NEVER_DIVERT.has(c.cid);

interface PlanInput {
  controls: readonly Control[];
  /** Buttons a shortcut uses. */
  wanted: ReadonlySet<number>;
  /** Buttons this program diverted earlier. */
  owned: ReadonlySet<number>;
  /** Reporting flags just read, by button; a button whose read failed is missing. */
  flags: ReadonlyMap<number, number>;
}

export interface Plan {
  divert: number[];
  undivert: number[];
}

/**
 * What to change so exactly the wanted buttons are diverted. A button some other program diverted is left alone, and still reports to us.
 * One we diverted that no longer shows our divert (the mouse reset or reconnected) is diverted again. One we diverted that is no longer wanted is released.
 */
export function planDiverts({ controls, wanted, owned, flags }: PlanInput): Plan {
  const usable = new Set(controls.filter(candidate).map((c) => c.cid));
  const divert = [...wanted].filter((cid) => {
    const f = flags.get(cid);
    if (!usable.has(cid) || f === undefined) return false;
    return owned.has(cid) ? (f & DIVERTED_TEMPORARY) === 0 : free(f);
  });
  return { divert, undivert: [...owned].filter((cid) => !wanted.has(cid)) };
}

/** Buttons to divert for the length of a learn: every usable one nobody has diverted. */
export const learnDiverts = (controls: readonly Control[], flags: ReadonlyMap<number, number>): number[] =>
  controls.filter((c) => candidate(c) && flags.has(c.cid) && free(flags.get(c.cid)!)).map((c) => c.cid);

/** Buttons that a learn may report: usable ones, whoever diverted them (diverted buttons report to every reader). */
export const learnable = (controls: readonly Control[]): Set<number> => new Set(controls.filter(candidate).map((c) => c.cid));

/** Presses and releases between two events, which list the buttons held down. */
export function diffPressed(before: ReadonlySet<number>, now: ReadonlySet<number>): { down: number[]; up: number[] } {
  return { down: [...now].filter((c) => !before.has(c)), up: [...before].filter((c) => !now.has(c)) };
}
