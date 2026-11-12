import { useState } from "react";
import type { Detail } from "@speakkit/transcripts/pure";
import { Banner, Button } from "@speakkit/ui";
import { transcripts } from "./api";

const stamp = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(s % 60).padStart(2, "0")}`;
};

/** The summary with the writer named, or why there is none and a way to write it again. The words below never depend on it. */
export function SummaryCard({ detail: d, reload }: { detail: Detail; reload(): void }) {
  const [busy, setBusy] = useState(false);
  const n = d.notes;
  if (!n || d.status !== "done") return null;
  const regenerate = () => {
    setBusy(true);
    void transcripts.writeNotes(d.id).then(() => (setBusy(false), reload()));
  };
  if (n.state === "writing") return <Banner tone="info">Writing the notes. The transcript is ready below.</Banner>;
  return (
    <>
      {n.state === "failed" ? (
        <Banner
          tone="warning"
          title="Notes could not be written"
          action={
            <Button size="sm" variant="primary" disabled={busy} onClick={regenerate}>
              Write notes again
            </Button>
          }
        >
          {n.failure.message}
        </Banner>
      ) : null}
      {n.doc ? (
        <section className="lm-card mt-notes" aria-label="Summary">
          <p className="mt-summary">{n.doc.summary}</p>
          <div className="tr-notes__foot">
            <p className="mt-writer">Written by {n.doc.writer}. The transcript below is exactly what was heard.</p>
            {n.state === "ready" ? (
              <Button size="sm" disabled={busy} onClick={regenerate}>
                Write notes again
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}

/** The chapters in time order, each with Copy section: the words said inside that chapter only. */
export function ChapterList({ detail: d, onCopied }: { detail: Detail; onCopied(): void }) {
  const chapters = d.notes?.doc?.chapters ?? [];
  if (!chapters.length) return null;
  return (
    <section aria-label="Chapters" className="mt-chapters">
      <h2 className="cap-day">{chapters.length === 1 ? "1 chapter" : `${chapters.length} chapters`}</h2>
      <div className="lm-card tr-list" role="list">
        {chapters.map((c, i) => (
          <div key={`${c.start}-${i}`} role="listitem" className="mt-chapter">
            <span className="mt-chapter__time">{stamp(c.start)}</span>
            <span className="mt-chapter__title">{c.title}</span>
            <Button
              size="sm"
              aria-label={`Copy section: ${c.title}`}
              onClick={() => void transcripts.copyText(d.id, { from: c.start, to: chapters[i + 1]?.start ?? Number.MAX_SAFE_INTEGER }).then((ok) => ok && onCopied())}
            >
              Copy section
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
