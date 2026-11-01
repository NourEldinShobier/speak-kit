/** The entries of `o` that are set, so an unset env var is left out of an options object instead of passed as `undefined`. */
export function present<T extends Record<string, unknown>>(o: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined)) as { [K in keyof T]?: Exclude<T[K], undefined> };
}
