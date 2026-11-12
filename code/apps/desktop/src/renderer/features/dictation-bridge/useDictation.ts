import { useEffect, useState } from "react";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { dictation } from "./api";

/** The dictation status: fetched once, then pushed by the main process after every change. */
export function useDictation(): DictationStatus | null {
  const [status, setStatus] = useState<DictationStatus | null>(null);
  useEffect(() => {
    let live = true;
    void dictation.status().then((s) => live && setStatus((cur) => cur ?? s));
    const off = dictation.onStatus((s) => setStatus(s));
    return () => {
      live = false;
      off();
    };
  }, []);
  return status;
}
