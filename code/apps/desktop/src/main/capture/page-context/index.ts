import type { PageEvent } from "@speakkit/protocol";

export type TimeRange = { from: number; to: number };

const clock = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const quoted = (s: string) => `"${s}"`;

function line(e: PageEvent, from: number): string {
  const at = clock(e.at - from);
  if (e.type === "click") {
    const { tag, role, label, component, path } = e.element;
    const what = [role ?? tag, label && quoted(label), component && `in ${component}`, path && `(${path})`].filter(Boolean).join(" ");
    return `${at} click ${what}`;
  }
  if (e.type === "console-error") return `${at} console error: ${e.message}`;
  return `${at} request failed: ${e.method} ${e.path} ${e.status === 0 ? "no answer" : e.status}`;
}

/** The events of the development page seen while recording, one per line with the time in the recording; undefined when there were none. */
export function pageContextText(events: readonly PageEvent[], from: number): string | undefined {
  if (!events.length) return undefined;
  const page = events[0]!.page;
  return [`Page events from ${page}`, ...events.map((e) => line(e, from))].join("\n");
}

export interface PageContextDeps {
  enabled(): boolean;
  /** The events the local server holds for this time range. */
  events(range: TimeRange): Promise<PageEvent[]>;
}

/** Reads what a development page reported during the recording, when the experiment is on. A failure of any kind gives no text: a capture never waits for it or fails because of it. */
export function createPageContext(d: PageContextDeps): (range: TimeRange) => Promise<string | undefined> {
  return async (range) => {
    if (!d.enabled()) return undefined;
    try {
      return pageContextText(await d.events(range), range.from);
    } catch {
      // the server could not be asked: the capture goes on without page events
      return undefined;
    }
  };
}
