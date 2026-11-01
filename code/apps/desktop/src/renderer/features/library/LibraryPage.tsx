import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Banner, Button, DropdownMenu, DropdownMenuItem, EmptyState, Icon, ProgressBar, Select, TextInput, Toast } from "@speakkit/ui";
import type { Voice } from "@speakkit/protocol";
import { MAX_FILE_BYTES, type DocMeta, type ImportResult } from "../../../shared/library/contract";
import type { AppState } from "../../../shared/ipc";
import { api } from "../../ui";
import { DeleteDialog, PasteDialog, RenameDialog, UrlDialog, VoiceDialog } from "./AddDialogs";
import { DocRow } from "./DocRow";
import { library } from "./api";
import { clock, continueDoc, estimateMs, FILTERS, filterDocs, SORTS, sortDocs, span, type FilterId, type SortId } from "./model";
import { useDocs, useSearch } from "./useLibrary";
import "./library.css";

const TOAST_MS = 6000;
type Dialog = { kind: "paste" | "url" } | { kind: "rename" | "voice" | "delete"; doc: DocMeta } | null;
interface ToastState {
  text: string;
  undo?: string;
}

export function LibraryPage({ s, onOpen }: { s: AppState; onOpen(id: string, autoplay: boolean): void }) {
  const { docs, refresh } = useDocs();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterId>("all");
  const [sort, setSort] = useState<SortId>("played");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [dragging, setDragging] = useState(0);
  const [voices, setVoices] = useState<Voice[]>([]);
  const hits = useSearch(query, docs);
  const now = useMemo(() => Date.now(), [docs]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    void api.voices().then(
      (v) => setVoices(v.voices),
      () => {},
    );
  }, []);

  const say = (t: ToastState) => {
    setToast(t);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const finish = async (results: ImportResult[]) => {
    const added = results.flatMap((r) => (r.ok ? [r.doc] : []));
    setProblems(results.flatMap((r) => (r.ok ? [] : [r.name ? `${r.name}: ${r.message}` : r.message])));
    await refresh();
    if (added.length === 1) say({ text: added[0]!.needsOcr ? `Added "${added[0]!.title}". It has no text layer: open it to run text recognition.` : `Added "${added[0]!.title}".` });
    else if (added.length > 1) say({ text: `Added ${added.length} readings.` });
  };

  const addFiles = async (files: File[]) =>
    finish(
      await Promise.all(
        files.map(async (f): Promise<ImportResult> =>
          f.size > MAX_FILE_BYTES ? { ok: false, reason: "too-large", name: f.name, message: "The file is larger than 100 MB." } : library.importBytes(f.name, new Uint8Array(await f.arrayBuffer())),
        ),
      ),
    );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(0);
    void addFiles([...e.dataTransfer.files]);
  };
  const dragProps = {
    onDragEnter: (e: DragEvent) => e.dataTransfer.types.includes("Files") && setDragging((n) => n + 1),
    onDragLeave: () => setDragging((n) => Math.max(0, n - 1)),
    onDragOver: (e: DragEvent) => e.preventDefault(),
    onDrop,
  };

  const speed = s.config.speed;
  const voice = s.config.voice;
  const all = docs ?? [];
  const visible = useMemo(() => {
    const base = sortDocs(filterDocs(all, filter), sort);
    return hits ? base.filter((d) => hits.has(d.id)) : base;
  }, [all, filter, sort, hits]);
  const resume = !query ? continueDoc(all) : undefined;
  const total = all.reduce((n, d) => n + estimateMs(d.wordCount, speed), 0);

  const remove = async (doc: DocMeta) => {
    setDialog(null);
    await library.remove(doc.id);
    await refresh();
    say({ text: `Deleted "${doc.title}".`, undo: doc.id });
  };
  const undo = async (id: string) => {
    setToast(null);
    await library.restore(id);
    await refresh();
  };
  const open = (d: DocMeta, play = true) => onOpen(d.id, play);
  const addedPasted = async (doc: DocMeta, play: boolean) => {
    setDialog(null);
    await refresh();
    if (play) open(doc);
    else say({ text: `Added "${doc.title}".` });
  };

  const addMenu = (
    <DropdownMenu
      trigger={
        <Button variant="primary" iconLeft="plus">
          Add
        </Button>
      }
    >
      <DropdownMenuItem icon="file-import" onSelect={() => void library.pickFiles().then(finish)}>
        Choose files
      </DropdownMenuItem>
      <DropdownMenuItem icon="clipboard" onSelect={() => setDialog({ kind: "paste" })}>
        Paste text
      </DropdownMenuItem>
      <DropdownMenuItem icon="link" onSelect={() => setDialog({ kind: "url" })}>
        From a web address
      </DropdownMenuItem>
      <DropdownMenuItem icon="copy" onSelect={() => void library.importClipboard().then((r) => finish([r]))}>
        From the clipboard
      </DropdownMenuItem>
    </DropdownMenu>
  );

  return (
    <div className="lib" {...dragProps} data-testid="library">
      <header className="lib-head">
        <div>
          <h1>Library</h1>
          <p>{docs === null ? " " : `${all.length} ${all.length === 1 ? "reading" : "readings"}${all.length ? ` · ${span(total)} of audio` : ""}`}</p>
        </div>
        <div className="lib-head__actions">
          <TextInput
            icon="search"
            size="md"
            aria-label="Search title, source or text"
            placeholder="Search title, source or text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="lib-search"
          />
          {addMenu}
        </div>
      </header>

      {problems.length > 0 && (
        <Banner
          tone="warning"
          title="Some files could not be added"
          action={
            <Button size="sm" variant="ghost" onClick={() => setProblems([])}>
              Dismiss
            </Button>
          }
        >
          {problems.map((p) => (
            <div key={p}>{p}</div>
          ))}
        </Banner>
      )}

      {docs !== null && all.length === 0 ? (
        <EmptyState
          icon="book"
          title="Nothing to read yet"
          primary={{ label: "Choose file", onClick: () => void library.pickFiles().then(finish) }}
          secondary={{ label: "Paste text", onClick: () => setDialog({ kind: "paste" }) }}
        >
          Drop a PDF, Word, EPUB, Markdown or text file here. Or{" "}
          <button type="button" className="lib-link" onClick={() => setDialog({ kind: "url" })}>
            use a web address
          </button>
          .
        </EmptyState>
      ) : (
        <>
          {resume && (
            <section className="lib-resume" aria-label="Continue listening">
              <span className="lib-resume__tile">
                <Icon name="headphones" size={28} />
              </span>
              <div className="lib-resume__text">
                <span className="sk-caps">Continue listening</span>
                <strong>{resume.title}</strong>
                <span>
                  {resume.origin} · {clock(estimateMs(resume.wordCount, speed) * resume.progress.fraction)} of {clock(estimateMs(resume.wordCount, speed))}
                </span>
                <ProgressBar value={resume.progress.fraction * 100} thin label="Progress" />
              </div>
              <Button variant="primary" iconLeft="player-play" onClick={() => open(resume)}>
                Resume
              </Button>
            </section>
          )}
          <div className="lib-bar">
            <div className="lib-chips" role="group" aria-label="Filter">
              {FILTERS.map((f) => (
                <button key={f.id} type="button" className="lib-chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
            <Select label="Sort" size="sm" options={SORTS.map((o) => ({ value: o.id, label: `Sort: ${o.label}` }))} value={sort} onChange={(v) => setSort(v as SortId)} />
          </div>
          {hits && (
            <div className="lib-count" role="status">
              {visible.length} {visible.length === 1 ? "result" : "results"}{" "}
              <Button size="sm" variant="ghost" onClick={() => setQuery("")}>
                Clear
              </Button>
            </div>
          )}
          {docs !== null && visible.length === 0 ? (
            hits ? (
              <EmptyState
                icon="search"
                title={`No readings match "${query}"`}
                primary={{ label: "Clear search", onClick: () => setQuery("") }}
                secondary={{ label: "Add text", onClick: () => setDialog({ kind: "paste" }) }}
              >
                Titles, sources and the text of every reading were searched.
              </EmptyState>
            ) : (
              <EmptyState icon="book" title="Nothing here" primary={{ label: "Show all", onClick: () => setFilter("all") }}>
                No reading matches this filter.
              </EmptyState>
            )
          ) : (
            <ul className="lib-list">
              {visible.map((d) => (
                <DocRow
                  key={d.id}
                  doc={d}
                  speed={speed}
                  now={now}
                  query={query}
                  hit={hits?.get(d.id)}
                  actions={{
                    onOpen: () => open(d, false),
                    onPlay: () => open(d),
                    onRename: () => setDialog({ kind: "rename", doc: d }),
                    onVoice: () => setDialog({ kind: "voice", doc: d }),
                    onFinished: () => void library.setFinished(d.id, !d.finished).then(refresh),
                    onReveal: () => void library.showInFolder(d.id),
                    onDelete: () => setDialog({ kind: "delete", doc: d }),
                  }}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {dragging > 0 && (
        <div className="lib-drop" data-testid="drop-overlay" aria-live="polite">
          <Icon name="upload" size={32} />
          <strong>Drop to add to your library</strong>
          <span>PDF, DOCX, EPUB, Markdown, HTML and text files</span>
        </div>
      )}

      <PasteDialog open={dialog?.kind === "paste"} speed={speed} voices={voices} defaultVoice={voice} onClose={() => setDialog(null)} onAdded={(d, p) => void addedPasted(d, p)} />
      <UrlDialog
        open={dialog?.kind === "url"}
        onClose={() => setDialog(null)}
        onAdded={(d) => {
          setDialog(null);
          void refresh();
          say({ text: `Added "${d.title}".` });
        }}
        onPasteInstead={() => setDialog({ kind: "paste" })}
      />
      <RenameDialog
        key={`r${dialog?.kind === "rename" ? dialog.doc.id : ""}`}
        doc={dialog?.kind === "rename" ? dialog.doc : null}
        onClose={() => setDialog(null)}
        onDone={() => {
          setDialog(null);
          void refresh();
        }}
      />
      <VoiceDialog
        key={`v${dialog?.kind === "voice" ? dialog.doc.id : ""}`}
        doc={dialog?.kind === "voice" ? dialog.doc : null}
        voices={voices}
        defaultVoice={voice}
        onClose={() => setDialog(null)}
        onDone={() => {
          setDialog(null);
          void refresh();
        }}
      />
      <DeleteDialog doc={dialog?.kind === "delete" ? dialog.doc : null} onClose={() => setDialog(null)} onConfirm={() => dialog?.kind === "delete" && void remove(dialog.doc)} />

      {toast && (
        <div className="lib-toast">
          <Toast tone="success" action={toast.undo ? { label: "Undo", onClick: () => void undo(toast.undo!) } : undefined}>
            {toast.text}
          </Toast>
        </div>
      )}
    </div>
  );
}
