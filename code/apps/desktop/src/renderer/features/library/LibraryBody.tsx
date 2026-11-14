import type { Dispatch } from "react";
import { Button, EmptyState, Icon, ProgressBar, Select, onArrowKeys } from "@speakkit/ui";
import type { DocMeta, SearchHit } from "../../../shared/library/contract";
import { useT } from "../../i18n";
import { DocRow } from "./DocRow";
import { library } from "./api";
import { clock, estimateMs, FILTERS, SORTS, type SortId } from "./model";
import { bodyKind, type LibraryAction, type LibraryUi, type LibraryView } from "./page-model";

function ResumeCard({ doc, speed, onResume }: { doc: DocMeta; speed: number; onResume(): void }) {
  const { t } = useT();
  const total = estimateMs(doc.wordCount, speed);
  return (
    <section className="lib-resume" aria-label={t("lib.continue")}>
      <span className="lib-resume__tile">
        <Icon name="headphones" size={28} />
      </span>
      <div className="lib-resume__text">
        <span className="sk-caps">{t("lib.continue")}</span>
        <strong dir="auto">{doc.title}</strong>
        <span>
          {doc.origin} · {clock(total * doc.progress.fraction)} of {clock(total)}
        </span>
        <ProgressBar value={doc.progress.fraction * 100} thin label={t("lib.progress")} />
      </div>
      <Button variant="primary" iconLeft="player-play" onClick={onResume}>
        {t("lib.resume")}
      </Button>
    </section>
  );
}

function FilterBar({ ui, dispatch }: { ui: LibraryUi; dispatch: Dispatch<LibraryAction> }) {
  const { t } = useT();
  return (
    <div className="lib-bar">
      <div className="lib-chips" role="group" aria-label={t("lib.filter")}>
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className="lib-chip" aria-pressed={ui.filter === f.id} onClick={() => dispatch({ type: "filter", filter: f.id })}>
            {t(`lib.filter.${f.id}`)}
          </button>
        ))}
      </div>
      <Select
        label={t("lib.sort")}
        options={SORTS.map((o) => ({ value: o.id, label: t("lib.sortBy", { label: t(`lib.sort.${o.id}`) }) }))}
        value={ui.sort}
        onChange={(v) => dispatch({ type: "sort", sort: v as SortId })}
      />
    </div>
  );
}

function Empty({ kind, ui, dispatch, pickFiles }: { kind: "library-empty" | "no-match" | "filter-empty"; ui: LibraryUi; dispatch: Dispatch<LibraryAction>; pickFiles(): void }) {
  const { t } = useT();
  const dialog = (k: "paste" | "url") => dispatch({ type: "dialog", dialog: { kind: k } });
  const [before, after = ""] = t("lib.emptyBody").split("{link}");
  if (kind === "library-empty") {
    return (
      <EmptyState icon="book" title={t("lib.emptyTitle")} primary={{ label: t("lib.chooseFile"), onClick: pickFiles }} secondary={{ label: t("lib.pasteText"), onClick: () => dialog("paste") }}>
        {before}
        <button type="button" className="lib-link" onClick={() => dialog("url")}>
          {t("lib.emptyLink")}
        </button>
        {after}
      </EmptyState>
    );
  }
  if (kind === "no-match") {
    return (
      <EmptyState
        icon="search"
        title={t("lib.noMatchTitle", { query: ui.query })}
        primary={{ label: t("lib.clearSearch"), onClick: () => dispatch({ type: "query", query: "" }) }}
        secondary={{ label: t("lib.addText"), onClick: () => dialog("paste") }}
      >
        {t("lib.noMatchBody")}
      </EmptyState>
    );
  }
  return (
    <EmptyState icon="book" title={t("lib.hereTitle")} primary={{ label: t("lib.showAll"), onClick: () => dispatch({ type: "filter", filter: "all" }) }}>
      {t("lib.filterEmpty")}
    </EmptyState>
  );
}

interface BodyProps {
  loaded: boolean;
  ui: LibraryUi;
  view: LibraryView;
  hits: ReadonlyMap<string, SearchHit> | null;
  speed: number;
  now: number;
  dispatch: Dispatch<LibraryAction>;
  pickFiles(): void;
  open(doc: DocMeta, play?: boolean): void;
  refresh(): Promise<void>;
}

function List({ view, ui, hits, speed, now, dispatch, open, refresh }: Omit<BodyProps, "loaded" | "pickFiles">) {
  const dialog = (kind: "rename" | "voice" | "delete", doc: DocMeta) => dispatch({ type: "dialog", dialog: { kind, doc } });
  return (
    <ul className="lib-list" onKeyDown={onArrowKeys(".lib-row__main")}>
      {view.visible.map((d) => (
        <DocRow
          key={d.id}
          doc={d}
          speed={speed}
          now={now}
          query={ui.query}
          hit={hits?.get(d.id)}
          actions={{
            onOpen: () => open(d, false),
            onPlay: () => open(d),
            onRename: () => dialog("rename", d),
            onVoice: () => dialog("voice", d),
            onFinished: () => void library.setFinished(d.id, !d.finished).then(refresh),
            onReveal: () => void library.showInFolder(d.id),
            onDelete: () => dialog("delete", d),
          }}
        />
      ))}
    </ul>
  );
}

/** Under the header: the empty state that fits, or the resume card, filters, result count and the list. */
export function LibraryBody(p: BodyProps) {
  const { t } = useT();
  const kind = bodyKind(p.loaded, p.view, !!p.hits);
  if (kind === "library-empty") return <Empty kind={kind} ui={p.ui} dispatch={p.dispatch} pickFiles={p.pickFiles} />;
  return (
    <>
      {p.view.resume && <ResumeCard doc={p.view.resume} speed={p.speed} onResume={() => p.open(p.view.resume!)} />}
      <FilterBar ui={p.ui} dispatch={p.dispatch} />
      {p.hits && (
        <div className="lib-count" role="status">
          {t("lib.results", { n: p.view.visible.length })}{" "}
          <Button size="sm" variant="ghost" onClick={() => p.dispatch({ type: "query", query: "" })}>
            {t("lib.clear")}
          </Button>
        </div>
      )}
      {kind === "list" ? <List {...p} /> : <Empty kind={kind} ui={p.ui} dispatch={p.dispatch} pickFiles={p.pickFiles} />}
    </>
  );
}
