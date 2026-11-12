import { useState } from "react";
import { siteOf, type WritingMode as Mode } from "@speakkit/dictation";
import { Button, Chip, Icon, TextInput } from "@speakkit/ui";

const HELP = "A website name such as github.com. It also covers its subdomains. Needs a browser with its address bar visible.";

/** What the field says about the typed text: a mistake, a site that moves from another mode, a repeat, or the general help. */
function hint(text: string, site: string | undefined, where: { have: boolean; owner?: string | undefined }): string {
  if (text.trim() !== "" && !site) return "Type a website name such as github.com.";
  if (!site) return HELP;
  if (where.owner) return `${site} is in ${where.owner} now. It moves to this mode.`;
  return where.have ? `${site} is already in this mode.` : HELP;
}

function SiteChips({ mode, onSites }: { mode: Mode; onSites(sites: string[]): void }) {
  return (
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
  );
}

/** The websites of a mode: in a browser, the page in front decides the mode before the program does. */
export function ModeSites({ mode, others, onSites }: { mode: Mode; others: readonly Mode[]; onSites(sites: string[]): void }) {
  const [text, setText] = useState("");
  const site = siteOf(text);
  const have = !!site && mode.sites.includes(site);
  const add = () => {
    if (!site || have) return;
    onSites([...mode.sites, site]);
    setText("");
  };
  return (
    <div className="lm-card modes-apps">
      <span className="modes-apps__label">Websites</span>
      <SiteChips mode={mode} onSites={onSites} />
      <form
        className="modes-site-form"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <TextInput
          label="Website"
          hint={hint(text, site, { have, owner: site ? others.find((m) => m.id !== mode.id && m.sites.includes(site))?.name : undefined })}
          error={text.trim() !== "" && !site ? "Not a website name." : undefined}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" disabled={!site || have}>
          Add website
        </Button>
      </form>
    </div>
  );
}
