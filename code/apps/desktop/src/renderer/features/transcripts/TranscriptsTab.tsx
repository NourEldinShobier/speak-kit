import { useState } from "react";
import type { Row } from "@speakkit/transcripts/pure";
import { Banner, Button, EmptyState, Skeleton, TextInput, onArrowKeys } from "@speakkit/ui";
import type { Push, SettingsView } from "../../../shared/transcripts/contract";
import { transcripts } from "./api";
import { ExportNotice, type ExportResult } from "./ExportMenu";
import { TranscriptRow } from "./TranscriptRow";
import { useTranscriptList, type ListState } from "./useTranscripts";

interface Props {
  push: Push;
  settings: SettingsView | null;
  onOpen(id: string): void;
  onImport(): void;
  onRecord(): void;
  onTrash(): void;
  /** A transcript was moved to the Trash from the list: the page offers Undo. */
  onDeleted(r: { id: string; title: string }): void;
  /** The search text lives in the page so it survives opening a transcript and coming back. */
  search: string;
  setSearch(s: string): void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const keepText = (c: SettingsView["config"]): string => (c.textDays === 0 ? "Transcripts are kept until you delete them" : `Transcripts move to Trash after ${c.textDays} days`);
const audioKeepText = (c: SettingsView["config"]): string =>
  c.keepAudio ? ` and the audio of recordings is deleted after ${plural(c.audioDays, "day", "days")}` : " and the audio of recordings is deleted when the transcript is done";

/** The line under the list: how many, and how long they are kept. */
const footer = (count: number, s: SettingsView | null): string => {
  const kept = s ? `${keepText(s.config)}${audioKeepText(s.config)}. ` : "";
  return `${plural(count, "transcript", "transcripts")}. ${kept}Change this in Transcript settings.`;
};

function Rows({
  rows,
  query,
  settings,
  onOpen,
  onDelete,
  onExport,
  reload,
}: {
  rows: Row[];
  query: string;
  settings: SettingsView | null;
  onOpen(id: string): void;
  onDelete(r: Row): void;
  onExport(r: ExportResult): void;
  reload(): void;
}) {
  const now = Date.now();
  const audioDays = settings?.config.audioDays ?? 7;
  return (
    <div className="lm-card tr-list" role="list" aria-label="Transcripts" onKeyDown={onArrowKeys(".tr-row__main")}>
      {rows.map((r) => (
        <div key={r.id} role="listitem">
          <TranscriptRow
            row={r}
            now={now}
            audioDays={audioDays}
            query={query}
            onOpen={() => onOpen(r.id)}
            onDelete={() => onDelete(r)}
            onCancel={() => void transcripts.cancel(r.id).then(reload)}
            onResume={() => void transcripts.resume(r.id).then(reload)}
            onExport={onExport}
          />
        </div>
      ))}
    </div>
  );
}

function Loading() {
  return (
    <div className="lm-card tr-loading" aria-busy="true" aria-label="Loading transcripts">
      {[0, 1, 2].map((i) => (
        <div key={i} className="tr-row tr-row--skeleton">
          <Skeleton lines={[45, 25]} />
        </div>
      ))}
    </div>
  );
}

function Notices({ push, settings, recovered, onOpen, onResume }: { push: Push; settings: SettingsView | null; recovered: Row | undefined; onOpen(id: string): void; onResume(id: string): void }) {
  return (
    <>
      {settings?.notice.newer ? (
        <Banner tone="warning" title="Saved by a newer Speak Kit">
          Your transcripts were saved by a newer version. They are shown here but not changed. Update Speak Kit to edit them.
        </Banner>
      ) : null}
      {settings?.notice.unreadable ? (
        <Banner tone="warning" title="Transcripts could not be opened">
          The list of transcripts is locked or not readable right now, so nothing is changed. Close other programs that use the folder and restart Speak Kit.
        </Banner>
      ) : null}
      {settings?.notice.recoveredFrom ? (
        <Banner tone="warning">The list of transcripts could not be read, so it was set aside and a new one started. Your audio and words may still be in the folder.</Banner>
      ) : null}
      {recovered ? (
        <Banner
          tone="info"
          icon="history"
          title="Your last recording was recovered"
          action={
            <div className="tr-notice__actions">
              <Button size="sm" onClick={() => onOpen(recovered.id)}>
                Open
              </Button>
              <Button size="sm" variant="primary" onClick={() => onResume(recovered.id)}>
                Transcribe now
              </Button>
            </div>
          }
        >
          The app closed while it was recording. What was saved is kept.
        </Banner>
      ) : null}
      {push.notice ? <Banner tone="warning">{push.notice}</Banner> : null}
    </>
  );
}

interface BodyProps extends Pick<Props, "settings" | "onOpen" | "onImport" | "onRecord"> {
  list: ListState;
  rows: Row[] | null;
  search: string;
  onDelete(r: Row): void;
  onExport(r: ExportResult): void;
}

/** The list or the state that stands in for it: error, loading, nothing yet, or nothing found. */
function Body({ list, rows, search, settings, onOpen, onImport, onRecord, onDelete, onExport }: BodyProps) {
  if (list.error) {
    return (
      <div className="lm-card">
        <EmptyState icon="alert-triangle" title="Transcripts could not be loaded" primary={{ label: "Try again", onClick: list.reload }}>
          Something went wrong while reading your transcripts. They are still on this computer.
        </EmptyState>
      </div>
    );
  }
  if (rows === null) return <Loading />;
  if (rows.length === 0 && search.trim() !== "") return <p className="tr-none">Nothing matches that search.</p>;
  if (rows.length === 0) {
    return (
      <div className="lm-card">
        <EmptyState icon="microphone" title="No transcripts yet" primary={{ label: "Import audio file", onClick: onImport }} secondary={{ label: "Record a conversation", onClick: onRecord }}>
          Turn a recording or an audio file into text. Everything stays on this computer.
        </EmptyState>
      </div>
    );
  }
  return (
    <>
      <Rows rows={rows} query={search} settings={settings} onOpen={onOpen} onDelete={onDelete} onExport={onExport} reload={list.reload} />
      <p className="tr-foot">{search.trim() !== "" ? `${plural(rows.length, "match", "matches")}.` : footer(rows.length, settings)}</p>
    </>
  );
}

/** The Transcripts tab of History: search and Trash, the list of transcripts with their progress, the recovered-recording banner, and the empty, loading and error states. */
export function TranscriptsTab({ push, settings, onOpen, onImport, onRecord, onTrash, onDeleted, search, setSearch }: Props) {
  const list = useTranscriptList(search, false, push.tick);
  const trash = useTranscriptList("", true, push.tick);
  const [result, setResult] = useState<ExportResult | null>(null);
  // The recorder card above shows a recording in progress; it joins the list when it is saved.
  const rows = list.rows?.filter((r) => r.status !== "recording") ?? null;
  const recovered = rows?.find((r) => r.recovered && r.status === "interrupted");
  const trashed = trash.rows?.length ?? 0;
  const remove = async (r: Row) => {
    await transcripts.trash(r.id);
    onDeleted({ id: r.id, title: r.title });
    list.reload();
  };
  return (
    <>
      <div className="tr-bar">
        <TextInput
          icon="search"
          aria-label="Search titles and transcripts"
          placeholder="Search titles and transcripts"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="tr-search"
        />
        <Button iconLeft="trash" onClick={onTrash} aria-label={`Trash, ${plural(trashed, "transcript", "transcripts")}`}>
          Trash
          {trashed ? <span className="tr-count">{trashed}</span> : null}
        </Button>
      </div>
      <Notices push={push} settings={settings} recovered={recovered} onOpen={onOpen} onResume={(id) => void transcripts.resume(id).then(list.reload)} />
      <ExportNotice result={result} onClose={() => setResult(null)} />
      <Body list={list} rows={rows} search={search} settings={settings} onOpen={onOpen} onImport={onImport} onRecord={onRecord} onDelete={(r) => void remove(r)} onExport={setResult} />
    </>
  );
}
