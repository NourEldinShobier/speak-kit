const norm = (entry: string, sep: string) =>
  sep === ";"
    ? entry
        .trim()
        .replace(/[\\/]+$/, "")
        .toLowerCase()
    : entry.trim().replace(/\/+$/, "");

const split = (list: string, sep: string) => list.split(sep).filter((e) => e.trim() !== "");

/** Whether `dir` is one of the entries (Windows compares without case and without a trailing slash). */
export const hasEntry = (list: string, dir: string, sep: string): boolean => split(list, sep).some((e) => norm(e, sep) === norm(dir, sep));

/** The list with `dir` at the end; every other entry stays exactly as written (a `%USERPROFILE%` is not expanded), and a dir already there is not added twice. */
export function addEntry(list: string, dir: string, sep: string): string {
  return hasEntry(list, dir, sep) ? list : [...split(list, sep), dir].join(sep);
}

/** The list without `dir`; all other entries are kept as written. */
export function removeEntry(list: string, dir: string, sep: string): string {
  return split(list, sep)
    .filter((e) => norm(e, sep) !== norm(dir, sep))
    .join(sep);
}
