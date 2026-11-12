import { useEffect, useState } from "react";
import type { SpeechModelsView } from "../../../shared/speech-models/contract";
import { models } from "./api";

/** The speech models view: fetched once, then pushed by the main process after every change. `null` until the first answer; `failed` when there was none. */
export function useSpeechModels(): { view: SpeechModelsView | null; failed: boolean; set(v: SpeechModelsView): void } {
  const [view, setView] = useState<SpeechModelsView | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    models.view().then(
      (v) => live && setView((cur) => cur ?? v),
      () => live && setFailed(true),
    );
    const off = models.onView((v) => {
      setFailed(false);
      setView(v);
    });
    return () => {
      live = false;
      off();
    };
  }, []);
  return { view, failed, set: setView };
}
