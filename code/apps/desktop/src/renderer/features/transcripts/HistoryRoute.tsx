import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Button, DropdownMenu, DropdownMenuItem, Modal, Segmented, Toast } from "@speakkit/ui";
import type { Push, SettingsView } from "../../../shared/transcripts/contract";
import { transcripts } from "./api";
import { ImportDialog } from "./ImportDialog";
import { RecorderCard } from "./RecorderCard";
import { TrashPage } from "./TrashPage";
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

type View = { kind: "list" } | { kind: "transcript"; id: string } | { kind: "trash" };
type Tab = "dictations" | "transcripts";
type Undo = { id: string; title: string };

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
            Move to Trash
          </Button>
        </>
      }
    >
      <p className="sk-modal-text" style={{ margin: 0 }}>
        All {count} {count === 1 ? "transcript moves" : "transcripts move"} to Trash. You can restore {count === 1 ? "it" : "them"} from there until the Trash period ends.
      </p>
    </Modal>
  );
}

function UndoToast({ undo, done }: { undo: Undo; done(): void }) {
  return (
    <div className="tr-toast">
      <Toast tone="delete" action={{ label: "Undo", onClick: () => void transcripts.restore(undo.id).then(done) }}>
        Moved to Trash: {undo.title}
      </Toast>
    </div>
  );
}

/** The last delete, kept for eight seconds so Undo can bring it back. */
function useUndo(): [Undo | null, (u: Undo | null) => void] {
  const [undo, setUndo] = useState<Undo | null>(null);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(t);
  }, [undo]);
  return [undo, setUndo];
}

interface Actions {
  recording: boolean;
  onImport(): void;
  onRecord(): void;
  onTrash(): void;
  onSettings(): void;
  onDeleteAll(): void;
}

/** Import, Record and the More menu: Trash, Transcript settings, Delete all transcripts. Import and Record wait while a recording runs. */
function HeaderActions({ recording, onImport, onRecord, onTrash, onSettings, onDeleteAll }: Actions) {
  return (
    <div className="tr-actions">
      <Button iconLeft="upload" disabled={recording} onClick={onImport}>
        Import audio file
      </Button>
      <Button variant="primary" iconLeft="microphone" disabled={recording} onClick={onRecord}>
        Record a conversation
      </Button>
      <DropdownMenu trigger={<Button aria-label="More" iconLeft="dots" />} align="end">
        <DropdownMenuItem icon="trash" onSelect={onTrash}>
          Trash
        </DropdownMenuItem>
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

interface TabBodyProps {
  push: Push;
  settings: SettingsView | null;
  search: string;
  setSearch(s: string): void;
  recorderOpen: boolean;
  closeRecorder(): void;
  setView(v: View): void;
  onImport(): void;
  onRecord(): void;
  onDeleted(u: Undo): void;
}

/** The Transcripts tab: the recorder card (while it is open or recording) above the list. */
function TranscriptsBody({ push, settings, search, setSearch, recorderOpen, closeRecorder, setView, onImport, onRecord, onDeleted }: TabBodyProps) {
  return (
    <>
      {push.recording || recorderOpen ? <RecorderCard recording={push.recording} onClose={closeRecorder} /> : null}
      <TranscriptsTab
        push={push}
        settings={settings}
        search={search}
        setSearch={setSearch}
        onOpen={(id) => setView({ kind: "transcript", id })}
        onImport={onImport}
        onRecord={onRecord}
        onTrash={() => setView({ kind: "trash" })}
        onDeleted={onDeleted}
      />
    </>
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

const moveAllToTrash = () => void transcripts.list().then((rows) => Promise.all(rows.filter((r) => r.status !== "recording").map((r) => transcripts.trash(r.id))));

/** The Transcripts tab with what it opens: a transcript, the Trash, the import dialog, the recorder, and the undo after a delete. */
function TranscriptsPage({ push, setTab, openSettings }: PageProps) {
  const { view: settings } = useSettingsView(push.tick);
  const [view, setView] = useState<View>({ kind: "list" });
  const [importing, setImporting] = useState(false);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [deleteAll, setDeleteAll] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [undo, setUndo] = useUndo();
  const toast = undo ? <UndoToast undo={undo} done={() => setUndo(null)} /> : null;
  const list = () => setView({ kind: "list" });
  if (view.kind === "trash") return <TrashPage push={push} settings={settings} onBack={list} />;
  if (view.kind === "transcript") {
    return (
      <>
        <TranscriptView id={view.id} push={push} settings={settings} onBack={list} onDeleted={(r) => (setUndo(r), list())} />
        {toast}
      </>
    );
  }
  const actions = (
    <HeaderActions
      recording={push.recording !== null}
      onImport={() => setImporting(true)}
      onRecord={() => setRecorderOpen(true)}
      onTrash={() => setView({ kind: "trash" })}
      onSettings={openSettings}
      onDeleteAll={() => void transcripts.list().then((r) => setDeleteAll(r.length))}
    />
  );
  return (
    <Frame tab="transcripts" setTab={setTab} lead="Dictations and transcripts, kept on this computer." actions={actions}>
      <TranscriptsBody
        push={push}
        settings={settings}
        search={search}
        setSearch={setSearch}
        recorderOpen={recorderOpen}
        closeRecorder={() => setRecorderOpen(false)}
        setView={setView}
        onImport={() => setImporting(true)}
        onRecord={() => setRecorderOpen(true)}
        onDeleted={setUndo}
      />
      <ImportDialog open={importing} settings={settings} onClose={() => setImporting(false)} onStarted={() => setSearch("")} />
      <DeleteAllDialog open={deleteAll !== null} count={deleteAll ?? 0} onClose={() => setDeleteAll(null)} onConfirm={() => (setDeleteAll(null), moveAllToTrash())} />
      {toast}
    </Frame>
  );
}

/** History: the Dictations tab (the existing dictation history) and the Transcripts tab. */
export function HistoryRoute({ openSettings, openDictation }: { openSettings(): void; openDictation(): void }) {
  const push = usePush();
  const [tab, setTab] = useState<Tab>("dictations");
  const lead = useDictationLead();
  const recording = push.recording !== null;
  // A recording that is running is shown whichever tab was open when it started (the tray can start one too).
  useEffect(() => {
    if (recording) setTab("transcripts");
  }, [recording]);
  if (tab === "transcripts") return <TranscriptsPage push={push} setTab={setTab} openSettings={openSettings} />;
  return (
    <Frame tab={tab} setTab={setTab} lead={lead}>
      <Suspense fallback={null}>
        <DictationHistory embedded openSettings={openDictation} />
      </Suspense>
    </Frame>
  );
}
