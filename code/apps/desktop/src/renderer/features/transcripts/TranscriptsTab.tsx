import type { Row } from "@speakkit/transcripts/pure";
import { TEXT_DAYS } from "@speakkit/transcripts/pure";
import { Banner, EmptyState, Skeleton, TextInput, onArrowKeys } from "@speakkit/ui";
import type { Push, SettingsView } from "../../../shared/transcripts/contract";
import { transcripts } from "./api";
import { TranscriptRow } from "./TranscriptRow";
import { useTranscriptList, type ListState } from "./useTranscripts";

interface Props {
  push: Push;
  settings: SettingsView | null;
  onOpen(id: string): void;
  onImport(): void;
  /** Delete was pressed on a row: the page asks for confirmation. */
  onDelete(r: { id: string; title: string }): void;
  /** The search text lives in the page so it survives opening a transcript and coming back. */
  search: string;
  setSearch(s: string): void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The line under the list: how many, and how long they are kept. */
const footer = (count: number): string => `${plural(count, "transcript", "transcripts")}. Transcripts are deleted after ${TEXT_DAYS} days.`;

function Rows({ rows, query, onOpen, onDelete, reload }: { rows: Row[]; query: string; onOpen(id: string): void; onDelete(r: Row): void; reload(): void }) {
  const now = Date.now();
  return (
    <div className="lm-card tr-list" role="list" aria-label="Transcripts" onKeyDown={onArrowKeys(".tr-row__main")}>
      {rows.map((r) => (
        <div key={r.id} role="listitem">
          <TranscriptRow
            row={r}
            now={now}
            query={query}
            onOpen={() => onOpen(r.id)}
            onDelete={() => onDelete(r)}
            onCancel={() => void transcripts.cancel(r.id).then(reload)}
            onResume={() => void transcripts.resume(r.id).then(reload)}
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

function Notices({ settings }: { settings: SettingsView | null }) {
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
    </>
  );
}

interface BodyProps extends Pick<Props, "onOpen" | "onImport"> {
  list: ListState;
  rows: Row[] | null;
  search: string;
  onDelete(r: Row): void;
}

/** The list or the state that stands in for it: error, loading, nothing yet, or nothing found. */
function Body({ list, rows, search, onOpen, onImport, onDelete }: BodyProps) {
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
        <EmptyState icon="file-text" title="No transcripts yet" primary={{ label: "Import audio file", onClick: onImport }}>
          Turn an audio file into text. Everything stays on this computer.
        </EmptyState>
      </div>
    );
  }
  return (
    <>
      <Rows rows={rows} query={search} onOpen={onOpen} onDelete={onDelete} reload={list.reload} />
      <p className="tr-foot">{search.trim() !== "" ? `${plural(rows.length, "match", "matches")}.` : footer(rows.length)}</p>
    </>
  );
}

/** The Transcripts tab of History: search, the list of transcripts with their progress, and the empty, loading and error states. */
export function TranscriptsTab({ push, settings, onOpen, onImport, onDelete, search, setSearch }: Props) {
  const list = useTranscriptList(search, push.tick);
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
      </div>
      <Notices settings={settings} />
      <Body list={list} rows={list.rows} search={search} onOpen={onOpen} onImport={onImport} onDelete={(r) => onDelete({ id: r.id, title: r.title })} />
    </>
  );
}
