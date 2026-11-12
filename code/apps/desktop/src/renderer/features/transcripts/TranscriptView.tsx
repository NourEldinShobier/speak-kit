import { useEffect, useMemo, useRef, useState } from "react";
import { clock, findMatches, type Detail } from "@speakkit/transcripts/pure";
import { Banner, Button, EmptyState, Icon, IconButton, Skeleton, TextInput } from "@speakkit/ui";
import type { Push } from "../../../shared/transcripts/contract";
import { transcripts } from "./api";
import { ExportMenu, ExportNotice, type ExportResult } from "./ExportMenu";
import { audioText, dateText, lengthText, matchText, parseTime, pieces, segmentAt } from "./model";
import { audioDaysLeft } from "./TranscriptRow";

const PAGE = 400;

interface Props {
  id: string;
  push: Push;
  audioDays: number;
  modelName: string;
  trashDays: number;
  onBack(): void;
  onDeleted(r: { id: string; title: string }): void;
}

function Title({ detail, onSaved }: { detail: Detail; onSaved(): void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(detail.title);
  const save = async () => {
    await transcripts.rename(detail.id, text);
    setEditing(false);
    onSaved();
  };
  if (!editing) {
    return (
      <h1 className="tr-title">
        <span>{detail.title}</span>
        <IconButton
          name="pencil"
          label="Rename"
          size={28}
          variant="secondary"
          onClick={() => {
            setText(detail.title);
            setEditing(true);
          }}
        />
      </h1>
    );
  }
  return (
    <form
      className="tr-title tr-title--edit"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <TextInput
        autoFocus
        onFocus={(e) => e.target.select()}
        aria-label="Title"
        value={text}
        maxLength={200}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
      />
      <Button type="submit" variant="primary" disabled={!text.trim()}>
        Save
      </Button>
      <Button onClick={() => setEditing(false)}>Cancel</Button>
    </form>
  );
}

function Lines({ detail, query, current, limit, setLimit }: { detail: Detail; query: string; current: number; limit: number; setLimit(n: number): void }) {
  const matches = useMemo(() => findMatches(detail.segments, query), [detail.segments, query]);
  const shown = detail.segments.slice(0, limit);
  const perSegment = useMemo(() => {
    const m = new Map<number, { from: number; to: number; n: number }[]>();
    matches.forEach((x, n) => m.set(x.segment, [...(m.get(x.segment) ?? []), { from: x.from, to: x.to, n }]));
    return m;
  }, [matches]);
  return (
    <>
      <ol className="lm-card tr-lines" aria-label="Transcript">
        {shown.map((s, i) => {
          const ranges = perSegment.get(i) ?? [];
          return (
            <li key={i} className="tr-line" data-seg={i} data-current={ranges.some((r) => r.n === current) || undefined}>
              <span className="tr-line__time">{clock(s.start)}</span>
              <span className="tr-line__text">
                {pieces(s.text, ranges, ranges[0]?.n ?? 0).map((p, k) =>
                  p.hit ? (
                    <mark key={k} className="tr-mark" data-current={p.n === current || undefined}>
                      {p.text}
                    </mark>
                  ) : (
                    p.text
                  ),
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {detail.segments.length > limit ? (
        <p className="tr-foot">
          Showing the first {limit} of {detail.segments.length} lines.{" "}
          <Button size="sm" onClick={() => setLimit(limit + PAGE)}>
            Show more
          </Button>
        </p>
      ) : null}
    </>
  );
}

/** One transcript: title (renamable), Copy, Export and delete, the facts about it, search inside it with previous and next, a jump to a time, and its lines with their times. */
export function TranscriptView({ id, push, audioDays, modelName, trashDays, onBack, onDeleted }: Props) {
  const [detail, setDetail] = useState<Detail | null | "gone">(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(0);
  const [limit, setLimit] = useState(PAGE);
  const [jump, setJump] = useState("");
  const [badJump, setBadJump] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [n, setN] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    transcripts.get(id).then(
      (d) => live && (setDetail(d ?? "gone"), setError(false)),
      () => live && setError(true),
    );
    return () => {
      live = false;
    };
  }, [id, push.tick, n]);
  const d = detail && detail !== "gone" ? detail : null;
  const matches = useMemo(() => (d ? findMatches(d.segments, query) : []), [d, query]);
  const go = (seg: number) => {
    if (seg >= limit) setLimit(Math.ceil((seg + 1) / PAGE) * PAGE);
    requestAnimationFrame(() => root.current?.querySelector(`[data-seg="${seg}"]`)?.scrollIntoView({ block: "center" }));
  };
  const step = (by: number) => {
    if (!matches.length) return;
    const next = (current + by + matches.length) % matches.length;
    setCurrent(next);
    go(matches[next]!.segment);
  };
  useEffect(() => setCurrent(0), [query]);
  const back = (
    <button type="button" className="tr-back" onClick={onBack}>
      <Icon name="arrow-left" size={12} /> Transcripts
    </button>
  );
  if (error) {
    return (
      <div className="sk-page tr-page">
        {back}
        <div className="lm-card">
          <EmptyState icon="alert-triangle" title="This transcript could not be loaded" primary={{ label: "Try again", onClick: () => (setError(false), setN(n + 1)) }} />
        </div>
      </div>
    );
  }
  if (detail === "gone") {
    return (
      <div className="sk-page tr-page">
        {back}
        <div className="lm-card">
          <EmptyState icon="file-text" title="This transcript is gone" primary={{ label: "Back to the list", onClick: onBack }}>
            It was deleted, or removed after its retention period.
          </EmptyState>
        </div>
      </div>
    );
  }
  if (!d) {
    return (
      <div className="sk-page tr-page" aria-busy="true" aria-label="Loading the transcript">
        {back}
        <Skeleton lines={[30, 100, 100, 70]} />
      </div>
    );
  }
  const facts = [
    d.source === "file" ? `Imported ${d.sourceName ?? "audio file"}` : "Recorded conversation",
    dateText(d.createdAt, Date.now()).replace("Today, ", "today at ").replace("Yesterday, ", "yesterday at "),
    lengthText(d.durationSec),
    modelName,
  ]
    .filter(Boolean)
    .join(", ");
  const audio = audioText(d, audioDaysLeft(d, audioDays));
  const unfinished = d.status !== "done";
  return (
    <div className="sk-page tr-page" ref={root}>
      {back}
      <div className="tr-head">
        <Title detail={d} onSaved={() => setN(n + 1)} />
        <div className="tr-head__acts">
          <Button iconLeft="copy" onClick={() => void transcripts.copyText(d.id).then((ok) => setResult(ok ? { kind: "copied" } : { kind: "error", message: "That transcript is gone." }))}>
            Copy
          </Button>
          <ExportMenu id={d.id} onResult={setResult} trigger={<Button iconLeft="download">Export</Button>} />
          <IconButton name="trash" label="Delete" size={36} variant="secondary" onClick={() => void transcripts.trash(d.id).then(() => onDeleted({ id: d.id, title: d.title }))} />
        </div>
      </div>
      <p className="tr-facts">
        {facts}.{audio ? ` ${audio[0]!.toUpperCase()}${audio.slice(1)}.` : ""}{" "}
        {d.audioBytes > 0 ? (
          <button type="button" className="tr-link" onClick={() => void transcripts.deleteAudio(d.id).then(() => setN(n + 1))}>
            Delete audio
          </button>
        ) : null}
      </p>
      <ExportNotice result={result} onClose={() => setResult(null)} />
      {unfinished ? (
        <Banner
          tone={d.status === "failed" ? "error" : "info"}
          title={d.status === "failed" ? "Transcription stopped" : d.status === "transcribing" || d.status === "queued" ? "Still transcribing" : "Transcription is not finished"}
        >
          {d.status === "failed" ? (d.failure?.message ?? "It failed.") : "What is below is what has been transcribed so far."}
        </Banner>
      ) : null}
      <div className="tr-find">
        <TextInput icon="search" aria-label="Search in this transcript" placeholder="Search in this transcript" value={query} onChange={(e) => setQuery(e.target.value)} className="tr-find__field" />
        {query.trim() ? (
          <span className="tr-find__count" role="status">
            {matchText(current, matches.length)}
          </span>
        ) : null}
        <IconButton name="chevron-up" label="Previous match" size={36} variant="secondary" disabled={!matches.length} onClick={() => step(-1)} />
        <IconButton name="chevron-down" label="Next match" size={36} variant="secondary" disabled={!matches.length} onClick={() => step(1)} />
        <TextInput
          aria-label="Jump to time"
          placeholder="Jump to 0:00"
          value={jump}
          error={badJump ? "Use 1:23 or 1:02:03" : undefined}
          className="tr-find__jump"
          onChange={(e) => (setJump(e.target.value), setBadJump(false))}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const t = parseTime(jump);
            if (t === null) return setBadJump(true);
            go(
              segmentAt(
                d.segments.map((s) => s.start),
                t,
              ),
            );
          }}
        />
      </div>
      {d.segments.length === 0 ? (
        <div className="lm-card">
          <EmptyState icon="microphone" title={unfinished ? "Nothing transcribed yet" : "No speech was found"}>
            {unfinished ? "The words appear here as they are ready." : "The audio had no speech in it, or it was too quiet to hear."}
          </EmptyState>
        </div>
      ) : (
        <Lines detail={d} query={query} current={current} limit={limit} setLimit={setLimit} />
      )}
      <p className="tr-foot">Transcribed on this computer. Deleting moves the transcript to Trash for {trashDays} days.</p>
    </div>
  );
}
