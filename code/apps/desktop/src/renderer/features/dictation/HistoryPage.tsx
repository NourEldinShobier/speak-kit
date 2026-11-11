import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, EmptyState, Icon, Kbd, Modal, TextInput } from "@speakkit/ui";
import type { DictationStatus, HistoryItem } from "../../../shared/dictation/contract";
import { hotkeyLabels } from "../../../shared/dictation/keys";
import { dictation } from "./api";
import { appName, emptyHint, groupByDay, historyFooter, historyLead, timeText } from "./model";
import { useDictation } from "./useDictation";
import "./dictation.css";

function Row({ item, copied, onCopy, onDelete }: { item: HistoryItem; copied: boolean; onCopy: () => void; onDelete: () => void }) {
  return (
    <div className="lm-row dict-hist__row" data-testid="history-row">
      <div className="dict-hist__when">
        <span>{timeText(item.at)}</span>
        <span className="dict-hist__app">{appName(item.app)}</span>
      </div>
      <p className="dict-hist__text">{item.text}</p>
      <div className="dict-hist__acts">
        {copied ? (
          <span className="dict-hist__copied">
            <Icon name="check" size={14} /> Copied
          </span>
        ) : (
          <>
            <button type="button" className="lm-btn lm-btn--icon lm-btn--secondary" aria-label="Copy" onClick={onCopy}>
              <Icon name="copy" size={14} />
            </button>
            <button type="button" className="lm-btn lm-btn--icon lm-btn--secondary" aria-label="Delete" onClick={onDelete}>
              <Icon name="trash" size={14} />
            </button>
          </>
        )}
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

function ClearDialog({ open, count, onClose, onConfirm }: { open: boolean; count: number; onClose: () => void; onConfirm: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Clear all dictation history?"
      width={400}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>
            Clear history
          </Button>
        </>
      }
    >
      <p className="sk-modal-text" style={{ margin: 0 }}>
        This deletes {count} {count === 1 ? "entry" : "entries"} from this computer. It does not change text already typed into other apps. You cannot undo it.
      </p>
    </Modal>
  );
}

/** The history entries, newest first, in day groups; `copied` is the entry whose text was just copied. */
function Groups({ items, load }: { items: HistoryItem[]; load: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const groups = useMemo(() => groupByDay(items, Date.now()), [items]);
  const copy = async (id: string) => {
    if (!(await dictation.historyCopy(id))) return;
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
  };
  const remove = async (id: string) => {
    await dictation.historyRemove(id);
    load();
  };
  return groups.map((g) => (
    <section key={g.label} className="dict-hist__group">
      <h3 className="dict-hist__day">{g.label}</h3>
      <div className="lm-card">
        {g.items.map((item) => (
          <Row key={item.id} item={item} copied={copied === item.id} onCopy={() => void copy(item.id)} onDelete={() => void remove(item.id)} />
        ))}
      </div>
    </section>
  ));
}

function Toolbar({ search, setSearch, empty, onClear }: { search: string; setSearch: (s: string) => void; empty: boolean; onClear: () => void }) {
  return (
    <div className="dict-hist__bar">
      <TextInput
        icon="search"
        aria-label="Search what you dictated"
        placeholder="Search what you dictated"
        value={search}
        disabled={empty}
        onChange={(e) => setSearch(e.target.value)}
        frameClassName="dict-hist__search"
      />
      <Button className="dict-clear" disabled={empty} onClick={onClear}>
        Clear all
      </Button>
    </div>
  );
}

/** Settings > Dictation > history: what was dictated, searchable, with copy, delete and clear all. */
export function DictationHistoryPage({ back }: { back: () => void }) {
  const s = useDictation();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [search, setSearch] = useState("");
  const [asking, setAsking] = useState(false);
  const total = s?.historyCount ?? 0;
  const retention = s?.settings.retention ?? "7d";
  const load = useCallback(() => void dictation.historyList(search.trim() || undefined).then(setItems), [search]);
  useEffect(load, [load, total]);

  return (
    <div className="sk-page dict-hist">
      <button type="button" className="dict-back" onClick={back}>
        <Icon name="arrow-left" size={12} /> Dictation
      </button>
      <div className="sk-page__head">
        <h1>Dictation history</h1>
        <p>{historyLead(retention)}</p>
      </div>
      <Toolbar search={search} setSearch={setSearch} empty={total === 0} onClear={() => setAsking(true)} />
      {total === 0 ? (
        <Empty s={s} />
      ) : (
        <>
          <Groups items={items ?? []} load={load} />
          {items?.length === 0 && <p className="dict-hist__none">Nothing matches that search.</p>}
          <p className="dict-hist__foot">{historyFooter(items?.length ?? 0, total, retention)}</p>
        </>
      )}
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
    </div>
  );
}
