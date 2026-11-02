import type { EngineInfo, EngineList } from "@speakkit/protocol";
import type { EngineAction } from "../../../shared/engines";
import { api } from "../../ui";

const none = (p: Promise<unknown>): Promise<undefined> => p.then(() => undefined);

/** What each button does. Install, use and remove answer with the new engine list; the others change state the page sees on its next refresh. */
const PERFORM: Record<EngineAction, (e: EngineInfo) => Promise<EngineList | undefined>> = {
  download: () => none(api.downloadModel()),
  retry: () => none(api.retryEngine()),
  load: () => none(api.warmEngine()),
  install: (e) => api.installEngine(e.id),
  use: (e) => api.selectEngine(e.id),
  remove: (e) => api.removeEngine(e.id),
};

export const performEngineAction = (e: EngineInfo, a: EngineAction) => PERFORM[a](e);
