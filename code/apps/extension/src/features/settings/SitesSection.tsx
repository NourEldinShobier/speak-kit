import { useEffect, useState } from "react";
import { compareNames, plural, type SiteDefault, type SiteRule } from "@speakkit/protocol";
import { Icon, IconButton, Select, SettingRow, TextInput } from "@speakkit/ui";
import { Card, PageHead, ToggleGrid, ToggleRow } from "../../shared/ui";
import { hasTabsPermission, recentWebTabs, removeTabsPermission, requestTabsPermission } from "./browser";
import { defaultSettings, type SectionProps, type Settings } from "./types";

/** "https://www.News.Example.com/a?b" -> "www.news.example.com"; null when it is not a host name. */
function normalizeHost(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "");
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$|^localhost$/.test(s) ? s : null;
}

const RULES: { value: SiteRule; label: string }[] = [
  { value: "always-dock", label: "Always show dock" },
  { value: "hide-controls", label: "Hide controls" },
  { value: "never-read", label: "Never read" },
];
const DEFAULTS: { value: SiteDefault; label: string }[] = [
  { value: "ask", label: "Ask each time" },
  { value: "never-read", label: "Never read" },
];
const DOT: Record<SiteRule, string> = { "always-dock": "var(--tag-green)", "hide-controls": "var(--text-tertiary)", "never-read": "var(--tag-red)" };
const ruleLabel = (r: SiteRule) => RULES.find((x) => x.value === r)!.label;

type Upd = SectionProps["upd"];

const SKIP_ITEMS: { key: keyof Settings["skip"]; title: string }[] = [
  { key: "navigation", title: "Navigation, menus and footers" },
  { key: "citations", title: "Footnote numbers and citations [12]" },
  { key: "code", title: "Code blocks" },
  { key: "urls", title: "Long URLs (say “link” instead)" },
  { key: "captions", title: "Image captions" },
];

function SkipCard({ s, upd }: Pick<SectionProps, "s" | "upd">) {
  const setSkip = (k: keyof Settings["skip"], v: boolean) => upd((x) => ({ ...x, skip: { ...x.skip, [k]: v } }));
  return (
    <Card title="What to skip" id="skip-h">
      <ToggleGrid items={SKIP_ITEMS.map(({ key, title }) => ({ title, on: s.skip[key], onChange: (v) => setSkip(key, v) }))} />
    </Card>
  );
}

/** The host of the most recently used web tab, or null when no tab is readable. */
async function currentSite(): Promise<string | null> {
  const t = (await recentWebTabs())[0];
  try {
    return t?.url ? normalizeHost(new URL(t.url).hostname) : null;
  } catch {
    return null;
  }
}

function RuleAdder({ upd }: { upd: Upd }) {
  const [host, setHost] = useState("");
  const [rule, setRule] = useState<SiteRule>("always-dock");
  const [err, setErr] = useState("");
  const add = () => {
    const h = normalizeHost(host);
    if (!h) {
      setErr("Enter a site such as news.example.com.");
      return;
    }
    setErr("");
    setHost("");
    upd((x) => ({ ...x, sites: { ...x.sites, [h]: rule } }));
  };
  const useTab = async () => {
    const h = await currentSite();
    if (h) setHost(h);
    setErr(h ? "" : "Couldn't read another tab's address. Type the site instead.");
  };
  return (
    <>
      <div className="op-add">
        <div className="lm-field">
          <div className="lm-input">
            <Icon name="world" className="lm-input__icon" />
            <input
              className="lm-input__field"
              aria-label="Site"
              placeholder="Add a site, e.g. news.example.com"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <button type="button" className="op-chip" onClick={useTab}>
              Use this tab's site
            </button>
          </div>
        </div>
        <Select className="op-rule-select" label="Rule for new site" options={RULES} value={rule} onChange={(v) => setRule(v as SiteRule)} />
        <IconButton name="plus" label="Add site" variant="primary" onClick={add} />
      </div>
      {err && (
        <p className="op-err" role="alert">
          <Icon name="alert-triangle" size={13} />
          {err}
        </p>
      )}
    </>
  );
}

function RuleRow({ host, rule, upd }: { host: string; rule: SiteRule; upd: Upd }) {
  return (
    <li>
      <Icon name="world" size={16} />
      <div className="sk-grow">
        <div>{host}</div>
        {rule === "never-read" && <small>Nothing on this site is sent to the voice engine.</small>}
      </div>
      <Select
        className="op-rule-select"
        label={`Rule for ${host}`}
        options={RULES}
        value={rule}
        onChange={(v) => upd((x) => ({ ...x, sites: { ...x.sites, [host]: v as SiteRule } }))}
        renderValue={() => (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <i style={{ width: 8, height: 8, borderRadius: 999, background: DOT[rule] }} />
            {ruleLabel(rule)}
          </span>
        )}
      />
      <IconButton
        name="trash"
        label={`Remove rule for ${host}`}
        onClick={() =>
          upd((x) => {
            const { [host]: _, ...rest } = x.sites;
            return { ...x, sites: rest };
          })
        }
      />
    </li>
  );
}

function RulesCard({ s, upd }: Pick<SectionProps, "s" | "upd">) {
  const [q, setQ] = useState("");
  const entries = Object.entries(s.sites);
  const shown = entries.filter(([h]) => h.includes(q.trim().toLowerCase())).sort(([a], [b]) => compareNames(a, b));
  return (
    <section className="lm-card op-card" aria-labelledby="rules-h">
      <div className="op-card-top">
        <div>
          <h2 id="rules-h">Site permissions</h2>
          <p className="op-card-d">Applies to the site and its subdomains.</p>
        </div>
        {entries.length > 0 && <TextInput icon="search" aria-label="Search rules" placeholder={`Search ${plural(entries.length, "rule", "rules")}`} value={q} onChange={(e) => setQ(e.target.value)} />}
      </div>
      <RuleAdder upd={upd} />
      <ul className="op-rules" aria-label="Site rules">
        {shown.map(([h, r]) => (
          <RuleRow key={h} host={h} rule={r} upd={upd} />
        ))}
        {entries.length === 0 && <li className="empty">No site rules yet. Sites you add here override the defaults above.</li>}
      </ul>
    </section>
  );
}

/** Lets dictation use a per-site mode. The "tabs" permission is asked for only here, so the install shows no browsing-history warning. */
function SiteAwareCard() {
  const [on, setOn] = useState(false);
  useEffect(() => void hasTabsPermission().then(setOn), []);
  // request() must start inside the click, so it is called here before any await.
  const change = (v: boolean) => void (v ? requestTabsPermission() : removeTabsPermission()).then(() => hasTabsPermission().then(setOn));
  return (
    <Card title="Site-aware dictation" id="aware-h">
      <ToggleRow
        title="Tell Speak Kit which site is in front"
        desc="Only the site's name is sent, to the app on this computer, so dictation can use that site's mode. Chrome asks you to allow reading your tabs."
        on={on}
        onChange={change}
      />
    </Card>
  );
}

/** Sites and filters. */
export function SitesSection({ s, upd, saved }: SectionProps) {
  return (
    <>
      <PageHead
        title="Sites and filters"
        desc="Choose where Speak Kit appears and what it skips when it reads."
        saved={saved}
        onReset={() => upd((x) => ({ ...x, skip: defaultSettings().skip, sites: {}, siteDefault: "ask" }))}
      />
      <SkipCard s={s} upd={upd} />
      <RulesCard s={s} upd={upd} />
      <SiteAwareCard />
      <Card
        title="Sites not in the list"
        id="default-h"
        desc="Ask each time shows the controls but reads nothing until you press play. Never read keeps Speak Kit off every site you did not add above."
      >
        <SettingRow
          label="Default for other sites"
          control={<Select label="Default for other sites" options={DEFAULTS} value={s.siteDefault} onChange={(v) => upd((x) => ({ ...x, siteDefault: v as SiteDefault }))} />}
        />
      </Card>
    </>
  );
}
