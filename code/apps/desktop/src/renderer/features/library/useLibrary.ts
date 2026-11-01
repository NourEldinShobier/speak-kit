import { useCallback, useEffect, useState } from "react";
import type { DocMeta, SearchHit } from "../../../shared/library/contract";
import { library } from "./api";

export function useDocs() {
  const [docs, setDocs] = useState<DocMeta[] | null>(null);
  const refresh = useCallback(async () => setDocs(await library.list()), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { docs, refresh };
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
