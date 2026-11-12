import { useState } from "react";
import { Banner, Button, Modal, Select, SettingRow } from "@speakkit/ui";
import type { DictationStatus } from "../../../shared/dictation/contract";
import { patchDictation } from "../dictation-bridge";
import { deadlineLabel, DEADLINES, WRITER } from "./model";
import { Toggle } from "@speakkit/ui";

function OptInBody({ hasKey, deadline, onDeadline }: { hasKey: boolean; deadline: number; onDeadline(ms: number): void }) {
  return (
    <div className="modes-optin">
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
          <b>If the writer is slow</b>, the text is pasted as you said it. Text that is only numbers is never sent.
        </li>
      </ul>
      <SettingRow
        className="lm-row--control"
        label="Give up after"
        description="The longest dictation waits for the writer."
        control={<Select label="Give up after" value={String(deadline)} onChange={(v) => onDeadline(Number(v))} options={DEADLINES.map((d) => ({ value: String(d), label: deadlineLabel(d) }))} />}
      />
    </div>
  );
}

function OptInDialog({ open, s, onClose }: { open: boolean; s: DictationStatus; onClose(): void }) {
  const [deadline, setDeadline] = useState<number>(s.settings.rewrite.deadlineMs);
  const turnOn = () => {
    void patchDictation({ rewrite: { enabled: true, deadlineMs: deadline } });
    onClose();
  };
  const footer = (
    <>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={!s.rewriteKey} onClick={turnOn}>
        Turn on rewrite pass
      </Button>
    </>
  );
  return (
    <Modal open={open} onClose={onClose} title="Turn on the rewrite pass?" width={480} footer={footer}>
      <OptInBody hasKey={s.rewriteKey} deadline={deadline} onDeadline={setDeadline} />
    </Modal>
  );
}

/** The opt-in for the rewrite pass: off until the person sets it up, because the text leaves the computer. */
export function RewriteCard({ s }: { s: DictationStatus }) {
  const [asking, setAsking] = useState(false);
  const r = s.settings.rewrite;
  return (
    <section className="lm-section" aria-label="Rewrite pass">
      <header className="lm-section__head">
        <h3 className="lm-section__title">Rewrite pass</h3>
        <p className="lm-section__desc">Tidies a dictation with a writer model after it is heard. Off until you turn it on.</p>
      </header>
      <div className="lm-card">
        {r.enabled ? (
          <SettingRow
            label="Rewrite dictated text"
            description={`Writer: ${WRITER}. Gives up after ${deadlineLabel(r.deadlineMs)} and pastes what you said. Choose which modes use it in each mode.`}
            control={
              <div className="modes-acts">
                <Button onClick={() => setAsking(true)}>Change</Button>
                <Toggle aria-label="Rewrite dictated text" checked onChange={() => void patchDictation({ rewrite: { enabled: false, deadlineMs: r.deadlineMs } })} />
              </div>
            }
          />
        ) : (
          <SettingRow
            label="Rewrite dictated text"
            description="The text is sent to the writer you choose, so it leaves this computer. Without it, dictation never leaves."
            control={<Button onClick={() => setAsking(true)}>Set up</Button>}
          />
        )}
      </div>
      <OptInDialog key={String(asking)} open={asking} s={s} onClose={() => setAsking(false)} />
    </section>
  );
}
