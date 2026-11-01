import { Button, Icon, IconButton, TextInput } from "@speakkit/ui";
import type { OutlineItem } from "./model";

export function OutlinePanel({ items, current, onPick, onClose }: { items: OutlineItem[]; current: number; onPick(block: number): void; onClose(): void }) {
  const active = items.findLast((o) => o.block <= current);
  return (
    <aside className="rd-outline" aria-label="Outline">
      <div className="rd-outline__head">
        <b>Outline</b>
        <IconButton name="x" label="Close outline" size={28} onClick={onClose} />
      </div>
      {items.length === 0 ? (
        <p className="rd-muted">This reading has no headings.</p>
      ) : (
        <nav>
          {items.map((o) => (
            <button key={`${o.block}-${o.label}`} type="button" className="rd-outline__item" data-level={o.level} aria-current={o === active ? "true" : undefined} onClick={() => onPick(o.block)}>
              {o.label}
            </button>
          ))}
        </nav>
      )}
    </aside>
  );
}

export function FindBar({ query, count, current, onQuery, onStep, onClose }: { query: string; count: number; current: number; onQuery(q: string): void; onStep(dir: 1 | -1): void; onClose(): void }) {
  return (
    <div className="rd-find" role="search">
      <TextInput
        size="sm"
        icon="search"
        aria-label="Find in text"
        placeholder="Find in text"
        value={query}
        autoFocus
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onStep(e.shiftKey ? -1 : 1);
          if (e.key === "Escape") onClose();
        }}
      />
      <span className="rd-muted" role="status" data-testid="find-count">{query.trim() ? (count ? `${current + 1} of ${count}` : "No results") : ""}</span>
      <IconButton name="chevron-up" label="Previous match" size={28} disabled={!count} onClick={() => onStep(-1)} />
      <IconButton name="chevron-down" label="Next match" size={28} disabled={!count} onClick={() => onStep(1)} />
      <IconButton name="x" label="Close find" size={28} onClick={onClose} />
    </div>
  );
}

export function FinishedCard({ title, onReplay, onBack }: { title: string; onReplay(): void; onBack(): void }) {
  return (
    <div className="rd-scrim">
      <div className="rd-finished" role="dialog" aria-label="Finished">
        <span className="rd-finished__tile"><Icon name="circle-check" size={28} /></span>
        <h2>Finished</h2>
        <p className="rd-muted">"{title}" is marked as finished.</p>
        <div className="rd-finished__actions">
          <Button onClick={onBack}>Back to library</Button>
          <Button variant="primary" iconLeft="refresh" onClick={onReplay}>Read again</Button>
        </div>
      </div>
    </div>
  );
}
