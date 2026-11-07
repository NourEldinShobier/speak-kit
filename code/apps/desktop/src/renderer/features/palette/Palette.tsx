import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, Kbd, Menu, MenuGroupLabel, MenuItem } from "@speakkit/ui";
import type { Voice } from "@speakkit/protocol";
import { buildCommands, filterCommands, type Command } from "./model";
import { api } from "../../ui";

/** The commands that match the query; the voices come from the server once. */
function useMatches(q: string): Command[] {
  const [voices, setVoices] = useState<Voice[]>([]);
  useEffect(() => {
    api.voices().then(
      (v) => setVoices(v.voices),
      () => {},
    );
  }, []);
  const all = useMemo(() => buildCommands(voices), [voices]);
  return useMemo(() => filterCommands(all, q), [all, q]);
}

interface ListProps {
  shown: Command[];
  at: number;
  query: string;
  onHover: (i: number) => void;
  onRun: (c: Command) => void;
}

function PaletteList({ shown, at, query, onHover, onRun }: ListProps) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
  }, [at]);
  let lastGroup = "";
  return (
    <div className="sk-pal__list" ref={list}>
      {shown.length === 0 ? (
        <div className="sk-pal__empty">No results for “{query}”</div>
      ) : (
        <Menu id="pal-list" role="listbox">
          {shown.map((c, i) => {
            const head = c.group !== lastGroup;
            lastGroup = c.group;
            return (
              <div key={c.id} style={{ display: "contents" }}>
                {head ? <MenuGroupLabel>{c.group}</MenuGroupLabel> : null}
                <MenuItem
                  id={`pal-${c.id}`}
                  role="option"
                  aria-selected={i === at}
                  icon={c.icon}
                  shortcut={i === at ? "Enter" : c.hint}
                  className={i === at ? "is-active" : undefined}
                  tabIndex={-1}
                  onMouseMove={() => onHover(i)}
                  onSelect={() => onRun(c)}
                >
                  {c.title}
                </MenuItem>
              </div>
            );
          })}
        </Menu>
      )}
    </div>
  );
}

/** Command palette. Ctrl K or the title-bar search opens it. */
export function Palette({ onRun, onClose }: { onRun: (c: Command) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const shown = useMatches(q);
  useEffect(() => setAt(0), [q]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (shown.length) setAt((at + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = shown[at];
      if (c) onRun(c);
    }
  };

  return (
    <div className="sk-pal" onKeyDown={onKey} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sk-pal__box" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="sk-pal__in">
          <Icon name="search" size={18} />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="pal-list"
            aria-activedescendant={shown[at] ? `pal-${shown[at]!.id}` : undefined}
            aria-label="Search readings, voices and commands"
            placeholder="Search readings, voices and commands"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Kbd small>Esc</Kbd>
        </div>
        <PaletteList shown={shown} at={at} query={q} onHover={setAt} onRun={onRun} />
        <div className="sk-pal__foot">
          <span>↑↓ move</span>
          <span>Enter run</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  );
}
