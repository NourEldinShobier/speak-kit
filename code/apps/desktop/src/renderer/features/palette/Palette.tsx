import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Icon, Kbd } from "@speakkit/ui";
import type { Voice } from "@speakkit/protocol";
import type { DocMeta } from "../../../shared/library/contract";
import { buildCommands, paletteView, rememberCommand, type Command } from "./model";
import { useT } from "../../i18n";
import { api } from "../../ui";

const RECENT_KEY = "speakkit.palette-recent";
const loadRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 3) : [];
  } catch {
    return [];
  }
};
const saveRecent = (ids: string[]) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids));
  } catch {
    /* private mode: the recent list is just not remembered */
  }
};

/** Voices from the server and readings from the library, fetched once when the palette opens; a failed call leaves that group empty. */
function useSources(): { voices: Voice[]; docs: DocMeta[] } {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [docs, setDocs] = useState<DocMeta[]>([]);
  useEffect(() => {
    api.voices().then(
      (v) => setVoices(v.voices),
      () => {},
    );
    window.speakkitLibrary?.list().then(setDocs, () => {});
  }, []);
  return { voices, docs };
}

const escapeRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The title with the query words in bold. */
function Marked({ text, query }: { text: string; query: string }) {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.map(escapeRe).join("|")})`, "i"));
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{i % 2 ? <b>{p}</b> : p}</Fragment>
      ))}
    </>
  );
}

interface RowProps {
  c: Command;
  active: boolean;
  query: string;
  onHover(): void;
  onRun(): void;
}

function Row({ c, active, query, onHover, onRun }: RowProps) {
  return (
    <div id={`pal-${c.id}`} role="option" aria-selected={active} className={`sk-pal__row${active ? " is-active" : ""}`} onMouseMove={onHover} onClick={onRun}>
      <Icon name={c.icon} size={16} />
      <span className="sk-pal__title">
        <Marked text={c.title} query={query} />
      </span>
      {c.hint && <span className="sk-pal__hint">{c.hint}</span>}
    </div>
  );
}

/** The best match with what it will do, before anything runs. */
function BestCard({ c, active, onHover, onRun }: Omit<RowProps, "query">) {
  const { t } = useT();
  return (
    <div id={`pal-${c.id}`} role="option" aria-selected={active} className={`sk-pal__best${active ? " is-active" : ""}`} onMouseMove={onHover} onClick={onRun}>
      <span className="sk-pal__tile">
        <Icon name={c.icon} size={16} />
      </span>
      <span className="sk-pal__what">
        <b>{c.title}</b>
        <span>{c.does}</span>
      </span>
      <span className="sk-pal__run">
        {t("pal.run")} <Kbd small>Enter</Kbd>
      </span>
    </div>
  );
}

function NoResults({ query, suggestions, onRun }: { query: string; suggestions: Command[]; onRun(c: Command): void }) {
  const { t } = useT();
  return (
    <div className="sk-pal__empty" role="status">
      <Icon name="search" size={22} />
      <b>{t("pal.none", { query: query.trim() })}</b>
      <span>{t("pal.noneHint")}</span>
      <div className="sk-pal__chips">
        {suggestions.map((c) => (
          <button key={c.id} type="button" className="sk-pal__chip" onClick={() => onRun(c)}>
            {c.title}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The query, the highlighted row, the recent list and the keys that drive them. */
function usePalette(onRun: (c: Command) => void, onClose: () => void) {
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const [recent, setRecent] = useState(loadRecent);
  const { voices, docs } = useSources();
  const tr = useT();
  const all = useMemo(() => buildCommands(voices, docs, tr), [voices, docs, tr]);
  const view = useMemo(() => paletteView(all, q, recent), [all, q, recent]);
  const suggestions = useMemo(() => all.filter((c) => c.id === "page-dictation" || c.id === "export" || (voices[0] && c.id === `v-${voices[0].id}`)), [all, voices]);
  const flat = view.flat;
  useEffect(() => setAt(0), [q]);

  const run = (c: Command) => {
    const next = rememberCommand(recent, c.id);
    setRecent(next);
    saveRecent(next);
    onRun(c);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (flat.length) setAt((at + (e.key === "ArrowDown" ? 1 : -1) + flat.length) % flat.length);
    } else if (e.key === "Tab") {
      // aria-modal: Tab cycles inside the dialog instead of reaching the page behind it.
      const f = [...e.currentTarget.querySelectorAll<HTMLElement>("input, button")];
      const i = f.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = flat[at];
      if (c) run(c);
    }
  };
  return { q, setQ, at, setAt, view, suggestions, run, onKey, active: flat[at] };
}

function Results({ p }: { p: ReturnType<typeof usePalette> }) {
  const list = useRef<HTMLDivElement>(null);
  const { view, at, q } = p;
  const { t, label } = useT();
  const group = (name: string) => label(`pal.group.${name}`, name);
  useEffect(() => {
    list.current?.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
  }, [at, view]);
  const rowProps = (c: Command) => {
    const i = view.flat.indexOf(c);
    return { c, active: i === at, onHover: () => p.setAt(i), onRun: () => p.run(c) };
  };
  return (
    <div className="sk-pal__list" id="pal-list" role="listbox" aria-label={t("pal.results")} ref={list}>
      {view.best && (
        <div className="sk-pal__group" role="group" aria-label={t("pal.bestMatch")}>
          <div className="sk-pal__label">{t("pal.bestMatch")}</div>
          <BestCard {...rowProps(view.best)} />
        </div>
      )}
      {view.sections.map((sec) => (
        <div key={sec.label} className="sk-pal__group" role="group" aria-label={group(sec.label)}>
          <div className="sk-pal__label">{group(sec.label)}</div>
          {sec.items.map((c) => (
            <Row key={c.id} {...rowProps(c)} query={q} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Footer({ count }: { count: number | null }) {
  const { t } = useT();
  return (
    <div className="sk-pal__foot">
      <span>
        <Kbd small>↑</Kbd> <Kbd small>↓</Kbd> {t("pal.move")}
      </span>
      <span>
        <Kbd small>Enter</Kbd> {t("pal.run")}
      </span>
      <span>
        <Kbd small>Esc</Kbd> {t("pal.close")}
      </span>
      {count !== null && <span className="sk-pal__count">{t("pal.count", { n: count })}</span>}
    </div>
  );
}

/** Command palette. Ctrl K or the title-bar search opens it. */
export function Palette({ onRun, onClose }: { onRun: (c: Command) => void; onClose: () => void }) {
  const p = usePalette(onRun, onClose);
  const { t } = useT();
  // Escape works wherever focus is, e.g. after a click on the backdrop moved it out of the dialog.
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && onClose();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [onClose]);
  const searching = p.q.trim() !== "";
  const count = p.view.flat.length;
  return (
    <div className="sk-pal" onKeyDown={p.onKey} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sk-pal__box" role="dialog" aria-modal="true" aria-label={t("pal.dialog")}>
        <div className="sk-pal__in">
          <Icon name="search" size={18} />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="pal-list"
            aria-activedescendant={p.active ? `pal-${p.active.id}` : undefined}
            aria-label={t("pal.input")}
            placeholder={t("pal.input")}
            value={p.q}
            onChange={(e) => p.setQ(e.target.value)}
          />
          {searching ? (
            <button type="button" className="sk-pal__clear" onClick={() => p.setQ("")}>
              {t("pal.clear")}
            </button>
          ) : (
            <Kbd small>Esc</Kbd>
          )}
        </div>
        {searching && count === 0 ? <NoResults query={p.q} suggestions={p.suggestions} onRun={p.run} /> : <Results p={p} />}
        <Footer count={searching ? count : null} />
      </div>
    </div>
  );
}
