import { useState } from "react";
import { normalizeSite, type WritingMode as Mode } from "@speakkit/dictation";
import { Button, Chip, Icon, Modal, TextInput } from "@speakkit/ui";

/** Websites of a mode: in Chrome, Edge or Brave with the Speak Kit extension, the page in front picks the mode. */
export function SitesCard({ mode, onSites, onAdd }: { mode: Mode; onSites(sites: string[]): void; onAdd(): void }) {
  return (
    <div className="lm-card modes-apps">
      <span className="modes-apps__label">Websites</span>
      <span className="modes-apps__chips">
        {mode.sites.length === 0 ? <em>No websites yet</em> : null}
        {mode.sites.map((s) => (
          <Chip key={s}>
            {s}
            <button type="button" className="modes-chip-x" aria-label={`Remove ${s}`} onClick={() => onSites(mode.sites.filter((x) => x !== s))}>
              <Icon name="x" size={10} />
            </button>
          </Chip>
        ))}
      </span>
      <Button onClick={onAdd}>Add website</Button>
    </div>
  );
}

const siteError = (text: string, site: string, have: boolean): string | undefined => {
  if (have) return `${site} is already in this mode.`;
  return text.trim() && !site ? "That is not a website address." : undefined;
};

export function AddSiteDialog({ open, mode, others, onClose, onSave }: { open: boolean; mode: Mode; others: readonly Mode[]; onClose(): void; onSave(sites: string[]): void }) {
  const [text, setText] = useState("");
  const site = normalizeSite(text);
  const have = !!site && mode.sites.includes(site);
  const owner = site ? others.find((m) => m.id !== mode.id && m.sites.includes(site)) : undefined;
  const blocked = !site || have;
  const submit = () => {
    if (blocked) return;
    onSave([...mode.sites, site]);
    setText("");
    onClose();
  };
  const footer = (
    <>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={blocked} onClick={submit}>
        Add website
      </Button>
    </>
  );
  return (
    <Modal open={open} onClose={onClose} title={`Add a website to ${mode.name}`} width={440} footer={footer}>
      <form
        className="vocab-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <TextInput
          label="Website"
          hint="The address, for example mail.google.com. A site also covers the pages under it: google.com covers mail.google.com."
          value={text}
          onChange={(e) => setText(e.target.value)}
          error={siteError(text, site, have)}
          data-autofocus=""
          autoComplete="off"
          spellCheck={false}
        />
        {owner ? (
          <p className="vocab-note vocab-note--warn">
            {site} is in {owner.name} now. It moves to this mode.
          </p>
        ) : null}
        <p className="apps-note">Needs the Speak Kit extension in Chrome, Edge or Brave. Other browsers use the mode of the browser itself.</p>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
