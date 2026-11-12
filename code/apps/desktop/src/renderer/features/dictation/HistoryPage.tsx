import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, Icon, Kbd } from "@speakkit/ui";
import type { DictationStatus, HistoryItem } from "../../../shared/dictation/contract";
import { DEFAULT_HOTKEY, hotkeyLabels } from "../../../shared/dictation/keys";
import { dictation, platformName } from "./api";
import { emptyHint, expiryText, focusAfterDelete, groupByDay, historyFooter, historyLead, toggled } from "./model";
import { HistoryDialogs, type HistoryDialog } from "./HistoryDialogs";
import { Notices } from "./HistoryParts";
import { HistoryRow, type View } from "./HistoryRow";
import { Toolbar } from "./HistoryToolbar";
import { RecordingPanel } from "./RecordingPanel";
import { useDictation } from "./useDictation";
import "./dictation.css";

export { HistoryRow };

const THEAD = ["Time and app", "What the model heard", "What was pasted", ""];

function Empty({ s }: { s: DictationStatus | null }) {
  return (
    <div className="lm-card">
      <EmptyState icon="microphone" title="Nothing dictated yet">
        {emptyHint(s?.settings.retention ?? "7d")}
        <div className="dict-keys">
          {hotkeyLabels(s?.settings.hotkey ?? DEFAULT_HOTKEY, platformName()).map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </div>
      </EmptyState>
    </div>
  );
}

/** Moves focus once the list has reloaded after a delete: to an entry id, or null for the page controls. */
function useFocusAfterReload(items: HistoryItem[]) {
  const focusNext = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const id = focusNext.current;
    if (id === undefined) return;
    focusNext.current = undefined;
    const target = id ? document.querySelector(`[data-row="${CSS.escape(id)}"] button`) : (document.querySelector(".dict-hist__bar input:not(:disabled)") ?? document.querySelector("h1"));
    (target as HTMLElement | null)?.focus();
  }, [items]);
  return focusNext;
}

type GroupsProps = {
  items: HistoryItem[];
  load: () => void;
  view: View;
  s: DictationStatus;
  picked: ReadonlySet<string> | null;
  toggle: (id: string) => void;
  openSettings: () => void;
};

/** The entries, newest first, in day groups; `copied` is the entry whose text was just copied. */
function Groups({ items, load, view, s, picked, toggle, openSettings }: GroupsProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => groupByDay(items, Date.now()), [items]);
  const focusNext = useFocusAfterReload(items);
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
      <div className={`lm-card${view === "side" ? " dict-hist__side" : ""}`}>
        {view === "side" ? (
          <div className="dict-hist__thead" aria-hidden="true">
            {THEAD.map((h, i) => (
              <span key={i}>{h}</span>
            ))}
          </div>
        ) : null}
        {g.items.map((item) => (
          <div key={item.id}>
            <HistoryRow
              item={item}
              view={view}
              copied={copied === item.id}
              open={open === item.id}
              rewriteDeadlineMs={s.settings.rewrite.deadlineMs}
              onToggle={() => setOpen((o) => (o === item.id ? null : item.id))}
              onCopy={() => void copy(item.id)}
              onDelete={() => void remove(item.id)}
              {...(picked && { selection: { checked: picked.has(item.id), toggle: () => toggle(item.id) } })}
            />
            {open === item.id && item.recording ? <RecordingPanel item={item} s={s} kept={expiryText(item.expiresInMs, "Kept for")} openDictation={openSettings} /> : null}
          </div>
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

/** The entries matching the search, reloaded when the search, the number of entries or the history revision changes. */
function useItems(search: string, total: number, rev: number) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const load = useCallback(() => void dictation.historyList(search.trim() || undefined).then(setItems), [search]);
  useEffect(load, [load, total, rev]);
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

/** The entries with the notes under them, or the empty state when nothing was dictated yet. */
function Entries(p: {
  s: DictationStatus | null;
  items: HistoryItem[] | null;
  load: () => void;
  sel: ReturnType<typeof useSelection>;
  view: View;
  total: number;
  retention: DictationStatus["settings"]["retention"];
  openSettings: () => void;
}) {
  if (p.total === 0) return <Empty s={p.s} />;
  if (!p.s) return null;
  return (
    <>
      <Groups items={p.items ?? []} load={p.load} view={p.view} s={p.s} picked={p.sel.picked} toggle={p.sel.toggle} openSettings={p.openSettings} />
      {p.items?.length === 0 && <p className="dict-hist__none">Nothing matches that search.</p>}
      <p className="dict-hist__foot">{historyFooter(p.items?.length ?? 0, p.total, p.retention)}</p>
    </>
  );
}

/** The sentence under the History title for the dictation tab (how long entries are kept). */
export async function historyLeadNow(): Promise<string> {
  return historyLead((await dictation.status()).settings.retention);
}

/** The numbers the page reads from the status: how many entries, which retention, whether recordings are kept, and the revision that reloads the list. */
function useHistoryNumbers(s: DictationStatus | null) {
  return { total: s?.historyCount ?? 0, rev: s?.historyRev ?? 0, retention: s?.settings.retention ?? "7d", keepRecordings: s?.settings.keepRecordings ?? false, audioCapMb: s?.settings.audioCapMb ?? 512 };
}

/**
 * History > Dictations: what was dictated, searchable, with the raw text beside the final one, copy, delete, bulk delete, statistics, retention and kept
 * recordings. `embedded` leaves out the back link and the title: History puts the page under its own tabs.
 */
export function DictationHistoryPage({ back, embedded, openSettings }: { back?: () => void; embedded?: boolean; openSettings?: () => void }) {
  const s = useDictation();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("final");
  const [dialog, setDialog] = useState<HistoryDialog>(null);
  const { total, rev, retention, keepRecordings, audioCapMb } = useHistoryNumbers(s);
  const { items, setItems, load } = useItems(search, total, rev);
  const sel = useSelection(items);
  const changed = (cleared: boolean) => {
    if (cleared) return setItems([]);
    sel.setPicked(new Set());
    load();
  };
  return (
    <div className={embedded ? "dict-hist dict-hist--embedded" : "sk-page dict-hist"}>
      {embedded || !back ? null : <Head back={back} retention={retention} />}
      {s ? <Notices s={s} /> : null}
      <Toolbar
        search={search}
        setSearch={setSearch}
        view={view}
        setView={setView}
        empty={total === 0}
        retention={retention}
        keepRecordings={keepRecordings}
        onClear={() => setDialog("clear")}
        onStats={() => setDialog("stats")}
        onRecordings={() => setDialog("recordings")}
        picked={sel.picked}
        shown={items?.length ?? 0}
        setSelecting={sel.setSelecting}
        selectAll={sel.selectAll}
        onDeleteSelected={() => setDialog("delete")}
      />
      <Entries s={s} items={items} load={load} sel={sel} view={view} total={total} retention={retention} openSettings={openSettings ?? back ?? (() => undefined)} />
      <HistoryDialogs dialog={dialog} close={() => setDialog(null)} total={total} picked={sel.picked} keepRecordings={keepRecordings} audioCapMb={audioCapMb} onChanged={changed} />
    </div>
  );
}
