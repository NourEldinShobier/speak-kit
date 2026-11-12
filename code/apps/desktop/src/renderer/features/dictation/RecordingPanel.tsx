import { useEffect, useRef, useState } from "react";
import { Banner, Button, Icon, Select } from "@speakkit/ui";
import type { DictationModelId, DictationStatus, HistoryItem } from "../../../shared/dictation/contract";
import type { DictationConfig } from "../../../shared/dictation/settings";
import { dictation } from "./api";
import { clockText, LANGUAGE_OPTIONS, timeText } from "./model";

/** The recording's bytes from the main process as a blob URL that lives only while the row is open. */
function useRecordingUrl(id: string) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    let made: string | null = null;
    void dictation.historyAudio(id).then(
      (bytes) => {
        if (!live) return;
        if (!bytes) return setFailed(true);
        made = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "audio/wav" }));
        setUrl(made);
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id]);
  return { url, failed, setFailed };
}

/** Plays a kept recording: the bytes come from the main process and live in a blob URL only while the row is open. */
function Player({ id, durationMs, kept }: { id: string; durationMs: number; kept: string }) {
  const { url, failed, setFailed } = useRecordingUrl(id);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => setFailed(true));
    else a.pause();
  };
  return (
    <div className="dict-rec__player">
      <button type="button" className="lm-btn lm-btn--icon lm-btn--secondary" aria-label={playing ? "Pause recording" : "Play recording"} disabled={!url} onClick={toggle}>
        <Icon name={playing ? "player-pause" : "player-play"} size={14} />
      </button>
      <input
        type="range"
        className="dict-rec__bar"
        aria-label="Position in the recording"
        min={0}
        max={Math.max(1, durationMs)}
        value={Math.min(at, durationMs)}
        disabled={!url}
        onChange={(e) => {
          if (audio.current) audio.current.currentTime = Number(e.target.value) / 1000;
          setAt(Number(e.target.value));
        }}
      />
      <span className="dict-rec__time">
        {clockText(at)} / {clockText(durationMs)}
      </span>
      <span className="dict-rec__kept">{kept}</span>
      {failed ? <span className="dict-rec__err">The recording could not be played.</span> : null}
      {url ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- a dictation recording has no captions; the text is the row itself
        <audio
          ref={audio}
          src={url}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => setAt(e.currentTarget.currentTime * 1000)}
        />
      ) : null}
    </div>
  );
}

const modelName = (s: DictationStatus, id: string): string => s.models.find((m) => m.id === id)?.name ?? id;

/** The versions of one entry: what dictation made and what "Transcribe again" added. The text in use is the one marked. */
function Versions({ item, s }: { item: HistoryItem; s: DictationStatus }) {
  const versions = item.versions ?? [{ id: "v1", model: item.model ?? "", at: item.at, text: item.text, ms: 0 }];
  const current = item.version ?? versions[0]?.id;
  return (
    <div className="dict-rec__versions">
      <div className="dict-rec__vhead">
        <b>Versions</b>
        <span>
          {versions.findIndex((v) => v.id === current) + 1} of {versions.length}
        </span>
      </div>
      <ul aria-label="Versions">
        {versions.map((v) => (
          <li key={v.id} className="dict-rec__version" data-version={v.id} data-current={v.id === current || undefined}>
            <span className="dict-rec__vtext">
              <b>{v.model ? modelName(s, v.model) : "Dictation"}</b>
              <span>
                {timeText(v.at)}
                {v.ms ? ` · ${(v.ms / 1000).toFixed(1)} s` : ""}
                {v.id !== current ? ` · ${v.text}` : ""}
              </span>
            </span>
            {v.id === current ? <span className="lm-badge dict-rec__inuse">In use</span> : <Button onClick={() => void dictation.historyUseVersion(item.id, v.id)}>Use this text</Button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function failureText(s: DictationStatus, error: string | undefined, model: string): string {
  if (error === "model-missing") return `${modelName(s, model)} is not installed.`;
  if (error === "no-audio") return "The recording is not there any more.";
  if (error === "busy") return "Finish the dictation in progress, then try again.";
  return `${modelName(s, model)} could not transcribe this recording.`;
}

function AgainFailure({ text, missing, openDictation }: { text: string; missing: boolean; openDictation(): void }) {
  return (
    <Banner
      tone="error"
      role="alert"
      action={
        <>
          {missing ? <Button onClick={openDictation}>Open Dictation</Button> : null}
          <Button onClick={() => void dictation.historyCancelRetranscribe()}>Dismiss</Button>
        </>
      }
    >
      {text} The first version is kept.
    </Banner>
  );
}

/** The language for one Transcribe again run: starts as the dictation language, lists what the chosen model knows, and falls back to automatic detection when it does not know the pick. */
function useRunLanguage(s: DictationStatus, model: DictationModelId) {
  const [picked, setPicked] = useState<DictationConfig["language"]>(s.settings.language);
  const known = s.models.find((m) => m.id === model)?.languages ?? [];
  const options = LANGUAGE_OPTIONS.filter((l) => l.value === "auto" || known.includes(l.value));
  return [options.some((l) => l.value === picked) ? picked : "auto", setPicked, options] as const;
}

/** Transcribe again: pick a model, see it run, cancel it or read why it failed. The text in use never changes until a version is chosen. */
function Again({ item, s, openDictation }: { item: HistoryItem; s: DictationStatus; openDictation(): void }) {
  const [model, setModel] = useState<DictationModelId>(s.settings.model);
  const [language, setLanguage, spoken] = useRunLanguage(s, model);
  const redo = s.redo?.id === item.id ? s.redo : undefined;
  const running = redo?.state === "running";
  const failure = redo?.state === "failed" ? failureText(s, redo.error, redo.model) : undefined;
  return (
    <div className="dict-rec__again">
      <div className="dict-rec__again-row">
        <Select
          label="Model for transcribing again"
          value={model}
          onChange={(m) => setModel(m as DictationModelId)}
          options={s.models.map((m) => ({ value: m.id, label: m.name }))}
          disabled={running}
        />
        <Select label="Language for transcribing again" value={language} onChange={(l) => setLanguage(l as DictationConfig["language"])} options={spoken} disabled={running} />
        {running ? (
          <>
            <span className="dict-rec__running" role="status">
              <Icon name="loader-2" size={14} className="lm-spin" /> Transcribing with {modelName(s, redo.model)}
            </span>
            <Button onClick={() => void dictation.historyCancelRetranscribe()}>Cancel</Button>
          </>
        ) : (
          <Button iconLeft="refresh" onClick={() => void dictation.historyRetranscribe(item.id, model, language)}>
            Transcribe again
          </Button>
        )}
        <span className="dict-rec__spacer" />
        <Button variant="danger" iconLeft="trash" disabled={running} onClick={() => void dictation.historyDeleteRecording(item.id)}>
          Delete recording
        </Button>
      </div>
      {failure ? <AgainFailure text={failure} missing={redo?.error === "model-missing"} openDictation={openDictation} /> : null}
    </div>
  );
}

/** The part of an entry that opens: the recording, the model, the versions and Transcribe again. */
export function RecordingPanel({ item, s, kept, openDictation }: { item: HistoryItem; s: DictationStatus; kept: string; openDictation(): void }) {
  const model = item.model ? modelName(s, item.model) : "";
  return (
    <div className="dict-rec" data-testid="recording-panel">
      <Player id={item.id} durationMs={item.durationMs} kept={kept} />
      <p className="dict-rec__meta">{[model, item.app].filter(Boolean).join(" · ")}</p>
      <Versions item={item} s={s} />
      <Again item={item} s={s} openDictation={openDictation} />
    </div>
  );
}
