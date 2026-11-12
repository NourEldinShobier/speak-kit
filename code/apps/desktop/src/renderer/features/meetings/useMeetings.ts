import { useCallback, useEffect, useRef, useState } from "react";
import type { Row } from "@speakkit/meetings/pure";
import type { Push, SettingsView } from "../../../shared/meetings/contract";
import { meetings } from "./api";

/** The live state of the recording and a counter that moves when anything changes: fetched once, then pushed by the main process. */
export function usePush(): Push {
  const [push, setPush] = useState<Push>({ recording: null, tick: 0 });
  useEffect(() => {
    let live = true;
    void meetings.push().then((p) => live && setPush((cur) => (cur.tick >= p.tick && cur.tick > 0 ? cur : p)));
    const off = meetings.onPush((p) => setPush(p));
    return () => {
      live = false;
      off();
    };
  }, []);
  return push;
}

export interface ListState {
  /** null until the first answer. */
  rows: Row[] | null;
  error: boolean;
  reload(): void;
}

export const SEARCH_DELAY_MS = 150;

/** The meetings for a search (or the Trash), fetched again whenever main says something changed. The search waits for a pause in typing. A failed fetch keeps the old rows and sets `error`. */
export function useMeetingList(search: string, trashed: boolean, tick: number): ListState {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);
  const [n, setN] = useState(0);
  const latest = useRef(0);
  useEffect(() => {
    const mine = ++latest.current;
    const q = search.trim();
    const run = () =>
      meetings.list({ ...(q && { search: q }), trashed }).then(
        (r) => {
          if (mine !== latest.current) return;
          setRows(r);
          setError(false);
        },
        () => mine === latest.current && setError(true),
      );
    const timer = setTimeout(() => void run(), q ? SEARCH_DELAY_MS : 0);
    return () => clearTimeout(timer);
  }, [search, trashed, tick, n]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  return { rows, error, reload };
}

/** The settings view (policies, retention, capabilities), fetched again when anything changes. */
export function useSettingsView(tick: number): { view: SettingsView | null; set(v: SettingsView): void; failed: boolean } {
  const [view, setView] = useState<SettingsView | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    meetings.settings().then(
      (v) => live && (setView(v), setFailed(false)),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [tick]);
  return { view, set: setView, failed };
}
