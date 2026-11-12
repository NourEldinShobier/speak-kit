import { useMemo, useState } from "react";
import type { Row } from "@speakkit/meetings/pure";
import { Banner, Button, EmptyState, Skeleton, TextInput } from "@speakkit/ui";
import type { Push, SettingsView } from "../../../shared/meetings/contract";
import { meetings } from "./api";
import { MeetingRow } from "./MeetingRow";
import { footerText, groupByDay, plural } from "./model";
import { useMeetingList, type ListState } from "./useMeetings";

interface Props {
  push: Push;
  settings: SettingsView | null;
  onOpen(id: string): void;
  onSettings(): void;
  search: string;
  setSearch(s: string): void;
}

function Loading() {
  return (
    <div className="lm-card tr-loading" aria-busy="true" aria-label="Loading meetings">
      {[0, 1, 2].map((i) => (
        <div key={i} className="tr-row tr-row--skeleton">
          <Skeleton lines={[45, 25]} />
        </div>
      ))}
    </div>
  );
}

function Notices({ push, settings, failed, onClose, onRetry }: { push: Push; settings: SettingsView | null; failed: Row | undefined; onClose(): void; onRetry(id: string): void }) {
  return (
    <>
      {settings?.notice.newer ? (
        <Banner tone="warning" title="Saved by a newer Speak Kit">
          Your meetings were saved by a newer version. They are shown here but not changed. Update Speak Kit to edit them.
        </Banner>
      ) : null}
      {settings?.notice.recoveredFrom ? (
        <Banner tone="warning">The list of meetings could not be read, so it was set aside and a new one started. Your audio may still be in the folder.</Banner>
      ) : null}
      {push.notice ? <Banner tone="warning">{push.notice}</Banner> : null}
      {failed ? (
        <Banner
          tone="error"
          title={failed.status === "failed" ? "A meeting could not be finished" : "A meeting was interrupted"}
          action={
            <div className="tr-notice__actions">
              {failed.audioBytes > 0 ? (
                <Button size="sm" onClick={() => onRetry(failed.id)}>
                  Try again
                </Button>
              ) : null}
              <Button size="sm" onClick={onClose} aria-label="Close this notice">
                Close
              </Button>
            </div>
          }
        >
          {failed.failure?.message ?? "Something went wrong."} You can delete it from the list below.
        </Banner>
      ) : null}
    </>
  );
}

interface ListProps {
  rows: Row[];
  push: Push;
  search: string;
  trashed: boolean;
  onOpen(id: string): void;
  reload(): void;
}

function Days({ rows, push, search, trashed, onOpen, reload }: ListProps) {
  const now = Date.now();
  const groups = useMemo(() => groupByDay(rows, now), [rows, now]);
  const after = (p: Promise<unknown>) => void p.then(reload);
  return (
    <>
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h2 className="cap-day">{g.label}</h2>
          <div className="lm-card tr-list" role="list" aria-label={`Meetings, ${g.label}`}>
            {g.rows.map((r) => (
              <div key={r.id} role="listitem">
                <MeetingRow
                  row={r}
                  now={now}
                  live={push.recording?.id === r.id ? push.recording : null}
                  query={search}
                  trashed={trashed}
                  onOpen={() => onOpen(r.id)}
                  onDelete={() => after(r.status === "failed" || r.status === "interrupted" || trashed ? meetings.remove(r.id) : meetings.trash(r.id))}
                  onRetry={() => after(meetings.retry(r.id))}
                  onRestore={() => after(meetings.restore(r.id))}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/** The list or the state that stands in for it: error, loading, nothing yet, or nothing found. */
function Body({
  list,
  search,
  settings,
  trashed,
  push,
  onOpen,
  onSettings,
}: {
  list: ListState;
  search: string;
  settings: SettingsView | null;
  trashed: boolean;
  push: Push;
  onOpen(id: string): void;
  onSettings(): void;
}) {
  const rows = list.rows;
  if (list.error) {
    return (
      <div className="lm-card">
        <EmptyState icon="alert-triangle" title="Meetings could not be loaded" primary={{ label: "Try again", onClick: list.reload }}>
          Something went wrong while reading your meetings. They are still on this computer.
        </EmptyState>
      </div>
    );
  }
  if (rows === null) return <Loading />;
  if (rows.length === 0 && search.trim() !== "") return <p className="tr-none">Nothing matches that search.</p>;
  if (rows.length === 0 && trashed) return <p className="tr-none">Nothing in the Trash.</p>;
  if (rows.length === 0) {
    return (
      <div className="lm-card">
        <EmptyState icon="users" title="No meetings yet" primary={{ label: "Meeting settings", onClick: onSettings }}>
          Speak Kit can notice a call and offer to record it. Audio and text stay on this computer, and nothing is recorded until you choose Record.
        </EmptyState>
      </div>
    );
  }
  return (
    <>
      <Days rows={rows} push={push} search={search} trashed={trashed} onOpen={onOpen} reload={list.reload} />
      <p className="tr-foot">{footerFor(rows.length, search, settings)}</p>
    </>
  );
}

function footerFor(count: number, search: string, settings: { config: Parameters<typeof footerText>[1] } | null | undefined): string {
  if (search.trim() !== "") return `${plural(count, "match", "matches")}.`;
  return settings ? footerText(count, settings.config) : plural(count, "meeting", "meetings");
}

/** The Meetings tab of History: search, the Trash switch, the meetings grouped by day, the notices, and the empty, loading and error states. */
export function MeetingsTab({ push, settings, onOpen, onSettings, search, setSearch }: Props) {
  const [trashed, setTrashed] = useState(false);
  const [closed, setClosed] = useState<string | null>(null);
  const list = useMeetingList(search, trashed, push.tick);
  const failed = list.rows?.find((r) => (r.status === "failed" || r.status === "interrupted") && r.id !== closed);
  return (
    <>
      <div className="tr-bar">
        <TextInput
          icon="search"
          aria-label="Search titles, summaries and what was said"
          placeholder="Search titles, summaries and what was said"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="tr-search"
        />
        <Button iconLeft="trash" onClick={() => setTrashed((t) => !t)} aria-pressed={trashed} aria-label={trashed ? "Back to meetings" : "Trash"}>
          {trashed ? "Meetings" : "Trash"}
        </Button>
      </div>
      <Notices push={push} settings={settings} failed={trashed ? undefined : failed} onClose={() => failed && setClosed(failed.id)} onRetry={(id) => void meetings.retry(id).then(list.reload)} />
      <Body list={list} search={search} settings={settings} trashed={trashed} push={push} onOpen={onOpen} onSettings={onSettings} />
    </>
  );
}
