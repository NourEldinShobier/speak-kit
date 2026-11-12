/** The result of `work`, or null when it fails: for reads where a missing or unreadable file, a closed stream or a body that is not JSON all mean "nothing there". */
export async function orNull<T>(work: Promise<T>): Promise<T | null> {
  try {
    return await work;
  } catch {
    return null;
  }
}
