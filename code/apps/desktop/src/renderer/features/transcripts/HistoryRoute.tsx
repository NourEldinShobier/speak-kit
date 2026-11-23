import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Button, DropdownMenu, DropdownMenuItem, Modal, Segmented } from "@speakkit/ui";
import type { Push } from "../../../shared/transcripts/contract";
import { transcripts } from "./api";
import { ImportDialog } from "./ImportDialog";
import { TranscriptsTab } from "./TranscriptsTab";
import { TranscriptView } from "./TranscriptView";
import { usePush, useSettingsView } from "./useTranscripts";
import "./transcripts.css";

// The dictation history is its own feature; it loads when its tab is first shown.
const DictationHistory = lazy(() => import("../dictation").then((m) => ({ default: m.DictationHistoryPage })));

function useDictationLead(): string {
  const [lead, setLead] = useState("What you dictated, saved on this computer.");
  useEffect(() => {
    void import("../dictation").then((m) => m.historyLeadNow()).then(setLead, () => {});
  }, []);
  return lead;
}

type View = { kind: "list" } | { kind: "transcript"; id: string };
type Tab = "dictations" | "transcripts";
type Doomed = { id: string; title: string };

/** Delete asks first: the transcript, its words and its audio are removed for good. */
function DeleteDialog({ doomed, onClose, onConfirm }: { doomed: Doomed | null; onClose(): void; onConfirm(d: Doomed): void }) {
  return (
    <Modal
      open={doomed !== null}
      onClose={onClose}
      title="Delete this transcript?"
      width={400}
      footer={
        <>
          <Button onClick={onClose} data-autofocus>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => doomed && onConfirm(doomed)}>
            Delete
          </Button>
        </>
      }
    >
      <p className="sk-modal-text" style={{ margin: 0 }}>
        {doomed?.title} is deleted from this computer, with its audio. You cannot undo it.
      </p>
    </Modal>
  );
}

function DeleteAllDialog({ open, count, onClose, onConfirm }: { open: boolean; count: number; onClose(): void; onConfirm(): void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete all transcripts?"
      width={400}
      footer={
        <>
          <Button onClick={onClose} data-autofocus>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Delete all
          </Button>
        </>
      }
    >
      <p className="sk-modal-text" style={{ margin: 0 }}>
        {count === 1 ? "The transcript is" : `All ${count} transcripts are`} deleted from this computer, with {count === 1 ? "its" : "their"} audio. You cannot undo it.
      </p>
    </Modal>
  );
}

interface Actions {
  onImport(): void;
  onSettings(): void;
  onDeleteAll(): void;
}

/** Import and the More menu: Transcript settings, Delete all transcripts. */
function HeaderActions({ onImport, onSettings, onDeleteAll }: Actions) {
  return (
    <div className="tr-actions">
      <Button variant="primary" iconLeft="upload" onClick={onImport}>
        Import audio file
      </Button>
      <DropdownMenu trigger={<Button aria-label="More" iconLeft="dots" />} align="end">
        <DropdownMenuItem icon="folder" onSelect={onSettings}>
          Transcript settings
        </DropdownMenuItem>
        <DropdownMenuItem icon="trash" destructive onSelect={onDeleteAll}>
          Delete all transcripts
        </DropdownMenuItem>
      </DropdownMenu>
    </div>
  );
}

interface FrameProps {
  tab: Tab;
  setTab(t: Tab): void;
  lead: string;
  actions?: ReactNode;
  children: ReactNode;
}

/** The History page frame: the title, the sentence under it, the tab switch, and what the tab shows. */
function Frame({ tab, setTab, lead, actions, children }: FrameProps) {
  return (
    <div className="sk-page tr-page">
      <div className="sk-page__bar">
        <div className="sk-page__head">
          <h1>History</h1>
          <p>{lead}</p>
        </div>
        {actions}
      </div>
      <Segmented
        label="History"
        variant="settings"
        value={tab}
        onChange={(t) => setTab(t as Tab)}
        items={[
          { id: "dictations", label: "Dictations" },
          { id: "transcripts", label: "Transcripts" },
        ]}
      />
      {children}
    </div>
  );
}

interface PageProps {
  push: Push;
  setTab(t: Tab): void;
  openSettings(): void;
}

const deleteAll = () => void transcripts.list().then((rows) => Promise.all(rows.map((r) => transcripts.remove(r.id))));

/** The Transcripts tab with what it opens: a transcript, the import dialog, and the confirmations before a delete. */
function TranscriptsPage({ push, setTab, openSettings }: PageProps) {
  const { view: settings } = useSettingsView(push.tick);
  const [view, setView] = useState<View>({ kind: "list" });
  const [importing, setImporting] = useState(false);
  const [doomed, setDoomed] = useState<Doomed | null>(null);
  const [allCount, setAllCount] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const list = () => setView({ kind: "list" });
  const remove = (d: Doomed) => {
    setDoomed(null);
    if (view.kind === "transcript" && view.id === d.id) list();
    void transcripts.remove(d.id);
  };
  const dialogs = (
    <>
      <DeleteDialog doomed={doomed} onClose={() => setDoomed(null)} onConfirm={remove} />
      <DeleteAllDialog open={allCount !== null} count={allCount ?? 0} onClose={() => setAllCount(null)} onConfirm={() => (setAllCount(null), list(), deleteAll())} />
    </>
  );
  if (view.kind === "transcript") {
    return (
      <>
        <TranscriptView id={view.id} push={push} settings={settings} onBack={list} onDelete={setDoomed} />
        {dialogs}
      </>
    );
  }
  const actions = <HeaderActions onImport={() => setImporting(true)} onSettings={openSettings} onDeleteAll={() => void transcripts.list().then((r) => setAllCount(r.length))} />;
  return (
    <Frame tab="transcripts" setTab={setTab} lead="Dictations and transcripts, kept on this computer." actions={actions}>
      <TranscriptsTab
        push={push}
        settings={settings}
        search={search}
        setSearch={setSearch}
        onOpen={(id) => setView({ kind: "transcript", id })}
        onImport={() => setImporting(true)}
        onDelete={setDoomed}
      />
      <ImportDialog open={importing} settings={settings} onClose={() => setImporting(false)} onStarted={() => setSearch("")} />
      {dialogs}
    </Frame>
  );
}

/** History: the Dictations tab (the existing dictation history) and the Transcripts tab. */
export function HistoryRoute({ openSettings, openDictation }: { openSettings(): void; openDictation(): void }) {
  const push = usePush();
  const [tab, setTab] = useState<Tab>("dictations");
  const lead = useDictationLead();
  if (tab === "transcripts") return <TranscriptsPage push={push} setTab={setTab} openSettings={openSettings} />;
  return (
    <Frame tab={tab} setTab={setTab} lead={lead}>
      <Suspense fallback={null}>
        <DictationHistory embedded openSettings={openDictation} />
      </Suspense>
    </Frame>
  );
}
