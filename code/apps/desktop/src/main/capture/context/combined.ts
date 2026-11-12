import type { PageEvent } from "@speakkit/protocol";
import type { CaptureConfig } from "../../../shared/capture/settings";
import { createPageContext, type TimeRange } from "../page-context";
import { createAgentContext } from ".";

/** The text that goes with a capture: the labels of the window recorded and what a development page reported, each only when its experiment is on. */
export function createCaptureContext(o: {
  settings(): CaptureConfig;
  os: string;
  pageEvents(from: number, to: number): Promise<PageEvent[]>;
}): (sourceId: string | undefined, range: TimeRange) => Promise<string | undefined> {
  const windowText = createAgentContext({ enabled: () => o.settings().experiments.agentContext, os: o.os });
  const pageText = createPageContext({ enabled: () => o.settings().experiments.pageContext, events: (r) => o.pageEvents(r.from, r.to) });
  return async (sourceId, range) => [await windowText(sourceId), await pageText(range)].filter(Boolean).join("\n\n") || undefined;
}
