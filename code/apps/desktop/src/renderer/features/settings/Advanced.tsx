import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@speakkit/ui";
import { useT } from "../../i18n";
import { isAdvancedRow, peekRow, subscribeRow } from "./focus";

/** The Advanced fold of a page: closed each time the page opens, unless a search result points at a row inside it. */
export function Advanced({ page, subtitle, count, children }: { page: string; subtitle: string; count: number; children: ReactNode }) {
  const { t } = useT();
  const [open, setOpen] = useState(() => isAdvancedRow(page, peekRow()));
  const id = `advanced-${page}`;
  useEffect(
    () => subscribeRow(() => isAdvancedRow(page, peekRow()) && setOpen(true)), // a search result for a row in the fold, while this page is already open
    [page],
  );
  return (
    <section className="sk-fold" data-testid="advanced-fold">
      <button type="button" className="sk-fold__toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <Icon name={open ? "chevron-down" : "chevron-right"} size={16} />
        <span className="sk-fold__text">
          <b>{t("fold.advanced")}</b>
          <span>{subtitle}</span>
        </span>
        <span className="sk-fold__count">{t("fold.count", { n: count })}</span>
      </button>
      <div id={id} hidden={!open} className="sk-fold__body">
        {children}
      </div>
    </section>
  );
}
