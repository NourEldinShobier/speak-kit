let pending: string | undefined;

/** A capsule asked for a meeting to be opened in History: remembered until the page is there to take it. */
export function requestOpen(id: string): void {
  pending = id;
  window.dispatchEvent(new CustomEvent("speakkit:open-meeting"));
}

export function takeOpen(): string | undefined {
  const id = pending;
  pending = undefined;
  return id;
}
