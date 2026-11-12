import { lazy, Suspense, useEffect, useState } from "react";
import { Button, DropdownMenu, DropdownMenuItem, Modal, Segmented, Toast } from "@speakkit/ui";
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
const useDictationLead = () => {
  const [lead, setLead] = useState("What you dictated, saved on this computer.");
  useEffect(() => {
    void import("../dictation").then((m) => m.historyLeadNow()).then(setLead, () => {});
  }, []);
  return lead;
};

type View = { kind: "list" } | { kind: "transcript"; id: string } | { kind: "trash" };
type Tab = "dictations" | "transcripts";

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

/** History: the Dictations tab (the existing dictation history) and the Transcripts tab, with its transcript view, Trash, import dialog and recorder. */
export function HistoryRoute({ openSettings }: { openSettings(): void }) {
  const push = usePush();
  const { view: settings } = useSettingsView(push.tick);
  const [tab, setTab] = useState<Tab>("dictations");
  const [view, setView] = useState<View>({ kind: "list" });
  const [importing, setImporting] = useState(false);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [deleteAll, setDeleteAll] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [undo, setUndo] = useState<{ id: string; title: string } | null>(null);
  const lead = useDictationLead();
  const recording = push.recording !== null;
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(t);
  }, [undo]);
  // A recording that is running is shown whichever tab was open when it started (the tray can start one too).
  useEffect(() => {
    if (recording) {
      setTab("transcripts");
      setView({ kind: "list" });
    }
  }, [recording]);

  if (tab === "transcripts" && view.kind === "transcript") {
    return (
      <>
        <TranscriptView
          id={view.id}
          push={push}
          audioDays={settings?.config.audioDays ?? 7}
          modelName={settings?.model.name ?? ""}
          trashDays={settings?.config.trashDays ?? 30}
          onBack={() => setView({ kind: "list" })}
          onDeleted={(r) => (setUndo(r), setView({ kind: "list" }))}
        />
        {undo ? <UndoToast undo={undo} done={() => setUndo(null)} /> : null}
      </>
    );
  }
  if (tab === "transcripts" && view.kind === "trash") return <TrashPage push={push} settings={settings} onBack={() => setView({ kind: "list" })} />;
  return (
    <div className="sk-page tr-page">
      <div className="sk-page__bar">
        <div className="sk-page__head">
          <h1>History</h1>
          <p>{tab === "dictations" ? lead : "Dictations and transcripts, kept on this computer."}</p>
        </div>
        {tab === "transcripts" ? (
          <div className="tr-actions">
            <Button iconLeft="upload" disabled={recording} onClick={() => setImporting(true)}>
              Import audio file
            </Button>
            <Button variant="primary" iconLeft="microphone" disabled={recording} onClick={() => setRecorderOpen(true)}>
              Record a conversation
            </Button>
            <DropdownMenu trigger={<Button aria-label="More" iconLeft="dots" />} align="end">
              <DropdownMenuItem icon="trash" onSelect={() => setView({ kind: "trash" })}>
                Trash
              </DropdownMenuItem>
              <DropdownMenuItem icon="folder" onSelect={openSettings}>
                Transcript settings
              </DropdownMenuItem>
              <DropdownMenuItem icon="trash" destructive onSelect={() => void transcripts.list().then((r) => setDeleteAll(r.length))}>
                Delete all transcripts
              </DropdownMenuItem>
            </DropdownMenu>
          </div>
        ) : null}
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
      {tab === "dictations" ? (
        <Suspense fallback={null}>
          <DictationHistory embedded back={() => {}} />
        </Suspense>
      ) : (
        <>
          {recording || recorderOpen ? <RecorderCard push={push} onClose={() => setRecorderOpen(false)} onStarted={() => {}} /> : null}
          <TranscriptsTab
            push={push}
            settings={settings}
            search={search}
            setSearch={setSearch}
            onOpen={(id) => setView({ kind: "transcript", id })}
            onImport={() => setImporting(true)}
            onRecord={() => setRecorderOpen(true)}
            onTrash={() => setView({ kind: "trash" })}
            onDeleted={setUndo}
          />
        </>
      )}
      <ImportDialog open={importing} settings={settings} onClose={() => setImporting(false)} onStarted={() => setSearch("")} />
      <DeleteAllDialog
        open={deleteAll !== null}
        count={deleteAll ?? 0}
        onClose={() => setDeleteAll(null)}
        onConfirm={() => {
          setDeleteAll(null);
          void transcripts.list().then((rows) => Promise.all(rows.filter((r) => r.status !== "recording").map((r) => transcripts.trash(r.id))));
        }}
      />
      {undo ? <UndoToast undo={undo} done={() => setUndo(null)} /> : null}
    </div>
  );
}

function UndoToast({ undo, done }: { undo: { id: string; title: string }; done(): void }) {
  return (
    <div className="tr-toast">
      <Toast tone="delete" action={{ label: "Undo", onClick: () => void transcripts.restore(undo.id).then(done) }}>
        Moved to Trash: {undo.title}
      </Toast>
    </div>
  );
}
