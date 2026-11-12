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

/** Add an app for calls: its name, the program, or the full link of a meeting. The Add button waits until what is typed can work. */
export function AddAppDialog({ open, onClose, onAdded }: Props) {
  const [name, setName] = useState("");
  const [exe, setExe] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const parsed = link.trim() ? parseLink(link) : null;
  const linkProblem = parsed && !parsed.ok ? LINK_MESSAGES[parsed.problem] : null;
  const ready = name.trim() !== "" && (exe.trim() !== "" || (parsed?.ok ?? false)) && !linkProblem;
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
    const r: AddAppResult | null = await meetings.addApp({ name, ...(exe.trim() && { exe: exe.trim() }), ...(link.trim() && { link: link.trim() }) }).catch(() => null);
    if (!r) return setError({ field: "name", message: "The app could not be added. Try again." });
    if (!r.ok) return setError({ field: r.field, message: r.message });
    reset();
    onAdded();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title="Add an app for calls"
      width={440}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={!ready} onClick={() => void add()}>
            Add app
          </Button>
        </>
      }
    >
      <div className="mt-form">
        <label className="mt-field">
          <span>Name</span>
          <TextInput aria-label="App name" value={name} data-autofocus onChange={(e) => (setName(e.target.value), setError(null))} placeholder="Whereby" />
        </label>
        <label className="mt-field">
          <span>Program name on this computer</span>
          <TextInput aria-label="Program name" value={exe} onChange={(e) => (setExe(e.target.value), setError(null))} placeholder="whereby.exe" />
        </label>
        <label className="mt-field">
          <span>Or the full link of a meeting</span>
          <TextInput aria-label="Meeting link" value={link} aria-invalid={!!linkProblem} onChange={(e) => (setLink(e.target.value), setError(null))} placeholder="https://whereby.com/my-room" />
        </label>
        {linkProblem ? (
          <p className="mt-error" role="alert">
            {linkProblem}
          </p>
        ) : (
          <p className="mt-hint">{LINK_RULE}</p>
        )}
        {error ? (
          <p className="mt-error" role="alert">
            {error.message}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
