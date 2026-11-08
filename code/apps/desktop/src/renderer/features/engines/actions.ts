import type { EngineAction } from "../../../shared/engines";
import { api } from "../../ui";

const none = (p: Promise<unknown>): Promise<undefined> => p.then(() => undefined);

/** What each button does. The page sees the new state on its next refresh. */
const PERFORM: Record<EngineAction, () => Promise<undefined>> = {
  download: () => none(api.downloadModel()),
  retry: () => none(api.retryEngine()),
  load: () => none(api.warmEngine()),
};

export const performEngineAction = (a: EngineAction) => PERFORM[a]();
