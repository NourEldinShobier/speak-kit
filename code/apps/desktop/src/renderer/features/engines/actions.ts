import type { EngineInfo, EngineList } from "@speakkit/protocol";
import type { EngineAction } from "../../../shared/engines";
import { api } from "../../ui";

const none = (p: Promise<unknown>): Promise<undefined> => p.then(() => undefined);

/** Retry for an optional engine: make it the engine in use (when it is not) and load it now. Kokoro's retry restarts the app's own model host. */
const retryOptional = async (e: EngineInfo) => {
  const list = await api.selectEngine(e.id);
  await api.warmEngine();
  return list;
};

/** What each button does. Install, use and remove answer with the new engine list; the others change state the page sees on its next refresh. */
const PERFORM: Record<EngineAction, (e: EngineInfo) => Promise<EngineList | undefined>> = {
  download: () => none(api.downloadModel()),
  retry: (e) => (e.id === "kokoro" ? none(api.retryEngine()) : retryOptional(e)),
  load: () => none(api.warmEngine()),
  install: (e) => api.installEngine(e.id),
  cancel: (e) => api.cancelInstall(e.id),
  fallback: () => api.selectEngine("kokoro"),
  use: (e) => api.selectEngine(e.id),
  remove: (e) => api.removeEngine(e.id),
};

export const performEngineAction = (e: EngineInfo, a: EngineAction) => PERFORM[a](e);
