import { Button, Icon, onArrowKeys } from "@speakkit/ui";
import { QUICK_TOPICS, splitMatch, type SearchGroup, type SettingRowDef } from "../../../shared/settings/search-index";
import { settingsItem } from "../../routes";

/** Results under the sidebar search field: grouped by page, the typed text in bold, and a way out when nothing matches. */
export function SettingsResults({ q, groups, onOpen, onClear }: { q: string; groups: SearchGroup[]; onOpen(row: SettingRowDef): void; onClear(): void }) {
  if (groups.length === 0)
    return (
      <div className="sk-find" role="status">
        <p>No settings match “{q.trim()}”.</p>
        <Button onClick={onClear}>Clear search</Button>
      </div>
    );
  return (
    <div className="sk-find" role="group" aria-label="Search results" onKeyDown={onArrowKeys(".sk-find__row")}>
      {groups.map((g) => (
        <div key={g.page} role="group" aria-label={settingsItem(g.page).label}>
          <div className="sk-find__page">{settingsItem(g.page).label}</div>
          {g.rows.map((r) => {
            const m = splitMatch(r.label, q);
            return (
              <button key={r.id} type="button" className="sk-find__row" onClick={() => onOpen(r)}>
                {m.before}
                <b>{m.match}</b>
                {m.after}
                {r.advanced && <span className="sk-find__tag">Advanced</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Shown under the empty, focused field: topics that fill it in. */
export function QuickTopics({ onPick }: { onPick(topic: string): void }) {
  return (
    <div className="sk-find sk-find--topics" role="group" aria-label="Quick topics">
      {QUICK_TOPICS.map((t) => (
        <button key={t} type="button" className="sk-find__chip" onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(t)}>
          {t}
        </button>
      ))}
    </div>
  );
}

/** The field under the Settings title. Enter opens the first result. */
export function SettingsSearchField({ q, setQ, setFocus, onEnter }: { q: string; setQ(q: string): void; setFocus(on: boolean): void; onEnter(): void }) {
  return (
    <div className="sk-side__find">
      <Icon name="search" size={16} />
      <input
        type="search"
        aria-label="Search settings"
        placeholder="Search settings"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onKeyDown={(e) => e.key === "Enter" && onEnter()}
      />
    </div>
  );
}
