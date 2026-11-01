import { useEffect, useState } from "react";
import { Banner, Button, Modal, Select, TextInput } from "@speakkit/ui";
import type { Voice } from "@speakkit/protocol";
import type { DocMeta, ImportResult } from "../../../shared/library/contract";
import { library } from "./api";
import { clock, estimateMs } from "./model";

const words = (t: string) => t.match(/\S+/g)?.length ?? 0;

const voiceOptions = (voices: Voice[]) => voices.map((v) => ({ value: v.id, label: `${v.name} · ${v.lang === "en-GB" ? "UK" : "US"}` }));

export function PasteDialog({ open, speed, voices, defaultVoice, onClose, onAdded }: { open: boolean; speed: number; voices: Voice[]; defaultVoice: string; onClose(): void; onAdded(doc: DocMeta, play: boolean): void }) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [voice, setVoice] = useState(defaultVoice);
  const [error, setError] = useState<string | null>(null);
  const n = words(text);
  const add = async (play: boolean) => {
    const r = await library.importText(text, title.trim() || undefined, voice === defaultVoice ? undefined : voice);
    if (!r.ok) return setError(r.message);
    setText("");
    setTitle("");
    setError(null);
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
          <Button disabled={!n} onClick={() => void add(false)}>Add</Button>
          <Button variant="primary" iconLeft="player-play" disabled={!n} onClick={() => void add(true)}>Add and play</Button>
        </>
      }
    >
      <div className="lib-form">
        <TextInput label="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Taken from the first line when empty" />
        <label className="lm-field__label" htmlFor="lib-paste">Text</label>
        <textarea id="lib-paste" className="lib-textarea" rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste or type the text to read" autoFocus />
        <div className="lib-form__row">
          <span className="lib-muted" data-testid="paste-count">{n} words · about {n ? clock(estimateMs(n, speed)) : "0:00"} at {speed}x</span>
          {voices.length > 0 && <Select label="Voice" size="sm" options={voiceOptions(voices)} value={voice} onChange={setVoice} />}
        </div>
        {error && <Banner tone="error">{error}</Banner>}
      </div>
    </Modal>
  );
}

type Fetching = { state: "idle" } | { state: "fetching" } | { state: "failed"; message: string };

export function UrlDialog({ open, onClose, onAdded, onPasteInstead }: { open: boolean; onClose(): void; onAdded(doc: DocMeta): void; onPasteInstead(): void }) {
  const [url, setUrl] = useState("");
  const [s, setS] = useState<Fetching>({ state: "idle" });
  const [details, setDetails] = useState(false);
  const go = async () => {
    setS({ state: "fetching" });
    const r: ImportResult = await library.importUrl(url);
    if (r.ok) {
      setUrl("");
      setS({ state: "idle" });
      onAdded(r.doc);
    } else setS({ state: "failed", message: r.message });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add from a web address"
      width={520}
      footer={
        s.state === "failed" ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={onPasteInstead}>Paste text instead</Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={s.state === "fetching"} disabled={!url.trim() || s.state === "fetching"} onClick={() => void go()}>
              {s.state === "fetching" ? "Fetching" : "Add"}
            </Button>
          </>
        )
      }
    >
      <div className="lib-form">
        <TextInput
          label="Web address"
          value={url}
          readOnly={s.state === "fetching"}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && url.trim() && s.state !== "fetching" && void go()}
          placeholder="https://example.com/article"
          icon="link"
          autoFocus
        />
        {s.state === "failed" && (
          <Banner tone="warning" title="That page could not be added" action={<Button size="sm" variant="ghost" onClick={() => setDetails(!details)}>{details ? "Hide details" : "Details"}</Button>}>
            Some sites block automatic reading. Copy the article text and paste it instead.
            {details && <div className="lib-muted" data-testid="url-details">{s.message}</div>}
          </Banner>
        )}
      </div>
    </Modal>
  );
}

export function RenameDialog({ doc, onClose, onDone }: { doc: DocMeta | null; onClose(): void; onDone(): void }) {
  const [title, setTitle] = useState(doc?.title ?? "");
  return (
    <Modal
      open={!!doc}
      onClose={onClose}
      title="Rename reading"
      width={440}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!title.trim()} onClick={() => doc && void library.rename(doc.id, title).then(onDone)}>Save</Button>
        </>
      }
    >
      <TextInput label="Title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus onFocus={(e) => e.currentTarget.select()} />
    </Modal>
  );
}

export function VoiceDialog({ doc, voices, defaultVoice, onClose, onDone }: { doc: DocMeta | null; voices: Voice[]; defaultVoice: string; onClose(): void; onDone(): void }) {
  const [voice, setVoice] = useState(doc?.voice ?? defaultVoice);
  const save = (v: string | null) => doc && void library.setVoice(doc.id, v).then(onDone);
  return (
    <Modal
      open={!!doc}
      onClose={onClose}
      title="Voice for this reading"
      width={440}
      footer={
        <>
          <Button onClick={() => save(null)}>Use the app voice</Button>
          <Button variant="primary" onClick={() => save(voice)}>Save</Button>
        </>
      }
    >
      <Select label="Voice" options={voiceOptions(voices)} value={voice} onChange={setVoice} />
    </Modal>
  );
}

export function DeleteDialog({ doc, onClose, onConfirm }: { doc: DocMeta | null; onClose(): void; onConfirm(): void }) {
  // The dialog focuses its first control (the close button) on open; Cancel is the safe default (E10).
  useEffect(() => {
    if (!doc) return;
    const t = setTimeout(() => document.querySelector<HTMLElement>("[data-default-focus]")?.focus(), 50);
    return () => clearTimeout(t);
  }, [doc]);
  const copy = doc?.source === "paste" ? "Pasted text has no original file, so this is the only copy. You can undo for a few seconds." : "The original file or page is not touched. Only the reading and its progress are removed from SpeakKit.";
  return (
    <Modal
      open={!!doc}
      onClose={onClose}
      title={`Delete "${doc?.title ?? ""}"?`}
      width={440}
      footer={
        <>
          <Button onClick={onClose} data-default-focus>Cancel</Button>
          <Button variant="danger" solid onClick={onConfirm}>Delete</Button>
        </>
      }
    >
      <p className="lib-muted">{copy}</p>
    </Modal>
  );
}
