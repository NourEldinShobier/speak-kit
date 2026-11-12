import { labelsOf } from "./labels";
import { createContextReader, type ContextReader } from "./readers";

export { labelsOf } from "./labels";

/**
 * The text of an agent context: the labels of the controls in the window in front, when the experiment is on. Off by default, and a failure of
 * any kind gives no text rather than an error, so a capture never waits for it or fails because of it.
 */
export function createAgentContext(o: { enabled(): boolean; reader?: ContextReader | undefined; os: string }): () => Promise<string | undefined> {
  const reader = "reader" in o ? o.reader : createContextReader(o.os);
  return async () => {
    if (!o.enabled() || !reader) return undefined;
    const nodes = await reader.read();
    return (nodes && labelsOf(nodes)) || undefined;
  };
}
