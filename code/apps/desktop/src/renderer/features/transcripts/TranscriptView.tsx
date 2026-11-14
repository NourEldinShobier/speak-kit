import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { findMatches, type Detail } from "@speakkit/transcripts/pure";
import { Banner, EmptyState, Icon, Skeleton } from "@speakkit/ui";
import type { Push, SettingsView } from "../../../shared/transcripts/contract";
import { transcripts } from "./api";
import { ExportNotice, type ExportResult } from "./ExportMenu";
import { audioText, dateText, lengthText, segmentAt } from "./model";
import { ChapterList, SummaryCard } from "./TranscriptNotes";
import { Find, Head, Lines, PAGE } from "./TranscriptParts";
import { audioDaysLeft } from "./TranscriptRow";

interface Props {
  id: string;
  push: Push;
  settings: SettingsView | null;
  onBack(): void;
  onDeleted(r: { id: string; title: string }): void;
}

type Loaded = { state: "loading" } | { state: "error" } | { state: "gone" } | { state: "ready"; detail: Detail };

/** The transcript, fetched again whenever main says something changed (progress, a rename, audio deleted). */
function useDetail(id: string, tick: number): { loaded: Loaded; reload(): void } {
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    transcripts.get(id).then(
      (d) => live && setLoaded(d ? { state: "ready", detail: d } : { state: "gone" }),
      () => live && setLoaded({ state: "error" }),
    );
    return () => {
      live = false;
    };
  }, [id, tick, n]);
  return { loaded, reload: () => setN((x) => x + 1) };
}

function factsOf(d: Detail, now: number): string {
  const when = dateText(d.createdAt, now).replace("Today, ", "today at ").replace("Yesterday, ", "yesterday at ");
  return [d.source === "file" ? `Imported ${d.sourceName ?? "audio file"}` : "Recorded conversation", when, lengthText(d.durationSec)].join(", ");
}

const unfinishedTitle = (d: Detail): string => {
  if (d.status === "failed") return "Transcription stopped";
  return d.status === "transcribing" || d.status === "queued" ? "Still transcribing" : "Transcription is not finished";
};

function Placeholder({ back, children }: { back: ReactNode; children: ReactNode }) {
  return (
    <div className="sk-page tr-page">
      {back}
      {children}
    </div>
  );
}

/** The search inside a transcript: which match is current, and bringing a line into view (showing more lines first when it lies beyond them). */
function useFinder(d: Detail, query: string) {
  const [current, setCurrent] = useState(0);
  const [limit, setLimit] = useState(PAGE);
  const root = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => findMatches(d.segments, query), [d.segments, query]);
  useEffect(() => setCurrent(0), [query]);
  const go = (seg: number) => {
    if (seg >= limit) setLimit(Math.ceil((seg + 1) / PAGE) * PAGE);
    requestAnimationFrame(() => root.current?.querySelector(`[data-seg="${seg}"]`)?.scrollIntoView({ block: "center" }));
  };
  const step = (by: number) => {
    const next = (current + by + matches.length) % matches.length;
    setCurrent(next);
    go(matches[next]!.segment);
  };
  const jump = (sec: number) =>
    go(
      segmentAt(
        d.segments.map((s) => s.start),
        sec,
      ),
    );
  return { root, matches, current, limit, setLimit, step, jump };
}

function Words({ detail: d, unfinished, children }: { detail: Detail; unfinished: boolean; children: ReactNode }) {
  if (d.segments.length > 0) return <>{children}</>;
  return (
    <div className="lm-card">
      <EmptyState icon="microphone" title={unfinished ? "Nothing transcribed yet" : "No speech was found"}>
        {unfinished ? "The words appear here as they are ready." : "The audio had no speech in it, or it was too quiet to hear."}
      </EmptyState>
    </div>
  );
}

function Ready({ detail: d, props, reload }: { detail: Detail; props: Props; reload(): void }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ExportResult | null>(null);
  const f = useFinder(d, query);
  const unfinished = d.status !== "done";
  return (
    <div className="sk-page tr-page" ref={f.root}>
      <Back onBack={props.onBack} />
      <Head
        detail={d}
        facts={`${factsOf(d, Date.now())}, ${props.settings?.model.name ?? ""}`}
        audio={audioText(d, audioDaysLeft(d, props.settings?.config.audioDays ?? 7))}
        onResult={setResult}
        onChanged={reload}
        onDeleted={() => void transcripts.trash(d.id).then(() => props.onDeleted({ id: d.id, title: d.title }))}
      />
      <ExportNotice result={result} onClose={() => setResult(null)} />
      {unfinished ? (
        <Banner tone={d.status === "failed" ? "error" : "info"} title={unfinishedTitle(d)}>
          {d.status === "failed" ? (d.failure?.message ?? "It failed.") : "What is below is what has been transcribed so far."}
        </Banner>
      ) : null}
      <SummaryCard detail={d} reload={reload} />
      <ChapterList detail={d} onCopied={() => setResult({ kind: "copied" })} />
      <Find query={query} setQuery={setQuery} current={f.current} total={f.matches.length} onStep={f.step} onJump={f.jump} />
      <Words detail={d} unfinished={unfinished}>
        <Lines detail={d} query={query} matches={f.matches} current={f.current} limit={f.limit} setLimit={f.setLimit} />
      </Words>
      <p className="tr-foot">Transcribed on this computer. Deleting moves the transcript to Trash for {props.settings?.config.trashDays ?? 30} days.</p>
    </div>
  );
}

const Back = ({ onBack }: { onBack(): void }) => (
  <button type="button" className="tr-back" onClick={onBack}>
    <Icon name="arrow-left" size={12} /> Transcripts
  </button>
);

/** One transcript: title (renamable), Copy, Export and delete, the facts about it, search inside it with previous and next, a jump to a time, and its lines with their times. */
export function TranscriptView(props: Props) {
  const { loaded, reload } = useDetail(props.id, props.push.tick);
  const back = <Back onBack={props.onBack} />;
  if (loaded.state === "ready") return <Ready detail={loaded.detail} props={props} reload={reload} />;
  if (loaded.state === "error") {
    return (
      <Placeholder back={back}>
        <div className="lm-card">
          <EmptyState icon="alert-triangle" title="This transcript could not be loaded" primary={{ label: "Try again", onClick: reload }} />
        </div>
      </Placeholder>
    );
  }
  if (loaded.state === "gone") {
    return (
      <Placeholder back={back}>
        <div className="lm-card">
          <EmptyState icon="file-text" title="This transcript is gone" primary={{ label: "Back to the list", onClick: props.onBack }}>
            It was deleted, or removed after its retention period.
          </EmptyState>
        </div>
      </Placeholder>
    );
  }
  return (
    <Placeholder back={back}>
      <div aria-busy="true" aria-label="Loading the transcript">
        <Skeleton lines={[30, 100, 100, 70]} />
      </div>
    </Placeholder>
  );
}
