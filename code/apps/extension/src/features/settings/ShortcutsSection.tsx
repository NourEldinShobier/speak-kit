import type { ReactNode } from "react";
import { Banner, Button, IconButton, Kbd, StatusPill } from "@speakkit/ui";
import { Card, PageHead } from "../../shared/ui";
import { LINKS, openUrl } from "../../shared/links";
import { manifestCommands } from "./browser";
import { CMD_LABEL, CMD_ORDER, splitShortcut, unassignedSuggestions, useCommands } from "./useCommands";

const Keys = ({ keys, small }: { keys: string[]; small?: boolean }) => (
  <span className="lm-kbds">
    {keys.map((k, i) => (
      <Kbd key={i} small={small}>
        {k}
      </Kbd>
    ))}
  </span>
);

const PAGE_KEYS: [string, string[]][] = [
  ["Next paragraph", ["→"]],
  ["Previous paragraph", ["←"]],
  ["Faster / slower", ["↑", "↓"]],
  ["Stop and close dock", ["Esc"]],
];

function ConflictBanner({ count, onEdit }: { count: number; onEdit: () => void }) {
  return (
    <Banner
      tone="warning"
      title={count === 1 ? "A shortcut is not assigned" : "Some shortcuts are not assigned"}
      action={
        <Button variant="primary" onClick={onEdit}>
          Choose keys in Chrome
        </Button>
      }
      className="op-conflict"
    >
      Chrome leaves a key unassigned when another extension or Chrome already uses it, or when it was removed. Choose a free key in Chrome.
    </Banner>
  );
}

/** One shortcut row: the label on the left; the keys (or the badge) and the pencil button as one cluster on the right. */
function KeyRow({ label, command, children, pencil }: { label: string; command?: string | undefined; children: ReactNode; pencil: ReactNode }) {
  return (
    <div className="op-keyrow" data-command={command}>
      <div className="lm-row__label">{label}</div>
      <div className="op-keycluster">
        {children}
        {pencil}
      </div>
    </div>
  );
}

function CommandRow({ c, unassigned, onEdit }: { c: chrome.commands.Command; unassigned: boolean; onEdit: () => void }) {
  const keys = splitShortcut(c.shortcut);
  const label = CMD_LABEL[c.name!] ?? c.description ?? c.name!;
  return (
    <KeyRow label={label} command={c.name} pencil={<IconButton name="pencil" label={`Change shortcut for ${label}`} onClick={onEdit} />}>
      {keys.length ? (
        <Keys keys={keys} />
      ) : (
        <span className="op-notset">
          {unassigned ? (
            <StatusPill tone="orange" icon="alert-triangle">
              Not assigned
            </StatusPill>
          ) : (
            "Not set"
          )}
        </span>
      )}
    </KeyRow>
  );
}

function BrowserWideCard({ cmds, missing, onEdit }: { cmds: chrome.commands.Command[] | null; missing: Record<string, string>; onEdit: () => void }) {
  const rows = (cmds ?? []).filter((c) => c.name && !c.name.startsWith("_")).sort((a, b) => CMD_ORDER.indexOf(a.name!) - CMD_ORDER.indexOf(b.name!));
  return (
    <section className="lm-card op-card" aria-labelledby="bw-h">
      <div className="op-card-top">
        <div>
          <h2 id="bw-h">Browser-wide (Chrome shortcuts)</h2>
          <p className="op-card-d">Work on any tab, even when the page has no focus. Chrome allows four per extension.</p>
        </div>
        <Button iconLeft="external-link" onClick={onEdit}>
          Edit in Chrome
        </Button>
      </div>
      <div className="op-keys" data-testid="chrome-commands">
        {cmds === null && <p className="op-card-d">Loading shortcuts…</p>}
        {rows.map((c) => (
          <CommandRow key={c.name} c={c} unassigned={!!missing[c.name!]} onEdit={onEdit} />
        ))}
      </div>
    </section>
  );
}

/** C6 Shortcuts, with the C16 badge on a command Chrome did not assign. */
export function ShortcutsSection() {
  const cmds = useCommands();
  const edit = () => void openUrl(LINKS.shortcuts);
  const missing = unassignedSuggestions(cmds ?? [], manifestCommands());
  return (
    <>
      <PageHead title="Shortcuts" desc="Browser-wide keys are managed by Chrome. Keys that work on the page are listed here." />
      {Object.keys(missing).length > 0 && <ConflictBanner count={Object.keys(missing).length} onEdit={edit} />}
      <BrowserWideCard cmds={cmds} missing={missing} onEdit={edit} />
      <Card title="On this page" desc="Active while you read and no text field has focus." id="onpage-h">
        <div className="op-grid2 keys">
          {PAGE_KEYS.map(([l, k]) => (
            <KeyRow key={l} label={l} pencil={<IconButton name="pencil" label={`${l} is fixed in this version`} disabled />}>
              <Keys keys={k} small />
            </KeyRow>
          ))}
        </div>
      </Card>
    </>
  );
}
