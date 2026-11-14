import { labelsOf } from "./labels";
import { createContextReader, handleOfSource, type ContextReader } from "./readers";

/**
 * The text of an agent context: the labels of the controls in the window that was recorded (the window in front for a screen or an area, never this app's own), when the experiment is on. Off by default, and a failure of
 * any kind gives no text rather than an error, so a capture never waits for it or fails because of it.
 */
export function createAgentContext(o: { enabled(): boolean; reader?: ContextReader | undefined; os: string; pid?: number }): (sourceId?: string) => Promise<string | undefined> {
  const reader = "reader" in o ? o.reader : createContextReader(o.os);
  return async (sourceId) => {
    if (!o.enabled() || !reader) return undefined;
    const nodes = await reader.read({ windowHandle: handleOfSource(sourceId), ownPid: o.pid ?? process.pid });
    return (nodes && labelsOf(nodes)) || undefined;
  };
}
