import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HistoryStats } from "@speakkit/dictation";
import { DropdownMenu, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, IconButton } from "@speakkit/ui";
import type { DictationStatus, HistoryItem } from "../../../shared/dictation/contract";
import { Page } from "../../ui";
import { dictation } from "./api";
import { ClearDialog, RecordingsDialog } from "./HistoryDialogs";
import { CopyRecent, Empty, Notices, Stats, Toolbar } from "./HistoryParts";
import { HistoryRow, type View } from "./HistoryRow";
import { expiryText, focusAfterDelete, groupByDay, historyFooter, historyLead, RETENTION_OPTIONS } from "./model";
import { RecordingPanel } from "./RecordingPanel";
import { useDictation } from "./useDictation";
import "./dictation.css";

export { HistoryRow };

const THEAD = ["Time and app", "What the model heard", "What was pasted", ""];

type DayProps = {
  g: { label: string; items: HistoryItem[] };
  view: View;
  s: DictationStatus;
  copied: string | null;
  open: string | null;
  setOpen: (f: (o: string | null) => string | null) => void;
  copy: (id: string) => void;
  remove: (id: string) => void;
  openDictation: () => void;
};

function Day({ g, view, s, copied, open, setOpen, copy, remove, openDictation }: DayProps) {
  return (
    <section className="dict-hist__group">
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
              onCopy={() => copy(item.id)}
              onDelete={() => remove(item.id)}
            />
            {open === item.id && item.recording ? <RecordingPanel item={item} s={s} kept={expiryText(item.expiresInMs, "Kept for")} openDictation={openDictation} /> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Moves focus once the list has reloaded after a delete: to an entry id, or null for the page's own controls. */
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

/** The entries, newest first, in day groups; `copied` is the entry whose text was just copied. */
function Groups({ items, load, view, s, openDictation }: { items: HistoryItem[]; load: () => void; view: View; s: DictationStatus; openDictation: () => void }) {
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
    <Day key={g.label} g={g} view={view} s={s} copied={copied} open={open} setOpen={setOpen} openDictation={openDictation} copy={(id) => void copy(id)} remove={(id) => void remove(id)} />
  ));
}

function HistoryMenu({ s, total, onRecordings, onClear }: { s: DictationStatus | null; total: number; onRecordings: () => void; onClear: () => void }) {
  const retention = s?.settings.retention ?? "7d";
  return (
    <DropdownMenu trigger={<IconButton name="dots" label="More history actions" variant="secondary" />}>
      <DropdownMenuItem icon="copy" disabled={total === 0} onSelect={() => void dictation.historyRecent(5).then((r) => r.forEach((i) => void dictation.historyCopy(i.id)))}>
        Copy last five
      </DropdownMenuItem>
      <DropdownMenuItem icon="download" disabled={total === 0} onSelect={() => void dictation.historyExport()}>
        Export history
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Keep entries for</DropdownMenuLabel>
      {RETENTION_OPTIONS.map((o) => (
        <DropdownMenuItem key={o.value} selected={o.value === retention} onSelect={() => void dictation.patchSettings({ retention: o.value })}>
          {o.label}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem icon="microphone" onSelect={onRecordings}>
        Keep recordings ({s?.settings.keepRecordings ? "on" : "off"})
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon="trash" destructive disabled={total === 0} onSelect={onClear}>
        Clear all history
      </DropdownMenuItem>
    </DropdownMenu>
  );
}

function Body({ s, items, total, load, view, openDictation }: { s: DictationStatus | null; items: HistoryItem[] | null; total: number; load: () => void; view: View; openDictation: () => void }) {
  if (total === 0) return <Empty s={s} />;
  if (!s) return null;
  return (
    <>
      <Groups items={items ?? []} load={load} view={view} s={s} openDictation={openDictation} />
      {items?.length === 0 && <p className="dict-hist__none">Nothing matches that search.</p>}
      <p className="dict-hist__foot">{historyFooter(items?.length ?? 0, total, s.settings.retention)}</p>
    </>
  );
}

/** The list and the totals, loaded again whenever the search, the count or the history revision changes. */
function useHistoryData(s: DictationStatus | null, search: string) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const total = s?.historyCount ?? 0;
  const rev = s?.historyRev ?? 0;
  const load = useCallback(() => {
    void dictation.historyList(search.trim() || undefined).then(setItems);
    void dictation.historyStats().then(setStats);
  }, [search]);
  useEffect(load, [load, total, rev]);
  return { items, setItems, stats, load, total };
}

/** History: what was dictated, searchable, with the raw text beside the final one, copy, retention and kept recordings. */
export function DictationHistoryPage({ openDictation }: { openDictation: () => void }) {
  const s = useDictation();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("final");
  const [asking, setAsking] = useState(false);
  const [recordings, setRecordings] = useState(false);
  const { items, setItems, stats, load, total } = useHistoryData(s, search);
  const retention = s?.settings.retention ?? "7d";
  return (
    <Page
      title="History"
      lead={historyLead(retention)}
      action={
        <div className="dict-hist__head-acts">
          <CopyRecent disabled={total === 0} />
          <HistoryMenu s={s} total={total} onRecordings={() => setRecordings(true)} onClear={() => setAsking(true)} />
        </div>
      }
    >
      {s ? <Notices s={s} /> : null}
      {total > 0 ? <Stats stats={stats} retention={retention} /> : null}
      <Toolbar search={search} setSearch={setSearch} view={view} setView={setView} empty={total === 0} />
      <Body s={s} items={items} total={total} load={load} view={view} openDictation={openDictation} />
      <ClearDialog
        open={asking}
        count={total}
        onClose={() => setAsking(false)}
        onConfirm={async () => {
          await dictation.historyClear();
          setAsking(false);
          setItems([]);
        }}
      />
      <RecordingsDialog open={recordings} on={s?.settings.keepRecordings ?? false} onClose={() => setRecordings(false)} />
    </Page>
  );
}
