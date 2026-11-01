import { useEffect, useState } from "react";
import { Button, Modal, Select } from "@speakkit/ui";
import type { Voice } from "@speakkit/protocol";
import type { AppState } from "../shared/ipc";
import { usePlayer } from "./pages";
import { api } from "./ui";

/** "New reading": paste or type text, pick a voice, read it or export it. */
export function NewReading({ s, initial, onClose, onRead, onExport }: { s: AppState; initial: string; onClose(): void; onRead(text: string): void; onExport(text: string): void }) {
  const [text, setText] = useState(initial);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voice, setVoice] = useState(s.config.voice);
  const { playing, error, toggle } = usePlayer();
  useEffect(() => {
    api.voices().then(
      (v) => setVoices(v.voices),
      () => {},
    );
  }, []);
  const on = playing === "reading";
  const read = () => {
    onRead(text);
    void toggle(voice, text.trim().slice(0, 5000), "reading");
  };
  const options = voices.length ? voices.map((v) => ({ value: v.id, label: v.name })) : [{ value: voice, label: voice }];
  return (
    <Modal
      open
      onClose={onClose}
      title="New reading"
      width={560}
      footer={
        <>
          <Select size="sm" label="Voice" value={voice} onChange={setVoice} options={options} />
          <span style={{ flex: 1 }} />
          <Button iconLeft="download" disabled={!text.trim()} onClick={() => onExport(text)}>
            Export audio
          </Button>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" iconLeft={on ? "player-stop" : "player-play"} disabled={!text.trim()} onClick={read}>
            {on ? "Stop" : "Read"}
          </Button>
        </>
      }
    >
      <p className="sk-modal-text">Paste or type text. It is read on this computer; nothing is uploaded.</p>
      <textarea className="sk-area" aria-label="Text to read" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste text here" />
      {error && <p style={{ color: "var(--tag-red)", margin: "8px 0 0" }}>{error}</p>}
    </Modal>
  );
}
