import { useState } from "react";
import type { SiteRule } from "@speakkit/protocol";
import { Button, Icon, IconButton, Kbd, Select, TextInput } from "@speakkit/ui";
import { Card, PageHead, ToggleGrid } from "../../shared/ui";
import { LINKS, openUrl } from "../../shared/links";
import { defaultSettings, type SectionProps, type Settings } from "./types";
import { CMD_LABEL, CMD_ORDER, splitShortcut, useCommands } from "./useCommands";

/** "https://www.News.Example.com/a?b" -> "www.news.example.com"; null when it is not a host name. */
function normalizeHost(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "");
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$|^localhost$/.test(s) ? s : null;
}

const RULES: { value: SiteRule; label: string }[] = [
  { value: "always-dock", label: "Always show dock" },
  { value: "hide-controls", label: "Hide controls" },
  { value: "never-read", label: "Never read" },
];
const DOT: Record<SiteRule, string> = { "always-dock": "var(--tag-green)", "hide-controls": "var(--text-tertiary)", "never-read": "var(--tag-red)" };
const ruleLabel = (r: SiteRule) => RULES.find((x) => x.value === r)!.label;

/** C7 Sites and filters. */
export function SitesSection({ s, upd, saved }: SectionProps) {
  const [host, setHost] = useState("");
  const [rule, setRule] = useState<SiteRule>("always-dock");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const setSkip = (k: keyof Settings["skip"], v: boolean) => upd((x) => ({ ...x, skip: { ...x.skip, [k]: v } }));
  const entries = Object.entries(s.sites);
  const shown = entries.filter(([h]) => h.includes(q.trim().toLowerCase())).sort(([a], [b]) => a.localeCompare(b));
  const add = () => {
    const h = normalizeHost(host);
    if (!h) { setErr("Enter a site such as news.example.com."); return; }
    setErr(""); setHost("");
    upd((x) => ({ ...x, sites: { ...x.sites, [h]: rule } }));
  };
  const useTab = async () => {
    try {
      const tabs = await chrome.tabs.query({});
      const t = tabs.filter((x) => /^https?:/.test(x.url ?? "")).sort((a, b) => ((b as { lastAccessed?: number }).lastAccessed ?? 0) - ((a as { lastAccessed?: number }).lastAccessed ?? 0))[0];
      const h = t?.url ? normalizeHost(new URL(t.url).hostname) : null;
      if (h) { setHost(h); setErr(""); return; }
    } catch { /* no tabs permission */ }
    setErr("Couldn't read another tab's address. Type the site instead.");
  };
  return (
    <>
      <PageHead title="Sites and filters" desc="Choose where SpeakKit appears and what it skips when it reads." saved={saved} onReset={() => upd((x) => ({ ...x, skip: defaultSettings().skip, sites: {} }))} />
      <Card title="What to skip" id="skip-h">
        <ToggleGrid items={[
          { title: "Navigation, menus and footers", on: s.skip.navigation, onChange: (v) => setSkip("navigation", v) },
          { title: "Footnote numbers and citations [12]", on: s.skip.citations, onChange: (v) => setSkip("citations", v) },
          { title: "Code blocks", on: s.skip.code, onChange: (v) => setSkip("code", v) },
          { title: "Long URLs (say “link” instead)", on: s.skip.urls, onChange: (v) => setSkip("urls", v) },
          { title: "Image captions", on: s.skip.captions, onChange: (v) => setSkip("captions", v) },
        ]} />
      </Card>
      <section className="lm-card op-card" aria-labelledby="rules-h">
        <div className="op-card-top">
          <div><h2 id="rules-h">Site rules</h2><p className="op-card-d">Applies to the site and its subdomains.</p></div>
          {entries.length > 0 && <TextInput size="sm" icon="search" aria-label="Search rules" placeholder={`Search ${entries.length} rule${entries.length === 1 ? "" : "s"}`} value={q} onChange={(e) => setQ(e.target.value)} />}
        </div>
        <div className="op-add">
          <TextInput icon="world" aria-label="Site" placeholder="Add a site, e.g. news.example.com" value={host} onChange={(e) => setHost(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <Select label="Rule for new site" options={RULES} value={rule} onChange={(v) => setRule(v as SiteRule)} />
          <Button variant="primary" iconLeft="plus" onClick={add}>Add</Button>
          <Button variant="ghost" onClick={useTab}>Use this tab's site</Button>
        </div>
        {err && <p className="op-err" role="alert"><Icon name="alert-triangle" size={13} />{err}</p>}
        <ul className="op-rules" aria-label="Site rules">
          {shown.map(([h, r]) => (
            <li key={h}>
              <Icon name="world" size={16} />
              <div className="sk-grow"><div>{h}</div>{r === "never-read" && <small>Nothing on this site is sent to the voice engine.</small>}</div>
              <Select
                size="sm"
                label={`Rule for ${h}`}
                options={RULES}
                value={r}
                onChange={(v) => upd((x) => ({ ...x, sites: { ...x.sites, [h]: v as SiteRule } }))}
                renderValue={() => (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <i style={{ width: 8, height: 8, borderRadius: 999, background: DOT[r] }} />{ruleLabel(r)}
                  </span>
                )}
              />
              <IconButton name="trash" label={`Remove rule for ${h}`} onClick={() => upd((x) => { const { [h]: _, ...rest } = x.sites; return { ...x, sites: rest }; })} />
            </li>
          ))}
          {entries.length === 0 && <li className="empty">No site rules yet. Sites you add here override the defaults above.</li>}
        </ul>
      </section>
    </>
  );
}

/** C6 Shortcuts. */
export function ShortcutsSection() {
  const cmds = useCommands();
  const edit = () => void openUrl(LINKS.shortcuts);
  const rows = (cmds ?? []).filter((c) => c.name && !c.name.startsWith("_")).sort((a, b) => CMD_ORDER.indexOf(a.name!) - CMD_ORDER.indexOf(b.name!));
  const page: [string, string[]][] = [["Next paragraph", ["→"]], ["Previous paragraph", ["←"]], ["Faster / slower", ["↑", "↓"]], ["Stop and close dock", ["Esc"]]];
  const Keys = ({ keys, small }: { keys: string[]; small?: boolean }) => <span className="lm-kbds">{keys.map((k, i) => <Kbd key={i} small={small}>{k}</Kbd>)}</span>;
  return (
    <>
      <PageHead title="Shortcuts" desc="Browser-wide keys are managed by Chrome. Keys that work on the page are listed here." />
      <section className="lm-card op-card" aria-labelledby="bw-h">
        <div className="op-card-top">
          <div><h2 id="bw-h">Browser-wide (Chrome shortcuts)</h2><p className="op-card-d">Work on any tab, even when the page has no focus. Chrome allows four per extension.</p></div>
          <Button size="sm" iconLeft="external-link" onClick={edit}>Edit in Chrome</Button>
        </div>
        <div className="op-keys" data-testid="chrome-commands">
          {cmds === null && <p className="op-card-d">Loading shortcuts…</p>}
          {rows.map((c) => {
            const keys = splitShortcut(c.shortcut);
            return (
              <div className="op-keyrow" key={c.name}>
                <div><div className="lm-row__label">{CMD_LABEL[c.name!] ?? c.description ?? c.name}</div></div>
                {keys.length ? <Keys keys={keys} /> : <span className="op-notset">Not set</span>}
                <IconButton name="pencil" label={`Change shortcut for ${CMD_LABEL[c.name!] ?? c.name}`} onClick={edit} />
              </div>
            );
          })}
        </div>
      </section>
      <Card title="On this page" desc="Active while you read and no text field has focus." id="onpage-h">
        <div className="op-grid2 keys">
          {page.map(([l, k]) => (
            <div className="op-keyrow" key={l}>
              <div className="lm-row__label">{l}</div><Keys keys={k} small />
              <IconButton name="pencil" label={`${l} is fixed in this version`} disabled />
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
