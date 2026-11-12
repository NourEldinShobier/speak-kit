/** chrome.storage.session for state that must survive the worker being suspended. A failure (area unavailable, quota) resolves quietly: callers fall back to their in-memory or default value. */
export const session = {
  async get<T>(key: string): Promise<T | undefined> {
    try {
      return (await chrome.storage.session.get(key))[key] as T | undefined;
    } catch {
      return undefined;
    }
  },
  async set(key: string, value: unknown): Promise<void> {
    try {
      await chrome.storage.session.set({ [key]: value });
    } catch {
      /* losing the mirror only forgets the value after a worker restart */
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await chrome.storage.session.remove(key);
    } catch {
      /* nothing was stored */
    }
  },
};
