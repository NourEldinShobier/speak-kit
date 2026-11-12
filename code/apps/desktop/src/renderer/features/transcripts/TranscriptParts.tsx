import { useMemo, useState } from "react";
import { clock, type Detail, type Match } from "@speakkit/transcripts/pure";
import { Button, IconButton, TextInput } from "@speakkit/ui";
import { transcripts } from "./api";
import { ExportMenu, type ExportResult } from "./ExportMenu";
import { matchText, parseTime, pieces } from "./model";

export const PAGE = 400;

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

interface LinesProps {
  detail: Detail;
  query: string;
  matches: Match[];
  current: number;
  limit: number;
  setLimit(n: number): void;
}

export function Lines({ detail, query, matches, current, limit, setLimit }: LinesProps) {
  const perSegment = useMemo(() => {
    const m = new Map<number, { from: number; to: number; n: number }[]>();
    matches.forEach((x, n) => m.set(x.segment, [...(m.get(x.segment) ?? []), { from: x.from, to: x.to, n }]));
    return m;
  }, [matches]);
  return (
    <>
      <ol className="lm-card tr-lines" aria-label="Transcript" data-query={query || undefined}>
        {detail.segments.slice(0, limit).map((s, i) => {
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

interface FindProps {
  query: string;
  setQuery(q: string): void;
  current: number;
  total: number;
  onStep(by: number): void;
  onJump(sec: number): void;
}

/** Search inside the transcript (with previous and next) and a jump to a time. */
export function Find({ query, setQuery, current, total, onStep, onJump }: FindProps) {
  const [jump, setJump] = useState("");
  const [bad, setBad] = useState(false);
  const submit = () => {
    const t = parseTime(jump);
    if (t === null) setBad(true);
    else onJump(t);
  };
  return (
    <div className="tr-find">
      <TextInput icon="search" aria-label="Search in this transcript" placeholder="Search in this transcript" value={query} onChange={(e) => setQuery(e.target.value)} className="tr-find__field" />
      {query.trim() ? (
        <span className="tr-find__count" role="status">
          {matchText(current, total)}
        </span>
      ) : null}
      <IconButton name="chevron-up" label="Previous match" size={36} variant="secondary" disabled={total === 0} onClick={() => onStep(-1)} />
      <IconButton name="chevron-down" label="Next match" size={36} variant="secondary" disabled={total === 0} onClick={() => onStep(1)} />
      <TextInput
        aria-label="Jump to time"
        placeholder="Jump to 0:00"
        value={jump}
        error={bad ? "Use 1:23 or 1:02:03" : undefined}
        className="tr-find__jump"
        onChange={(e) => (setJump(e.target.value), setBad(false))}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
    </div>
  );
}

interface HeadProps {
  detail: Detail;
  facts: string;
  audio: string;
  onResult(r: ExportResult): void;
  onChanged(): void;
  onDeleted(): void;
}

/** Title with Rename, the Copy, Export and delete buttons, and the facts line with Delete audio. */
export function Head({ detail: d, facts, audio, onResult, onChanged, onDeleted }: HeadProps) {
  return (
    <>
      <div className="tr-head">
        <Title detail={d} onSaved={onChanged} />
        <div className="tr-head__acts">
          <Button iconLeft="copy" onClick={() => void transcripts.copyText(d.id).then((ok) => onResult(ok ? { kind: "copied" } : { kind: "error", message: "That transcript is gone." }))}>
            Copy
          </Button>
          <ExportMenu id={d.id} onResult={onResult} trigger={<Button iconLeft="download">Export</Button>} />
          <IconButton name="trash" label="Delete" size={36} variant="secondary" onClick={onDeleted} />
        </div>
      </div>
      <p className="tr-facts">
        {facts}
        {audio ? `. ${audio[0]!.toUpperCase()}${audio.slice(1)}` : ""}.{" "}
        {d.audioBytes > 0 ? (
          <button type="button" className="tr-link" onClick={() => void transcripts.deleteAudio(d.id).then(onChanged)}>
            Delete audio
          </button>
        ) : null}
      </p>
    </>
  );
}
