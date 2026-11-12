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
import { MeetingsTab, MeetingView, takeOpen, useMeetingsPush, useMeetingsSettings } from "../meetings";
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
type Tab = "dictations" | "transcripts" | "meetings";
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
  /** The Meetings tab is there only while the feature is on. */
  meetings: boolean;
  setTab(t: Tab): void;
  lead: string;
  actions?: ReactNode;
  children: ReactNode;
}

/** The History page frame: the title, the sentence under it, the tab switch, and what the tab shows. */
function Frame({ tab, meetings, setTab, lead, actions, children }: FrameProps) {
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
        items={[{ id: "dictations", label: "Dictations" }, { id: "transcripts", label: "Transcripts" }, ...(meetings ? [{ id: "meetings", label: "Meetings" }] : [])]}
      />
      {children}
    </div>
  );
}

interface PageProps {
  push: Push;
  meetings: boolean;
  setTab(t: Tab): void;
  openSettings(): void;
}

const moveAllToTrash = () => void transcripts.list().then((rows) => Promise.all(rows.filter((r) => r.status !== "recording").map((r) => transcripts.trash(r.id))));

/** The Transcripts tab with what it opens: a transcript, the Trash, the import dialog, the recorder, and the undo after a delete. */
function TranscriptsPage({ push, meetings, setTab, openSettings }: PageProps) {
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
    <Frame tab="transcripts" meetings={meetings} setTab={setTab} lead="Dictations and transcripts, kept on this computer." actions={actions}>
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

/** The Meetings tab with what it opens: one meeting. */
function MeetingsPage({ meetings, setTab, openMeetingSettings, initial }: { meetings: boolean; setTab(t: Tab): void; openMeetingSettings(): void; initial: string | undefined }) {
  const push = useMeetingsPush();
  const { view: settings } = useMeetingsSettings(push.tick);
  const [open, setOpen] = useState<string | null>(initial ?? null);
  const [search, setSearch] = useState("");
  useEffect(() => {
    const on = () => {
      const id = takeOpen();
      if (id) setOpen(id);
    };
    window.addEventListener("speakkit:open-meeting", on);
    return () => window.removeEventListener("speakkit:open-meeting", on);
  }, []);
  if (open)
    return (
      <Frame tab="meetings" meetings={meetings} setTab={setTab} lead="Dictations, transcripts and meetings, kept on this computer.">
        <MeetingView id={open} tick={push.tick} onBack={() => setOpen(null)} onDeleted={() => setOpen(null)} />
      </Frame>
    );
  const actions = <Button onClick={openMeetingSettings}>Meeting settings</Button>;
  return (
    <Frame tab="meetings" meetings={meetings} setTab={setTab} lead="Dictations, transcripts and meetings, kept on this computer." actions={actions}>
      <MeetingsTab push={push} settings={settings} onOpen={setOpen} onSettings={openMeetingSettings} search={search} setSearch={setSearch} />
    </Frame>
  );
}

/** History: the Dictations tab (the existing dictation history) and the Transcripts tab. */
export function HistoryRoute({ openSettings, openMeetingSettings }: { openSettings(): void; openMeetingSettings(): void }) {
  const push = usePush();
  const [tab, setTab] = useState<Tab>("dictations");
  const lead = useDictationLead();
  const meetingsPush = useMeetingsPush();
  const { view: meetingsView } = useMeetingsSettings(meetingsPush.tick);
  // Hidden while the feature is off; a tab that was open when it was turned off falls back to the dictations.
  const meetings = meetingsView?.config.enabled ?? false;
  const recording = push.recording !== null;
  const [initial] = useState(takeOpen);
  useEffect(() => {
    if (initial) setTab("meetings");
  }, [initial]);
  // A recording that is running is shown whichever tab was open when it started (the tray can start one too).
  useEffect(() => {
    if (recording) setTab("transcripts");
  }, [recording]);
  if (tab === "meetings" && (meetings || initial)) return <MeetingsPage meetings={meetings} setTab={setTab} openMeetingSettings={openMeetingSettings} initial={initial} />;
  if (tab === "transcripts") return <TranscriptsPage push={push} meetings={meetings} setTab={setTab} openSettings={openSettings} />;
  return (
    <Frame tab={tab === "meetings" ? "dictations" : tab} meetings={meetings} setTab={setTab} lead={lead}>
      <Suspense fallback={null}>
        <DictationHistory embedded />
      </Suspense>
    </Frame>
  );
}
