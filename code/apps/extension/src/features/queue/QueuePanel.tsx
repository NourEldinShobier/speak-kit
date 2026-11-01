import { plural, type PlayerState } from "@speakkit/protocol";
import { Button, EmptyState, Icon, IconButton, Logo, Slider, Toggle } from "@speakkit/ui";
import { clock, hostOf, minutes, speedLabel, timeLeft } from "../../shared/format";
import type { QueueSnapshot } from "../../shared/client";
import { currentParagraph, totalMinutes } from "./hooks";

export interface PanelActions {
  toggle(): void;
  seekMs(d: number): void;
  seekTo(ms: number): void;
  block(d: 1 | -1): void;
  cycleSpeed(): void;
  seekSentence(i: number): void;
  playItem(docId: string): void;
  removeItem(docId: string): void;
  clear(): void;
  setAutoPlay(on: boolean): void;
  addPage(): void;
  close(): void;
}

type Outline = NonNullable<QueueSnapshot["outline"]>;

function NowPlaying({ state, outline, para, a }: { state: PlayerState; outline: Outline; para: number; a: PanelActions }) {
  const total = Math.max(state.totalMs, 1);
  return (
    <section className="sp-now" aria-label="Now playing">
      <div className="sp-now-t" dir="auto">
        {state.title || hostOf(state.url)}
      </div>
      <div className="sp-now-s">
        {hostOf(state.url)}
        {outline.length ? ` · paragraph ${para + 1} of ${outline.length}` : ""}
      </div>
      <Slider aria-label="Seek" value={Math.min(state.elapsedMs, total)} min={0} max={total} step={100} onCommit={a.seekTo} />
      <div className="sp-times">
        <span>{clock(state.elapsedMs)}</span>
        <span>{timeLeft(state.elapsedMs, state.totalMs)}</span>
      </div>
      <div className="sp-ctl">
        <IconButton name="player-skip-back" label="Previous paragraph" size={28} onClick={() => a.block(-1)} />
        <IconButton name="rewind-backward-10" label="Back 10 seconds" size={28} onClick={() => a.seekMs(-10000)} />
        <Button variant="primary" className="sk-primary-round" aria-label={state.status === "playing" ? "Pause" : "Play"} onClick={a.toggle}>
          <Icon name={state.status === "playing" ? "player-pause" : "player-play"} size={16} />
        </Button>
        <IconButton name="rewind-forward-10" label="Forward 10 seconds" size={28} onClick={() => a.seekMs(10000)} />
        <IconButton name="player-skip-forward" label="Next paragraph" size={28} onClick={() => a.block(1)} />
        <Button size="sm" aria-label={`Speed ${speedLabel(state.speed)}, click to change`} onClick={a.cycleSpeed}>
          {speedLabel(state.speed)}
        </Button>
      </div>
    </section>
  );
}

function ParagraphList({ outline, para, playing, onSeek }: { outline: Outline; para: number; playing: boolean; onSeek: (index: number) => void }) {
  return (
    <>
      <h2 className="sp-lbl">This page · {plural(outline.length, "paragraph", "paragraphs")}</h2>
      <ol className="sp-outline">
        {outline.map((o, i) => (
          <li key={o.index} className={i === para ? "cur" : ""}>
            <button type="button" aria-current={i === para ? "true" : undefined} onClick={() => onSeek(o.index)}>
              <span className="n">{i + 1}</span>
              <span className="tx">{o.text}</span>
              {i === para && playing && <Icon name="volume" size={14} />}
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

function UpNext({ queue, a }: { queue: QueueSnapshot; a: PanelActions }) {
  return (
    <>
      <div className="sp-lblrow">
        <h2 className="sp-lbl">
          Up next · {queue.items.length} · {totalMinutes(queue)}
        </h2>
        <button type="button" className="sk-link" onClick={a.clear}>
          Clear all
        </button>
      </div>
      <ul className="sp-queue" aria-label="Up next">
        {queue.items.map((it) => (
          <li key={it.docId}>
            <IconButton name="player-play" label={`Play ${it.title} now`} onClick={() => a.playItem(it.docId)} />
            <div className="tx">
              <b dir="auto">{it.title}</b>
              <span>
                {hostOf(it.url)} · {minutes(it.estMs)}
              </span>
            </div>
            <IconButton name="x" label={`Remove ${it.title}`} size={28} onClick={() => a.removeItem(it.docId)} />
          </li>
        ))}
      </ul>
    </>
  );
}

function Current({ state, outline, a }: { state: PlayerState; outline: Outline; a: PanelActions }) {
  const para = currentParagraph(outline, state.sentenceIndex);
  return (
    <>
      <h2 className="sp-lbl">Now playing</h2>
      <NowPlaying state={state} outline={outline} para={para} a={a} />
      {outline.length > 0 && <ParagraphList outline={outline} para={para} playing={state.status === "playing"} onSeek={a.seekSentence} />}
    </>
  );
}

const isActive = (state: PlayerState | null): state is PlayerState => !!state && state.status !== "idle" && !!state.docId;

const AutoPlay = ({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) => (
  <footer className="sp-foot">
    <span>Play next item automatically</span>
    <Toggle checked={on} aria-label="Play next item automatically" onChange={onChange} />
  </footer>
);

/** Side panel: now playing with the paragraph outline, then the queue (design C9 to C11, Lumen components). */
export function QueuePanel({ state, queue, a }: { state: PlayerState | null; queue: QueueSnapshot | null; a: PanelActions }) {
  const now = isActive(state) ? state : null;
  const empty = !now && !queue?.items.length;
  return (
    <div className="lm sp" data-empty={empty}>
      <header className="sp-head">
        <div className="sp-brand">
          <Logo size={24} />
          <span>Speak Kit queue</span>
        </div>
        <IconButton name="x" label="Close panel" onClick={a.close} />
      </header>
      {empty ? (
        <section className="sp-empty">
          <EmptyState icon="list" title="Nothing queued" primary={{ label: "Add this page", onClick: a.addPage }}>
            Line up several articles. Add this page now, or right-click a page or selection and choose Speak Kit, then Add to queue.
          </EmptyState>
        </section>
      ) : (
        <div className="sp-body">
          {now && <Current state={now} outline={queue?.outline ?? []} a={a} />}
          {queue && queue.items.length > 0 && <UpNext queue={queue} a={a} />}
        </div>
      )}
      {!empty && <AutoPlay on={queue?.autoPlay ?? true} onChange={a.setAutoPlay} />}
    </div>
  );
}
