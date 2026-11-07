import type { Dispatch } from "react";
import { Button, EmptyState, Icon, ProgressBar, Select } from "@speakkit/ui";
import { plural } from "@speakkit/protocol";
import type { DocMeta, SearchHit } from "../../../shared/library/contract";
import { DocRow } from "./DocRow";
import { library } from "./api";
import { clock, estimateMs, FILTERS, SORTS, type SortId } from "./model";
import { bodyKind, type LibraryAction, type LibraryUi, type LibraryView } from "./page-model";

function ResumeCard({ doc, speed, onResume }: { doc: DocMeta; speed: number; onResume(): void }) {
  const total = estimateMs(doc.wordCount, speed);
  return (
    <section className="lib-resume" aria-label="Continue listening">
      <span className="lib-resume__tile">
        <Icon name="headphones" size={28} />
      </span>
      <div className="lib-resume__text">
        <span className="sk-caps">Continue listening</span>
        <strong dir="auto">{doc.title}</strong>
        <span>
          {doc.origin} · {clock(total * doc.progress.fraction)} of {clock(total)}
        </span>
        <ProgressBar value={doc.progress.fraction * 100} thin label="Progress" />
      </div>
      <Button variant="primary" iconLeft="player-play" onClick={onResume}>
        Resume
      </Button>
    </section>
  );
}

function FilterBar({ ui, dispatch }: { ui: LibraryUi; dispatch: Dispatch<LibraryAction> }) {
  return (
    <div className="lib-bar">
      <div className="lib-chips" role="group" aria-label="Filter">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className="lib-chip" aria-pressed={ui.filter === f.id} onClick={() => dispatch({ type: "filter", filter: f.id })}>
            {f.label}
          </button>
        ))}
      </div>
      <Select label="Sort" options={SORTS.map((o) => ({ value: o.id, label: `Sort: ${o.label}` }))} value={ui.sort} onChange={(v) => dispatch({ type: "sort", sort: v as SortId })} />
    </div>
  );
}

function Empty({ kind, ui, dispatch, pickFiles }: { kind: "library-empty" | "no-match" | "filter-empty"; ui: LibraryUi; dispatch: Dispatch<LibraryAction>; pickFiles(): void }) {
  const dialog = (k: "paste" | "url") => dispatch({ type: "dialog", dialog: { kind: k } });
  if (kind === "library-empty") {
    return (
      <EmptyState icon="book" title="Nothing to read yet" primary={{ label: "Choose file", onClick: pickFiles }} secondary={{ label: "Paste text", onClick: () => dialog("paste") }}>
        Drop a PDF, Word, EPUB, Markdown or text file here. Or{" "}
        <button type="button" className="lib-link" onClick={() => dialog("url")}>
          use a web address
        </button>
        .
      </EmptyState>
    );
  }
  if (kind === "no-match") {
    return (
      <EmptyState
        icon="search"
        title={`No readings match "${ui.query}"`}
        primary={{ label: "Clear search", onClick: () => dispatch({ type: "query", query: "" }) }}
        secondary={{ label: "Add text", onClick: () => dialog("paste") }}
      >
        Titles, sources and the text of every reading were searched.
      </EmptyState>
    );
  }
  return (
    <EmptyState icon="book" title="Nothing here" primary={{ label: "Show all", onClick: () => dispatch({ type: "filter", filter: "all" }) }}>
      No reading matches this filter.
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
    <ul className="lib-list">
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
  const kind = bodyKind(p.loaded, p.view, !!p.hits);
  if (kind === "library-empty") return <Empty kind={kind} ui={p.ui} dispatch={p.dispatch} pickFiles={p.pickFiles} />;
  return (
    <>
      {p.view.resume && <ResumeCard doc={p.view.resume} speed={p.speed} onResume={() => p.open(p.view.resume!)} />}
      <FilterBar ui={p.ui} dispatch={p.dispatch} />
      {p.hits && (
        <div className="lib-count" role="status">
          {plural(p.view.visible.length, "result", "results")}{" "}
          <Button size="sm" variant="ghost" onClick={() => p.dispatch({ type: "query", query: "" })}>
            Clear
          </Button>
        </div>
      )}
      {kind === "list" ? <List {...p} /> : <Empty kind={kind} ui={p.ui} dispatch={p.dispatch} pickFiles={p.pickFiles} />}
    </>
  );
}
