import type { EngineList } from "@speakkit/protocol";
import type { EngineAction } from "../../../shared/engines";

interface EnginesState {
  /** The server's list; null before the first answer or when it failed. */
  list: EngineList | null;
  error: string | null;
  /** "<engine id>:<action>" while that action runs. */
  busy: string | null;
}

export type EnginesAction =
  | { type: "list"; list: EngineList }
  | { type: "list-failed"; message: string }
  | { type: "busy"; key: string | null }
  | { type: "action-done"; list?: EngineList | undefined }
  | { type: "action-failed"; message: string };

export const initEngines = (): EnginesState => ({ list: null, error: null, busy: null });

export function enginesReducer(s: EnginesState, a: EnginesAction): EnginesState {
  switch (a.type) {
    case "list":
      return { ...s, list: a.list, error: null };
    case "list-failed":
      return { ...s, list: null, error: a.message };
    case "busy":
      return { ...s, busy: a.key };
    case "action-done":
      return { ...s, list: a.list ?? s.list, error: null };
    case "action-failed":
      return { ...s, error: a.message };
    default: {
      const unreachable: never = a;
      return unreachable;
    }
  }
}

export const ACTION_LABELS: Record<EngineAction, string> = {
  download: "Download",
  load: "Load now",
  retry: "Retry",
};

export const ENGINE_BLURBS: Record<string, string> = {
  kokoro: "Natural English voices, runs on the CPU, about one second to the first word.",
};

const CHANGING = new Set(["loading", "downloading"]);

/** Poll every second while an engine is changing, every 5 seconds otherwise. */
export const pollMs = (list: EngineList | null): number => (list?.engines.some((e) => CHANGING.has(e.state)) ? 1000 : 5000);
