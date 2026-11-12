import { useState } from "react";
import { Button, Modal, TextInput } from "@speakkit/ui";
import { LINK_MESSAGES, parseLink } from "@speakkit/meetings/pure";
import type { AddAppResult } from "../../../shared/meetings/contract";
import { meetings } from "./api";

/** The full-link rule, said where the person pastes: a host alone or a short path would match unrelated pages. */
export const LINK_RULE = "Paste the full link of a meeting, with its code. A link that is only the site, or too short to name one meeting, would match other pages and is refused.";

interface Props {
  open: boolean;
  onClose(): void;
  onAdded(): void;
}

function Notes({ linkProblem, error }: { linkProblem: string | null; error: string | undefined }) {
  return (
    <>
      {linkProblem ? (
        <p className="mt-error" role="alert">
          {linkProblem}
        </p>
      ) : (
        <p className="mt-hint">{LINK_RULE}</p>
      )}
      {error ? (
        <p className="mt-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

function Field({ label, aria, error, ...rest }: { label: string; aria: string; error?: boolean; value: string; placeholder: string; onChange(v: string): void; "data-autofocus"?: boolean }) {
  const { onChange, ...input } = rest;
  return (
    <label className="mt-field">
      <span>{label}</span>
      <TextInput aria-label={aria} aria-invalid={error} onChange={(e) => onChange(e.target.value)} {...input} />
    </label>
  );
}

/** The answer, or null when the call itself failed. */
const submit = (f: { name: string; exe: string; link: string }): Promise<AddAppResult | null> =>
  meetings.addApp({ name: f.name, ...(f.exe.trim() && { exe: f.exe.trim() }), ...(f.link.trim() && { link: f.link.trim() }) }).then(
    (x) => x,
    () => null,
  );

function Footer({ ready, onCancel, onAdd }: { ready: boolean; onCancel(): void; onAdd(): void }) {
  return (
    <>
      <Button onClick={onCancel}>Cancel</Button>
      <Button variant="primary" disabled={!ready} onClick={onAdd}>
        Add app
      </Button>
    </>
  );
}

/** Add an app for calls: its name, the program, or the full link of a meeting. The Add button waits until what is typed can work. */
export function AddAppDialog({ open, onClose, onAdded }: Props) {
  const [name, setName] = useState("");
  const [exe, setExe] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const parsed = link.trim() ? parseLink(link) : null;
  const linkProblem = parsed && !parsed.ok ? LINK_MESSAGES[parsed.problem] : null;
  const ready = name.trim() !== "" && (exe.trim() !== "" || (parsed?.ok ?? false)) && !linkProblem;
  const typing = (set: (v: string) => void) => (v: string) => (set(v), setError(null));
  const reset = () => {
    setName("");
    setExe("");
    setLink("");
    setError(null);
  };
  const close = () => {
    reset();
    onClose();
  };
  const add = async () => {
    const r = await submit({ name, exe, link });
    if (!r) return setError({ field: "name", message: "The app could not be added. Try again." });
    if (!r.ok) return setError({ field: r.field, message: r.message });
    reset();
    onAdded();
  };
  return (
    <Modal open={open} onClose={close} title="Add an app for calls" width={440} footer={<Footer ready={ready} onCancel={close} onAdd={() => void add()} />}>
      <div className="mt-form">
        <Field label="Name" aria="App name" value={name} data-autofocus placeholder="Whereby" onChange={typing(setName)} />
        <Field label="Program name on this computer" aria="Program name" value={exe} placeholder="whereby.exe" onChange={typing(setExe)} />
        <Field label="Or the full link of a meeting" aria="Meeting link" value={link} error={!!linkProblem} placeholder="https://example.com/my-room" onChange={typing(setLink)} />
        <Notes linkProblem={linkProblem} error={error?.message} />
      </div>
    </Modal>
  );
}
