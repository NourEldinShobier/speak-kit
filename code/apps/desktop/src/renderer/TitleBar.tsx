import { useState } from "react";
import { Icon, IconButton, Kbd, Popover, onArrowKeys } from "@speakkit/ui";
import type { AppState } from "../shared/ipc";
import { engineView } from "../shared/engine-view";
import { showAccelerator } from "../shared/shortcuts";
import { UpdatePill } from "./UpdateCard";

function Bell({ s }: { s: AppState }) {
  const [seen, setSeen] = useState(0);
  const newest = s.activity[0]?.id ?? 0;
  return (
    <span className="sk-bell">
      <Popover
        title="Notifications"
        side="bottom"
        align="end"
        width={340}
        onOpenChange={(o) => o && setSeen(newest)}
        trigger={(t) => <IconButton name="bell" label="Notifications" size={28} {...t} />}
      >
        {s.activity.length === 0 ? (
          <span style={{ color: "var(--text-tertiary)" }}>All caught up.</span>
        ) : (
          <div className="sk-activity" onKeyDown={onArrowKeys(".sk-activity > div")}>
            {s.activity.map((a) => (
              <div key={a.id} tabIndex={0}>
                <b>{a.title}</b>
                <span>
                  {a.body} {new Date(a.atMs).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </Popover>
      {newest > seen && <i className="sk-bell__dot" />}
    </span>
  );
}

export interface TitleBarProps {
  s: AppState;
  canBack: boolean;
  canFwd: boolean;
  onBack(): void;
  onFwd(): void;
  onToggleSide(): void;
  onSearch(): void;
}

/** The 38 px bar: sidebar toggle and history, the search box that opens the palette, the engine status while it is not ready, update pill and notifications. */
export function TitleBar(p: TitleBarProps) {
  const v = engineView(p.s.health, p.s.serverError);
  return (
    <header className="sk-title">
      <div className="sk-title__l">
        <IconButton name="layout-sidebar" label="Toggle sidebar" size={28} onClick={p.onToggleSide} />
        <IconButton name="chevron-left" label="Back" size={28} disabled={!p.canBack} onClick={p.onBack} />
        <IconButton name="chevron-right" label="Forward" size={28} disabled={!p.canFwd} onClick={p.onFwd} />
      </div>
      <button className="sk-search" onClick={p.onSearch} aria-label="Search readings, voices and commands">
        <Icon name="search" size={16} />
        <span>Search readings, voices and commands</span>
        <Kbd small>{showAccelerator("Ctrl+K", p.s.platform, "app").replace("+", " ")}</Kbd>
      </button>
      <div className="sk-title__r">
        {v.key !== "ready" && (
          <span className="sk-engstat" data-testid="title-engine-status">
            {v.label}
            {v.hint ? ` · ${v.hint}` : ""}
          </span>
        )}
        <UpdatePill s={p.s} />
        <Bell s={p.s} />
      </div>
    </header>
  );
}
