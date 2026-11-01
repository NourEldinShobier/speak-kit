import { useCallback, useEffect, useState } from "react";
import type { DocMeta, SearchHit } from "../../../shared/library/contract";
import { library } from "./api";

/** The readings (null until the first load) and when they were loaded, which "Today" labels are relative to. */
export function useDocs() {
  const [state, setState] = useState<{ docs: DocMeta[] | null; now: number }>({ docs: null, now: Date.now() });
  const refresh = useCallback(async () => setState({ docs: await library.list(), now: Date.now() }), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { docs: state.docs, now: state.now, refresh };
}

const SEARCH_DELAY_MS = 150;

/** Hits for the query, looked up in main after a short pause; null when the query is empty. */
export function useSearch(query: string, version: unknown): Map<string, SearchHit> | null {
  const [hits, setHits] = useState<Map<string, SearchHit> | null>(null);
  useEffect(() => {
    if (!query.trim()) {
      setHits(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => void library.search(query).then((r) => live && setHits(new Map(r.map((h) => [h.id, h])))), SEARCH_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, version]);
  return hits;
}
