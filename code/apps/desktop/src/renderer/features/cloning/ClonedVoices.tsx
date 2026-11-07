import { useEffect, useReducer, useState } from "react";
import { Avatar, Banner, Button, IconButton, Modal } from "@speakkit/ui";
import { clock, type ClonedVoice, type UpdateVoiceRequest } from "@speakkit/protocol";
import { usePlayer } from "../../pages";
import { api, cleanError } from "../../ui";
import { NEUTRAL } from "./model";
import { StyleSlider } from "./StyleSlider";
import "./cloning.css";

/** What a cloned voice says when previewed. */
const previewText = (v: ClonedVoice) => `Hello, I am ${v.name}. This is how I sound when reading to you.`;

function StyleDialog({ voice, onClose, onDone }: { voice: ClonedVoice | null; onClose(): void; onDone(id: string, patch: UpdateVoiceRequest): void }) {
  const [exaggeration, setExaggeration] = useState(NEUTRAL);
  const [pace, setPace] = useState(NEUTRAL);
  useEffect(() => {
    setExaggeration(voice?.exaggeration ?? NEUTRAL);
    setPace(voice?.pace ?? NEUTRAL);
  }, [voice]);
  return (
    <Modal
      open={!!voice}
      onClose={onClose}
      title={`Voice style: ${voice?.name ?? ""}`}
      width={440}
      footer={
        <>
          <Button
            onClick={() => {
              setExaggeration(NEUTRAL);
              setPace(NEUTRAL);
            }}
          >
            Reset
          </Button>
          <Button variant="primary" onClick={() => voice && onDone(voice.id, { exaggeration, pace })}>
            Done
          </Button>
        </>
      }
    >
      <div className="sk-clone-style">
        <StyleSlider label="Exaggeration" hint={`${NEUTRAL.toFixed(2)} is neutral.`} low="Calm" high="Dramatic" value={exaggeration} onChange={setExaggeration} />
        <StyleSlider label="Pace" hint="How fast the voice speaks." low="Slow" high="Fast" value={pace} onChange={setPace} />
      </div>
    </Modal>
  );
}

function DeleteDialog({ voice, onCancel, onConfirm }: { voice: ClonedVoice | null; onCancel(): void; onConfirm(v: ClonedVoice): void }) {
  return (
    <Modal
      open={!!voice}
      onClose={onCancel}
      title={`Delete ${voice?.name ?? "this voice"}?`}
      width={440}
      footer={
        <>
          <Button data-autofocus onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => onConfirm(voice!)}>
            Delete
          </Button>
        </>
      }
    >
      <p className="sk-modal-text" style={{ margin: 0 }}>
        The voice and its reference clip are deleted from this computer. This cannot be undone.
      </p>
    </Modal>
  );
}

interface State {
  voices: ClonedVoice[];
  error: string;
  styling: ClonedVoice | null;
  deleting: ClonedVoice | null;
}
type Action = { type: "loaded"; voices: ClonedVoice[] } | { type: "failed"; message: string } | { type: "style"; voice: ClonedVoice | null } | { type: "delete"; voice: ClonedVoice | null };

function reduce(s: State, a: Action): State {
  switch (a.type) {
    case "loaded":
      return { ...s, voices: a.voices, error: "" };
    case "failed":
      return { ...s, error: a.message };
    case "style":
      return { ...s, styling: a.voice };
    case "delete":
      return { ...s, deleting: a.voice };
    default: {
      const unreachable: never = a;
      return unreachable;
    }
  }
}

interface CardProps {
  voice: ClonedVoice;
  playing: boolean;
  onPreview(): void;
  onStyle(): void;
  onDelete(): void;
}

function ClonedCard({ voice: v, playing, onPreview, onStyle, onDelete }: CardProps) {
  return (
    <div className="sk-voice" data-voice={v.id} data-cloned>
      <div className="sk-voice__h">
        <Avatar name={v.name} tone="purple" />
        <div style={{ flex: 1 }}>
          <b>{v.name}</b>
          <small>Cloned · {clock(v.durationMs)}</small>
        </div>
      </div>
      <div className="sk-voice__f">
        <Button size="sm" variant={playing ? "primary" : "secondary"} iconLeft={playing ? "player-stop" : "player-play"} aria-label={`${playing ? "Stop" : "Preview"} ${v.name}`} onClick={onPreview}>
          {playing ? "Stop" : "Preview"}
        </Button>
        <span className="sk-voice__tools">
          <IconButton name="adjustments" label={`Voice style: ${v.name}`} onClick={onStyle} />
          <IconButton name="trash" label={`Delete ${v.name}`} onClick={onDelete} />
        </span>
      </div>
    </div>
  );
}

function Grid({ voices, playing, dispatch, preview }: { voices: ClonedVoice[]; playing: string | null; dispatch: (a: Action) => void; preview: (v: ClonedVoice) => Promise<void> }) {
  const failed = (e: unknown) => dispatch({ type: "failed", message: cleanError(e) });
  return (
    <div className="sk-voices" data-testid="cloned-voices">
      {voices.map((v) => (
        <ClonedCard
          key={v.id}
          voice={v}
          playing={playing === v.id}
          onPreview={() => void preview(v).catch(failed)}
          onStyle={() => dispatch({ type: "style", voice: v })}
          onDelete={() => dispatch({ type: "delete", voice: v })}
        />
      ))}
    </div>
  );
}

/** "Your voices": the voices the person cloned, with preview, style and delete. A preview makes Chatterbox the engine in use, because only it speaks them. */
export function ClonedVoices({ reload }: { reload: number }) {
  const [st, dispatch] = useReducer(reduce, { voices: [], error: "", styling: null, deleting: null });
  const { playing, error, toggle } = usePlayer();
  const load = () =>
    api
      .clonedVoices()
      .then((voices) => dispatch({ type: "loaded", voices }))
      .catch((e) => dispatch({ type: "failed", message: cleanError(e) }));
  useEffect(() => void load(), [reload]);
  const preview = async (v: ClonedVoice) => {
    if ((await api.engines()).active !== "chatterbox") await api.selectEngine("chatterbox");
    await toggle(v.id, previewText(v));
  };
  const run = async (p: Promise<unknown>) => {
    try {
      await p;
      await load();
    } catch (e) {
      dispatch({ type: "failed", message: cleanError(e) });
    }
  };
  const failure = error || st.error;
  if (st.voices.length === 0 && !failure) return null;
  return (
    <section className="sk-clone-voices" aria-label="Your voices">
      <h2 className="sk-clone-voices__title">Your voices</h2>
      {failure && <Banner tone="error">{failure}</Banner>}
      <Grid voices={st.voices} playing={playing} dispatch={dispatch} preview={preview} />
      <StyleDialog
        voice={st.styling}
        onClose={() => dispatch({ type: "style", voice: null })}
        onDone={(id, patch) => {
          dispatch({ type: "style", voice: null });
          void run(api.updateClonedVoice(id, patch));
        }}
      />
      <DeleteDialog
        voice={st.deleting}
        onCancel={() => dispatch({ type: "delete", voice: null })}
        onConfirm={(v) => {
          dispatch({ type: "delete", voice: null });
          void run(api.deleteClonedVoice(v.id));
        }}
      />
    </section>
  );
}
