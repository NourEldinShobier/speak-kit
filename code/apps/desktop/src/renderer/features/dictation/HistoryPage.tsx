import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Checkbox, EmptyState, Icon, Kbd } from "@speakkit/ui";
import type { DictationStatus, HistoryItem } from "../../../shared/dictation/contract";
import { hotkeyLabels } from "../../../shared/dictation/keys";
import { dictation } from "./api";
import { emptyHint, entryLabel, focusAfterDelete, groupByDay, historyFooter, historyLead, rowApp, rowTags, timeText, toggled } from "./model";
import { HistoryDialogs, type HistoryDialog } from "./HistoryDialogs";
import { Toolbar } from "./HistoryToolbar";
import { useDictation } from "./useDictation";
import "./dictation.css";

/** Selection mode of a row: whether it is ticked and how to tick it. */
interface Selection {
  checked: boolean;
  toggle: () => void;
}

/** One entry. Both buttons stay in place after a copy (focus stays on the button); the live region announces it. Names carry the entry's words. */
export function HistoryRow({ item, copied, onCopy, onDelete, selection }: { item: HistoryItem; copied: boolean; onCopy: () => void; onDelete: () => void; selection?: Selection }) {
  const label = entryLabel(item.text);
  const tags = rowTags(item);
  return (
    <div className="lm-row dict-hist__row" data-testid="history-row" data-row={item.id}>
      {selection && <Checkbox aria-label={`Select: ${label}`} checked={selection.checked} onChange={selection.toggle} />}
      <div className="dict-hist__when">
        <span>{timeText(item.at)}</span>
        <span className="dict-hist__app">{rowApp(item)}</span>
      </div>
      <p className="dict-hist__text">
        {item.text}
        {tags.map((t) => (
          <Badge key={t} className="dict-hist__tag">
            {t}
          </Badge>
        ))}
      </p>
      <div className="dict-hist__acts" data-copied={copied || undefined}>
        <button type="button" className="lm-btn lm-btn--icon lm-btn--secondary" aria-label={`Copy: ${label}`} onClick={onCopy}>
          <Icon name={copied ? "check" : "copy"} size={14} />
        </button>
        <button type="button" className="lm-btn lm-btn--icon lm-btn--secondary" aria-label={`Delete: ${label}`} onClick={onDelete}>
          <Icon name="trash" size={14} />
        </button>
        <span className="dict-hist__sr" role="status">
          {copied ? "Copied" : ""}
        </span>
      </div>
    </div>
  );
}

function Empty({ s }: { s: DictationStatus | null }) {
  return (
    <div className="lm-card">
      <EmptyState icon="microphone" title="Nothing dictated yet">
        {emptyHint(s?.settings.retention ?? "7d")}
        <div className="dict-keys">
          {hotkeyLabels(s?.settings.hotkey ?? "ControlRight").map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </div>
      </EmptyState>
    </div>
  );
}

/** The history entries, newest first, in day groups; `copied` is the entry whose text was just copied. */
function Groups({ items, load, picked, toggle }: { items: HistoryItem[]; load: () => void; picked: ReadonlySet<string> | null; toggle: (id: string) => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const groups = useMemo(() => groupByDay(items, Date.now()), [items]);
  // Where focus goes once the list has reloaded after a delete: an entry id, or null for the page's own controls.
  const focusNext = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const id = focusNext.current;
    if (id === undefined) return;
    focusNext.current = undefined;
    const target = id ? document.querySelector(`[data-row="${CSS.escape(id)}"] button`) : (document.querySelector(".dict-hist__bar input:not(:disabled)") ?? document.querySelector(".dict-back"));
    (target as HTMLElement | null)?.focus();
  }, [items]);
  const copy = async (id: string) => {
    if (!(await dictation.historyCopy(id))) return;
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
  };
  const remove = async (id: string) => {
    focusNext.current =
      focusAfterDelete(
        items.map((i) => i.id),
        id,
      ) ?? null;
    await dictation.historyRemove(id);
    load();
  };
  return groups.map((g) => (
    <section key={g.label} className="dict-hist__group">
      <h3 className="dict-hist__day">{g.label}</h3>
      <div className="lm-card">
        {g.items.map((item) => (
          <HistoryRow
            key={item.id}
            item={item}
            copied={copied === item.id}
            onCopy={() => void copy(item.id)}
            onDelete={() => void remove(item.id)}
            {...(picked && { selection: { checked: picked.has(item.id), toggle: () => toggle(item.id) } })}
          />
        ))}
      </div>
    </section>
  ));
}

function Head({ back, retention }: { back: () => void; retention: DictationStatus["settings"]["retention"] }) {
  return (
    <>
      <button type="button" className="dict-back" onClick={back}>
        <Icon name="arrow-left" size={12} /> Dictation
      </button>
      <div className="sk-page__head">
        <h1>Dictation history</h1>
        <p>{historyLead(retention)}</p>
      </div>
    </>
  );
}

/** The entries matching the search, reloaded when the search or the number of entries changes. */
function useItems(search: string, total: number) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const load = useCallback(() => void dictation.historyList(search.trim() || undefined).then(setItems), [search]);
  useEffect(load, [load, total]);
  return { items, setItems, load };
}

/** Which entries are ticked while selecting; null when selection is off. */
function useSelection(items: HistoryItem[] | null) {
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null);
  return {
    picked,
    setPicked,
    setSelecting: (on: boolean) => setPicked(on ? new Set() : null),
    selectAll: () => setPicked(new Set((items ?? []).map((i) => i.id))),
    toggle: (id: string) => setPicked((p) => toggled(p, id)),
  };
}

/** Settings > Dictation > history: what was dictated, searchable, with copy, delete, bulk delete, statistics and clear all. */
export function DictationHistoryPage({ back }: { back: () => void }) {
  const s = useDictation();
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<HistoryDialog>(null);
  const total = s?.historyCount ?? 0;
  const retention = s?.settings.retention ?? "7d";
  const { items, setItems, load } = useItems(search, total);
  const sel = useSelection(items);
  const close = () => setDialog(null);
  return (
    <div className="sk-page dict-hist">
      <Head back={back} retention={retention} />
      <Toolbar
        search={search}
        setSearch={setSearch}
        empty={total === 0}
        onClear={() => setDialog("clear")}
        onStats={() => setDialog("stats")}
        picked={sel.picked}
        shown={items?.length ?? 0}
        setSelecting={sel.setSelecting}
        selectAll={sel.selectAll}
        onDeleteSelected={() => setDialog("delete")}
      />
      {total === 0 ? (
        <Empty s={s} />
      ) : (
        <>
          <Groups items={items ?? []} load={load} picked={sel.picked} toggle={sel.toggle} />
          {items?.length === 0 && <p className="dict-hist__none">Nothing matches that search.</p>}
          <p className="dict-hist__foot">{historyFooter(items?.length ?? 0, total, retention)}</p>
        </>
      )}
      <HistoryDialogs
        dialog={dialog}
        close={close}
        total={total}
        picked={sel.picked}
        onChanged={(cleared) => {
          if (cleared) setItems([]);
          else {
            sel.setPicked(new Set());
            load();
          }
        }}
      />
    </div>
  );
}
