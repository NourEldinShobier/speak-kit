import { useState } from "react";
import { TEMPLATES, type TemplateId } from "@speakkit/dictation";
import { Banner, Button, Modal, Select, SettingRow, Toggle } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";
import type { WriterCard } from "../../../shared/speech-models/contract";
import { sizeText } from "../../speech-text";
import { patchDictation } from "../dictation-bridge";
import { useSpeechModels } from "../engines";
import { LOCAL_WRITER, STYLE_NAMES, STYLE_OPTIONS, WRITER, writerName } from "./model";
import { WriterDownload } from "./WriterDownload";

type Writer = DictationStatus["settings"]["rewriteWriter"];

const WRITER_OPTIONS = [
  { value: "local", label: "On this computer (Gemma 4, offline)" },
  { value: "openai", label: "OpenAI" },
];

function OpenAiNotes({ hasKey }: { hasKey: boolean }) {
  return (
    <>
      {!hasKey ? (
        <Banner tone="warning" title="No OpenAI key saved">
          Save your OpenAI key on the Voice chat page first. The writer needs it.
        </Banner>
      ) : null}
      <ul className="modes-optin__list">
        <li>
          <b>Your text leaves this computer.</b> After a dictation is heard, its text is sent to the writer to be tidied. Without the rewrite pass, dictation never leaves your computer.
        </li>
        <li>
          <b>Writer:</b> {WRITER}, with the key you saved for voice chat.
        </li>
        <li>
          <b>While it works you can skip it</b> and the text is pasted as you said it. Text that is only numbers is never sent.
        </li>
      </ul>
    </>
  );
}

function LocalNotes({ w }: { w: WriterCard | undefined }) {
  return (
    <>
      <ul className="modes-optin__list">
        <li>
          <b>Your text stays on this computer.</b> The writer runs offline here, with no key and no account.
        </li>
        <li>
          <b>Writer:</b> {LOCAL_WRITER}
          {w ? `, a ${sizeText(w.bytes)} download (${w.license.name})` : ""}. It is loaded when you start dictating and uses memory while it is.
        </li>
        <li>
          <b>While it works you can skip it</b> and the text is pasted as you said it. Text that is only numbers is never sent.
        </li>
      </ul>
      {w ? <WriterDownload w={w} /> : null}
    </>
  );
}

interface BodyProps {
  writer: Writer;
  onWriter(w: Writer): void;
  hasKey: boolean;
  w: WriterCard | undefined;
}

function OptInBody({ writer, onWriter, hasKey, w }: BodyProps) {
  return (
    <div className="modes-optin">
      <SettingRow
        className="lm-row--control"
        label="Writer"
        description="The model that tidies the text."
        control={<Select label="Writer" value={writer} onChange={(v) => onWriter(v as Writer)} options={WRITER_OPTIONS} />}
      />
      {writer === "local" ? <LocalNotes w={w} /> : <OpenAiNotes hasKey={hasKey} />}
    </div>
  );
}

function OptInDialog({ open, s, w, onClose }: { open: boolean; s: DictationStatus; w: WriterCard | undefined; onClose(): void }) {
  const [writer, setWriter] = useState<Writer>(s.settings.rewriteWriter);
  const ready = writer === "local" ? !!w?.installed : s.rewriteKey;
  const turnOn = () => {
    void patchDictation({ rewrite: { enabled: true }, rewriteWriter: writer });
    onClose();
  };
  const footer = (
    <>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={!ready} onClick={turnOn}>
        Turn on rewrite pass
      </Button>
    </>
  );
  return (
    <Modal open={open} onClose={onClose} title="Turn on the rewrite pass?" width={480} footer={footer}>
      <OptInBody writer={writer} onWriter={setWriter} hasKey={s.rewriteKey} w={w} />
    </Modal>
  );
}

/** What the card says about the writer once the pass is on; a local writer whose file was deleted is called out. */
function enabledNote(s: DictationStatus, w: WriterCard | undefined): string {
  const missing = s.settings.rewriteWriter === "local" && w && !w.installed ? " The writer model is not downloaded, so the text is pasted as you said it." : "";
  return `Writer: ${writerName(s.settings.rewriteWriter)}. While it works you can skip it and the text is pasted as you said it. Choose which modes use it in each mode.${missing}`;
}

const DEFAULT_STYLE_OPTIONS = [{ value: "off", label: "Off: the text is pasted as you said it" }, ...STYLE_OPTIONS];

/** The style for apps in no mode, and the list of every style: a mode picks its own in its settings. */
function DefaultStyleRow({ value }: { value: DictationStatus["settings"]["rewriteDefault"] }) {
  return (
    <SettingRow
      className="lm-row--control"
      label="Style for apps in no mode"
      description={`Writing styles: ${STYLE_NAMES}. Pick one in each mode too; a mode's own style wins.`}
      control={
        <Select
          label="Style for apps in no mode"
          value={value}
          onChange={(v) => void patchDictation({ rewriteDefault: v as typeof value })}
          options={DEFAULT_STYLE_OPTIONS}
          renderValue={(o) => (o?.value === "off" ? "Off" : TEMPLATES[o?.value as TemplateId]?.name)}
        />
      }
    />
  );
}

/** The opt-in for the rewrite pass: off until the person sets it up, because the text leaves the computer when the writer is OpenAI. */
export function RewriteCard({ s }: { s: DictationStatus }) {
  const [asking, setAsking] = useState(false);
  const { view } = useSpeechModels();
  const r = s.settings.rewrite;
  return (
    <section className="lm-section" aria-label="Rewrite pass">
      <header className="lm-section__head">
        <h3 className="lm-section__title">Rewrite pass</h3>
        <p className="lm-section__desc">Tidies a dictation with a writer model after it is heard. Off until you turn it on.</p>
      </header>
      <div className="lm-card">
        {r.enabled ? (
          <>
            <SettingRow
              label="Rewrite dictated text"
              description={enabledNote(s, view?.writer)}
              control={
                <div className="modes-acts">
                  <Button onClick={() => setAsking(true)}>Change</Button>
                  <Toggle aria-label="Rewrite dictated text" checked onChange={() => void patchDictation({ rewrite: { enabled: false } })} />
                </div>
              }
            />
            <DefaultStyleRow value={s.settings.rewriteDefault} />
          </>
        ) : (
          <SettingRow
            label="Rewrite dictated text"
            description="The text is tidied by the writer you choose: a model on this computer, or OpenAI, which means the text leaves this computer. Without it, dictation never leaves."
            control={<Button onClick={() => setAsking(true)}>Set up</Button>}
          />
        )}
      </div>
      <OptInDialog key={String(asking)} open={asking} s={s} w={view?.writer} onClose={() => setAsking(false)} />
    </section>
  );
}
