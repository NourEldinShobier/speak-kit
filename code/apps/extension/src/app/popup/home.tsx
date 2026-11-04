import { plural } from "@speakkit/protocol";
import { Button, Kbd, ProgressBar } from "@speakkit/ui";
import { Scrubber, Transport } from "../../features/player";
import { splitShortcut } from "../../features/settings";
import { clock, estimateMs, hostOf, minutes, speedLabel } from "../../shared/format";
import { NowCard } from "./parts";
import { SpeedPanel, VoicePanel, VoiceSpeedRow } from "./pickers";
import type { Pickers } from "./usePickers";
import type { PopupActions, PopupModel } from "./types";

export const HOME_VIEWS = ["idle", "selection", "preparing", "loading-model", "playing", "paused", "finished"] as const;

const Keys = ({ keys }: { keys: string[] }) => (
  <span className="lm-kbds">
    {keys.map((k, i) => (
      <Kbd key={i} small>
        {k}
      </Kbd>
    ))}
  </span>
);

const Shortcuts = ({ map }: { map: Record<string, string | undefined> }) => (
  <section className="pp-keys" aria-label="Shortcuts">
    <div>
      <span>Read selection</span>
      <Keys keys={splitShortcut(map["read-selection"])} />
    </div>
    <div>
      <span>Play / pause</span>
      <Keys keys={splitShortcut(map["play-pause"])} />
    </div>
  </section>
);

const sentenceCount = (text: string) => (text ? Math.max(1, text.split(/[.!?]+(?:\s|$)/).filter(Boolean).length) : 0);

/** The line under the page title: host plus what is selected, how long the reading takes, or that it finished. */
function homeSub(m: PopupModel): string {
  const { view, host } = m;
  if (view === "selection") return `${host} · ${plural(sentenceCount(m.selection), "sentence", "sentences")}, about ${Math.max(1, Math.round(estimateMs(m.selection.length, m.speed) / 1000))} s`;
  if (view === "finished") return `${host} · finished`;
  if (view === "playing" || view === "paused") return `${host} · ${clock(m.player?.totalMs ?? 0)} at ${speedLabel(m.speed)}`;
  if (m.chars) return `${host} · ${clock(estimateMs(m.chars, m.speed))} at ${speedLabel(m.speed)}`;
  return `${host} · ${speedLabel(m.speed)}`;
}

/** The progress bar and sentence under it while the model starts or the first sentence is prepared. */
function busyInfo(m: PopupModel): { label: string; value?: number; text: string } {
  if (m.view !== "loading-model") return { label: "Preparing audio", text: "Preparing the first sentence. This takes a few seconds." };
  if (m.engineProgress !== undefined) return { label: "Downloading voice model", value: m.engineProgress * 100, text: `Downloading the voice model, ${Math.round(m.engineProgress * 100)}%.` };
  if (m.engine === "unloaded") return { label: "Waking the voice engine", text: "Waking the voice engine. This takes a few seconds." };
  return { label: "Preparing audio", text: "Starting the voice engine. The first time takes a few seconds." };
}

function IdleActions({ m, a }: { m: PopupModel; a: PopupActions }) {
  return (
    <section className="pp-actions">
      <Button variant="primary" size="lg" className="sk-fill" iconLeft="player-play" onClick={a.listenPage}>
        Listen to this page
      </Button>
      <div className="pp-two">
        <Button className="sk-fill" iconLeft="scan" disabled={!m.selection} onClick={a.listenSelection}>
          From selection
        </Button>
        <Button className="sk-fill" iconLeft="book" onClick={a.readerView}>
          Reader view
        </Button>
      </div>
      {m.hidden && <Button onClick={a.showOnPage}>Show on this page</Button>}
      <p className="pp-hint">{m.engine === "unloaded" ? "The voice wakes when you press play. Select text to read just that part." : "Select text on the page to read just that part."}</p>
    </section>
  );
}

function SelectionActions({ m, a }: { m: PopupModel; a: PopupActions }) {
  return (
    <section className="pp-actions">
      <blockquote className="pp-quote">“{m.selection.length > 160 ? `${m.selection.slice(0, 157).trimEnd()}…` : m.selection}”</blockquote>
      <Button variant="primary" size="lg" className="sk-fill" iconLeft="player-play" onClick={a.listenSelection}>
        Listen to selection
      </Button>
    </section>
  );
}

function Busy({ m }: { m: PopupModel }) {
  const { label, value, text } = busyInfo(m);
  return (
    <div className="pp-prog">
      <ProgressBar label={label} value={value} />
      <p>{text}</p>
    </div>
  );
}

function Controls({ m, a }: { m: PopupModel; a: PopupActions }) {
  const { view, player } = m;
  const live = view === "playing" || view === "paused" || view === "finished";
  return (
    <section className="pp-controls">
      {live && player ? <Scrubber p={player} finished={view === "finished"} a={a} /> : <Busy m={m} />}
      <Transport status={live ? view : "busy"} a={a} />
      {!live && (
        <Button variant="ghost" size="sm" iconLeft="x" onClick={a.stop}>
          Cancel
        </Button>
      )}
      {view === "finished" && <span className="pp-hint">Replay from the start</span>}
    </section>
  );
}

function UpNext({ m, a }: { m: PopupModel; a: PopupActions }) {
  const next = m.next;
  if (m.view !== "finished" || !next) return null;
  return (
    <section className="pp-next">
      <div>
        <span>Up next · 1 of {m.queued} queued</span>
        <b dir="auto">{next.title}</b>
        <span>
          {hostOf(next.url)} · {minutes(next.estMs)}
        </span>
      </div>
      <Button variant="primary" size="sm" onClick={a.playNext}>
        Play next
      </Button>
    </section>
  );
}

const CONTROL_VIEWS = ["preparing", "loading-model", "playing", "paused", "finished"];

/** Body of every view that shows the player: page card, actions or controls, then the voice and speed row. */
export function HomeBody({ m, a, pickers }: { m: PopupModel; a: PopupActions; pickers: Pickers }) {
  const { view } = m;
  const card = <NowCard title={view === "selection" ? "Selected text" : m.title} sub={homeSub(m)} />;
  if (pickers.voiceOpen)
    return (
      <>
        {card}
        <VoicePanel m={m} a={a} onDone={pickers.closeVoice} />
      </>
    );
  return (
    <>
      {card}
      {view === "idle" && <IdleActions m={m} a={a} />}
      {view === "selection" && <SelectionActions m={m} a={a} />}
      {CONTROL_VIEWS.includes(view) && <Controls m={m} a={a} />}
      <UpNext m={m} a={a} />
      <hr />
      <VoiceSpeedRow m={m} speedOpen={pickers.speedOpen} onVoice={pickers.openVoice} onSpeed={pickers.toggleSpeed} />
      {pickers.speedOpen ? <SpeedPanel m={m} a={a} /> : <Shortcuts map={m.shortcuts} />}
    </>
  );
}
