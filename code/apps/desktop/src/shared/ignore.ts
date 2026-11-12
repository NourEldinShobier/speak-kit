/** For a promise whose failure changes nothing (best-effort cleanup): `promise.catch(ignore)`. */
export function ignore(): void {
  // nothing to do: the work was optional
}
