import { Fragment, useEffect, useState } from "react";
import type { AppState, Page } from "../shared/ipc";
import { engineView } from "../shared/engine-view";
import { library } from "./features/library";
import { footerItems } from "./footer-model";
import { api } from "./ui";

/** The voice's display name ("Heart") for the id in Settings; loaded once, and left out while the server does not answer. */
function useVoiceName(id: string): string | undefined {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let live = true;
    api.voices().then(
      (v) => live && setNames(new Map(v.voices.map((x) => [x.id, x.name]))),
      () => live && setNames(new Map()),
    ); // no voice until the server answers
    return () => {
      live = false;
    };
  }, []);
  return names.get(id);
}

/** Number of readings in the library, loaded again when the page or the reading state changes. */
function useDocCount(page: Page, status: string): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    library.list().then(
      (d) => live && setCount(d.length),
      () => live && setCount(null),
    ); // no count until the library answers
    return () => {
      live = false;
    };
  }, [page, status]);
  return count;
}

/** The 28 px band under the panel (Lockix footer): one right-aligned line, parts split by thin dividers, never wrapping. */
export function Footer({ s, page }: { s: AppState; page: Page }) {
  const docs = useDocCount(page, s.reader.status);
  const items = footerItems({ engine: engineView(s.health, s.serverError).key, voice: useVoiceName(s.config.voice), docs: docs, reader: s.reader });
  return (
    <footer className="sk-footer" data-testid="footer">
      {items.map((t, i) => (
        <Fragment key={t}>
          {i > 0 && <span aria-hidden className="sk-footer__div" />}
          <span className="sk-footer__item">{t}</span>
        </Fragment>
      ))}
    </footer>
  );
}
