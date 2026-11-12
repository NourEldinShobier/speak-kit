/** Pure helpers for a PATH-style list (semicolons on Windows, colons elsewhere). */
const trimEnd = (s: string) => s.replace(/[\\/]+$/, "");
const same = (a: string, b: string, win: boolean) => (win ? trimEnd(a).toLowerCase() === trimEnd(b).toLowerCase() : trimEnd(a) === trimEnd(b));

const split = (list: string, win: boolean) => list.split(win ? ";" : ":").filter(Boolean);

export const hasDir = (list: string, dir: string, win: boolean): boolean => split(list, win).some((d) => same(d, dir, win));

/** The list with `dir` at the end; unchanged when it is already there. */
export const addDir = (list: string, dir: string, win: boolean): string => (hasDir(list, dir, win) ? list : [...split(list, win), dir].join(win ? ";" : ":"));

/** The list without `dir`; other entries keep their order and spelling. */
export const removeDir = (list: string, dir: string, win: boolean): string =>
  split(list, win)
    .filter((d) => !same(d, dir, win))
    .join(win ? ";" : ":");
