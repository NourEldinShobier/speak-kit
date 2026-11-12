import { useCallback, useEffect, useState } from "react";
import { stamp, type Detail, type Line, type NoteVersion } from "@speakkit/meetings/pure";
import { Banner, Button, Chip, DropdownMenu, Icon, DropdownMenuItem, Select, Skeleton, TextInput } from "@speakkit/ui";
import { attempt, meetings } from "./api";
import { Marked } from "./Marked";
import { lengthText, plural, timeText } from "./model";

interface Props {
  id: string;
  tick: number;
  onBack(): void;
  onDeleted(): void;
}

const when = (t: number) => `${new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${timeText(t)}`;

function Title({ d, reload }: { d: Detail; reload(): void }) {
  const [text, setText] = useState(d.title);
  useEffect(() => setText(d.title), [d.title]);
  const save = () => {
    const t = text.trim();
    if (t && t !== d.title) void meetings.rename(d.id, t).then(reload);
    else setText(d.title);
  };
  return (
    <TextInput
      aria-label="Meeting title"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), undefined)}
      className="mt-title"
    />
  );
}

function Notes({ d, version, reload }: { d: Detail; version: NoteVersion | undefined; reload(): void }) {
  const [busy, setBusy] = useState(false);
  const regenerate = () => {
    setBusy(true);
    void meetings.regenerateNotes(d.id).then(() => (setBusy(false), reload()));
  };
  if (d.notes.state === "failed") {
    return (
      <Banner
        tone="warning"
        title="Notes could not be written"
        action={
          <Button size="sm" variant="primary" disabled={busy} onClick={regenerate}>
            Regenerate notes
          </Button>
        }
      >
        {d.notes.failure?.message ?? "The transcript and the audio are unchanged."}
      </Banner>
    );
  }
  if (d.notes.state === "writing") return <Banner tone="info">Writing the notes. The transcript is ready below.</Banner>;
  if (!version) return null;
  return (
    <section className="lm-card mt-notes" aria-label="Summary">
      <p className="mt-summary">{version.summary}</p>
      <p className="mt-writer">
        {version.kind === "vocabulary" ? "Your vocabulary applied to the notes written by " : "Written by "}
        {version.kind === "vocabulary" ? "OpenAI" : version.writer}. The transcript below is exactly what was heard.
      </p>
    </section>
  );
}

function Chapters({ version, id }: { version: NoteVersion; id: string }) {
  if (!version.chapters.length) return null;
  return (
    <section aria-label="Chapters" className="mt-chapters">
      <h2 className="cap-day">{plural(version.chapters.length, "chapter", "chapters")}</h2>
      <div className="lm-card tr-list" role="list">
        {version.chapters.map((c, i) => (
          <div key={`${c.start}-${i}`} role="listitem" className="mt-chapter">
            <span className="mt-chapter__time">{stamp(c.start)}</span>
            <span className="mt-chapter__title">{c.title}</span>
            <Button size="sm" aria-label={`Copy section: ${c.title}`} onClick={() => void meetings.copyText(id, { from: c.start, to: version.chapters[i + 1]?.start ?? Number.MAX_SAFE_INTEGER })}>
              Copy section
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

function Transcript({ lines, query }: { lines: Line[]; query: string }) {
  if (!lines.length) return <p className="tr-none">No words were heard in this meeting.</p>;
  return (
    <div className="lm-card mt-lines" role="list" aria-label="Transcript">
      {lines.map((l, i) => (
        <div key={`${l.start}-${l.who}-${i}`} role="listitem" className="mt-line" data-who={l.who}>
          <span className="mt-line__who">{l.who}</span>
          <span className="mt-line__time">{stamp(l.start)}</span>
          <span className="mt-line__text">
            <Marked text={l.text} query={query} />
          </span>
        </div>
      ))}
    </div>
  );
}

function Versions({ d, shown, setShown, reload }: { d: Detail; shown: number; setShown(n: number): void; reload(): void }) {
  if (d.versions.length === 0) return null;
  return (
    <div className="mt-versions">
      <Select
        label="Notes version"
        value={String(shown)}
        onChange={(v) => setShown(Number(v))}
        options={d.versions.map((v) => ({ value: String(v.n), label: `${v.kind === "vocabulary" ? "With your vocabulary" : "As written"}, ${when(v.at)}` }))}
      />
      <Button onClick={() => void meetings.applyVocabulary(d.id).then(reload)}>Apply vocabulary</Button>
    </div>
  );
}

function Header({ d, onBack, onDelete }: { d: Detail; onBack(): void; onDelete(): void }) {
  const running = d.status === "recording" || d.status === "saving" || d.status === "transcribing";
  return (
    <div className="mt-head">
      <button type="button" className="tr-back" onClick={onBack} aria-label="Back to meetings">
        <Icon name="arrow-left" size={14} />
        Meetings
      </button>
      <span className="mt-meta">
        {d.providerName} · {when(d.startedAt)} · {d.durationSec ? lengthText(d.durationSec) : "length unknown"}
      </span>
      <DropdownMenu trigger={<Button aria-label="Copy and files" iconLeft="dots" />} align="end">
        <DropdownMenuItem icon="copy" onSelect={() => void meetings.copyText(d.id)}>
          Copy transcript
        </DropdownMenuItem>
        <DropdownMenuItem icon="copy" onSelect={() => void meetings.copyNew(d.id)}>
          Copy new
        </DropdownMenuItem>
        <DropdownMenuItem icon="folder" onSelect={() => void meetings.writeFiles(d.id).then(() => meetings.reveal(d.id))}>
          Show in folder
        </DropdownMenuItem>
        <DropdownMenuItem icon="trash" destructive onSelect={onDelete} disabled={running}>
          Delete meeting
        </DropdownMenuItem>
      </DropdownMenu>
    </div>
  );
}

/** One meeting: its title, the summary with the writer named, the chapters with Copy section, and the transcript with You and Them. Notes that failed say so and can be written again; the transcript is never touched by the notes. */
export function MeetingView({ id, tick, onBack, onDeleted }: Props) {
  const [d, setD] = useState<Detail | null | undefined>(undefined);
  const [shown, setShown] = useState(0);
  const load = useCallback(() => void attempt(meetings.get(id)).then(setD), [id]);
  useEffect(load, [load, tick]);
  if (d === undefined)
    return (
      <div className="tr-loading" aria-busy="true" aria-label="Loading meeting">
        <Skeleton lines={[50, 80, 60]} />
      </div>
    );
  if (d === null) {
    return (
      <>
        <Header d={{ id } as Detail} onBack={onBack} onDelete={onBack} />
        <Banner tone="error">This meeting could not be found. It may have been deleted.</Banner>
      </>
    );
  }
  const version = d.versions.find((v) => v.n === shown) ?? d.versions.at(-1);
  return (
    <div className="mt-view" data-testid="meeting-view">
      <Header d={d} onBack={onBack} onDelete={() => void meetings.trash(d.id).then(onDeleted)} />
      <div className="mt-titlebar">
        <Title d={d} reload={load} />
        {d.titleTemporary ? <Chip>Temporary title</Chip> : null}
      </div>
      <Notes d={d} version={version} reload={load} />
      {version ? <Versions d={d} shown={version.n} setShown={setShown} reload={load} /> : null}
      {version ? <Chapters version={version} id={d.id} /> : null}
      {d.status === "failed" || d.status === "interrupted" ? <Banner tone="error">{d.failure?.message ?? "This meeting could not be finished."}</Banner> : null}
      <Transcript lines={d.lines} query="" />
    </div>
  );
}
