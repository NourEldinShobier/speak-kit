import { useReducer } from "react";
import { Banner, Button, Modal, Select, TextInput } from "@speakkit/ui";
import type { Voice } from "@speakkit/protocol";
import type { DocMeta } from "../../../shared/library/contract";
import { library } from "./api";
import { countWords, initPaste, pasteReducer } from "./add-model";
import { clock, estimateMs } from "./model";

export const voiceOptions = (voices: Voice[]) => voices.map((v) => ({ value: v.id, label: `${v.name} · ${v.lang === "en-GB" ? "UK" : "US"}` }));

interface PasteProps {
  open: boolean;
  speed: number;
  voices: Voice[];
  defaultVoice: string;
  onClose(): void;
  onAdded(doc: DocMeta, play: boolean): void;
}

function PasteForm({ speed, voices, st, dispatch }: Pick<PasteProps, "speed" | "voices"> & { st: ReturnType<typeof initPaste>; dispatch: (a: Parameters<typeof pasteReducer>[1]) => void }) {
  const n = countWords(st.text);
  return (
    <div className="lib-form">
      <TextInput label="Title (optional)" value={st.title} onChange={(e) => dispatch({ type: "title", title: e.target.value })} placeholder="Taken from the first line when empty" />
      <label className="lm-field__label" htmlFor="lib-paste">
        Text
      </label>
      <textarea
        id="lib-paste"
        className="lib-textarea"
        rows={9}
        value={st.text}
        onChange={(e) => dispatch({ type: "text", text: e.target.value })}
        placeholder="Paste or type the text to read"
        autoFocus
      />
      <div className="lib-form__row">
        <span className="lib-muted" data-testid="paste-count">
          {n} words · about {n ? clock(estimateMs(n, speed)) : "0:00"} at {speed}x
        </span>
        {voices.length > 0 && <Select label="Voice" size="sm" options={voiceOptions(voices)} value={st.voice} onChange={(v) => dispatch({ type: "voice", voice: v })} />}
      </div>
      {st.error && <Banner tone="error">{st.error}</Banner>}
    </div>
  );
}

export function PasteDialog({ open, speed, voices, defaultVoice, onClose, onAdded }: PasteProps) {
  const [st, dispatch] = useReducer(pasteReducer, defaultVoice, initPaste);
  const empty = !countWords(st.text);
  const add = async (play: boolean) => {
    const r = await library.importText(st.text, st.title.trim() || undefined, st.voice === defaultVoice ? undefined : st.voice);
    if (!r.ok) return dispatch({ type: "failed", message: r.message });
    dispatch({ type: "added" });
    onAdded(r.doc, play);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add pasted text"
      width={560}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button disabled={empty} onClick={() => void add(false)}>
            Add
          </Button>
          <Button variant="primary" iconLeft="player-play" disabled={empty} onClick={() => void add(true)}>
            Add and play
          </Button>
        </>
      }
    >
      <PasteForm speed={speed} voices={voices} st={st} dispatch={dispatch} />
    </Modal>
  );
}
