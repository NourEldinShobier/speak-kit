import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HistoryStats } from "@speakkit/dictation";
import {
  Banner,
  Button,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  EmptyState,
  Icon,
  IconButton,
  Kbd,
  Modal,
  Popover,
  Segmented,
  TextInput,
  Toggle,
} from "@speakkit/ui";
import type { DictationStatus, HistoryItem } from "../../../shared/dictation/contract";
import { hotkeyLabels } from "../../../shared/dictation/keys";
import { api, Page } from "../../ui";
import { dictation } from "./api";
import {
  appName,
  clockText,
  emptyHint,
  entryLabel,
  expiryText,
  focusAfterDelete,
  groupByDay,
  historyFooter,
  historyLead,
  listeningText,
  markChanges,
  numberText,
  RETENTION_OPTIONS,
  rewriteTag,
  timeText,
} from "./model";
import { RecordingPanel } from "./RecordingPanel";
import { useDictation } from "./useDictation";
import "./dictation.css";

type View = "final" | "side";

function Marked({ words }: { words: { text: string; changed: boolean }[] }) {
  return (
    <>
      {words.map((w, i) => (
        <span key={i}>
          {w.changed ? <mark className="dict-hist__mark">{w.text}</mark> : w.text}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

/** One entry. Both buttons stay in place after a copy (focus stays on the button); the live region announces it. Names carry the entry's words. */
export function HistoryRow({
  item,
  copied,
  onCopy,
  onDelete,
  view = "final",
  open,
  onToggle,
  rewriteDeadlineMs = 4000,
}: {
  item: HistoryItem;
  copied: boolean;
  onCopy: () => void;
  onDelete: () => void;
  view?: View;
  open?: boolean;
  onToggle?: () => void;
  rewriteDeadlineMs?: number;
}) {
  const label = entryLabel(item.text);
  const tag = rewriteTag(item.rewrite, rewriteDeadlineMs);
  const marks = view === "side" ? markChanges(item.raw, item.text) : undefined;
  return (
    <div className={`lm-row dict-hist__row${view === "side" ? " dict-hist__row--side" : ""}`} data-testid="history-row" data-row={item.id}>
      <div className="dict-hist__when">
        <span>{timeText(item.at)}</span>
        <span className="dict-hist__app">{appName(item.app)}</span>
        {item.recording && onToggle ? (
          <button type="button" className="dict-hist__rec" aria-expanded={open} aria-label={`Recording of: ${label}`} onClick={onToggle}>
            <Icon name="player-play" size={10} /> {clockText(item.durationMs)}
            <Icon name={open ? "chevron-up" : "chevron-down"} size={10} />
          </button>
        ) : null}
      </div>
      {marks ? (
        <>
          <p className="dict-hist__text dict-hist__text--raw">
            <Marked words={marks.heard} />
          </p>
          <p className="dict-hist__text">
            <Marked words={marks.pasted} />
          </p>
        </>
      ) : (
        <div className="dict-hist__body">
          <p className="dict-hist__text">{item.text}</p>
          <p className="dict-hist__meta">
            <span>{expiryText(item.expiresInMs)}</span>
            {item.recording ? <span>Recording kept</span> : null}
            {item.recordingRemoved ? <span>Recording removed to stay under the limit</span> : null}
            {tag ? <span className="dict-hist__tag">{tag}</span> : null}
            {item.via ? (
              <span className="dict-hist__tag">
                Matched &ldquo;{item.via.heard}&rdquo; from your Vocabulary entry {item.via.word}
              </span>
            ) : null}
          </p>
        </div>
      )}
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
        This deletes {count} {count === 1 ? "entry" : "entries"} from this computer, and the recordings kept with them. It does not change text already typed into other apps. You cannot undo it.
      </p>
    </Modal>
  );
}

function RecordingsDialog({ open, on, onClose }: { open: boolean; on: boolean; onClose: () => void }) {
  const [value, setValue] = useState(on);
  useEffect(() => {
    if (open) setValue(on);
  }, [open, on]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Keep recordings"
      width={440}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              void dictation.patchSettings({ keepRecordings: value });
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="dict-keep">
        <label className="dict-keep__row">
          <span>Keep the audio of each dictation</span>
          <Toggle aria-label="Keep the audio of each dictation" checked={value} onChange={setValue} />
        </label>
        <ul className="dict-keep__list">
          <li>Off until you turn it on.</li>
          <li>Recordings use up to 512 MB. The oldest are removed first, and their entries keep the text.</li>
          <li>A recording is deleted with its entry.</li>
          <li>Nothing leaves this computer.</li>
        </ul>
      </div>
    </Modal>
  );
}

/** The numbers above the list. */
function Stats({ stats, retention }: { stats: HistoryStats | null; retention: DictationStatus["settings"]["retention"] }) {
  const title = retention === "forever" ? "All time" : retention === "off" ? "Now" : `Last ${RETENTION_OPTIONS.find((o) => o.value === retention)?.label.toLowerCase()}`;
  const cells: [string, string][] = stats
    ? [
        ["Dictations", numberText(stats.dictations)],
        ["Words", numberText(stats.words)],
        ["Words per minute", numberText(stats.wordsPerMinute)],
        ["Listening time", listeningText(stats.listeningMs)],
      ]
    : [];
  return (
    <section aria-label="Totals" className="dict-stats">
      <h3 className="dict-stats__title">{title}</h3>
      <dl className="dict-stats__grid">
        {cells.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The last five dictations, each with its own Copy; the text goes on the clipboard and the button says so. */
function CopyRecent({ disabled }: { disabled: boolean }) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <Popover
      title="Copy recent"
      width={380}
      align="end"
      onOpenChange={(o) => o && void dictation.historyRecent(5).then(setItems)}
      trigger={(p) => (
        <Button {...p} iconLeft="copy" iconRight="chevron-down" disabled={disabled}>
          Copy recent
        </Button>
      )}
    >
      {items.length === 0 ? (
        <p className="vocab-empty-line">Nothing to copy yet.</p>
      ) : (
        <ul className="dict-recent" aria-label="Recent dictations">
          {items.map((i) => (
            <li key={i.id}>
              <span className="dict-recent__text">
                <b>{timeText(i.at)}</b> {entryLabel(i.text, 70)}
              </span>
              <Button
                size="sm"
                aria-label={`Copy: ${entryLabel(i.text)}`}
                onClick={() =>
                  void dictation.historyCopy(i.id).then((ok) => {
                    if (!ok) return;
                    setCopied(i.id);
                    setTimeout(() => setCopied((c) => (c === i.id ? null : c)), 1500);
                  })
                }
              >
                {copied === i.id ? "Copied" : "Copy"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );
}

/** The entries, newest first, in day groups; `copied` is the entry whose text was just copied. */
function Groups({ items, load, view, s, openDictation }: { items: HistoryItem[]; load: () => void; view: View; s: DictationStatus; openDictation: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => groupByDay(items, Date.now()), [items]);
  // Where focus goes once the list has reloaded after a delete: an entry id, or null for the page's own controls.
  const focusNext = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const id = focusNext.current;
    if (id === undefined) return;
    focusNext.current = undefined;
    const target = id ? document.querySelector(`[data-row="${CSS.escape(id)}"] button`) : (document.querySelector(".dict-hist__bar input:not(:disabled)") ?? document.querySelector("h1"));
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
      <div className={`lm-card${view === "side" ? " dict-hist__side" : ""}`}>
        {view === "side" ? (
          <div className="dict-hist__thead" aria-hidden="true">
            <span>Time and app</span>
            <span>What the model heard</span>
            <span>What was pasted</span>
            <span />
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
            />
            {open === item.id && item.recording ? <RecordingPanel item={item} s={s} kept={expiryText(item.expiresInMs, "Kept for")} openDictation={openDictation} /> : null}
          </div>
        ))}
      </div>
    </section>
  ));
}

function Toolbar({ search, setSearch, view, setView, empty }: { search: string; setSearch: (s: string) => void; view: View; setView: (v: View) => void; empty: boolean }) {
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
      <Segmented
        label="Show"
        value={view}
        onChange={(v) => setView(v as View)}
        items={[
          { id: "final", label: "Final text" },
          { id: "side", label: "Side by side" },
        ]}
      />
    </div>
  );
}

/** The two notices above the list: a file from a newer Speak Kit, and recordings the Recycle Bin would not take. */
function Notices({ s }: { s: DictationStatus }) {
  return (
    <>
      {s.historyStatus === "newer" ? (
        <Banner tone="warning" title="This history was saved by a newer Speak Kit" action={<Button onClick={() => void api.updateAction("check")}>Check for updates</Button>}>
          It is left unchanged and a copy was made next to it. Nothing is saved to it until you update, so what you dictate now is not kept after you quit.
        </Banner>
      ) : null}
      {s.keptRecordings > 0 ? (
        <Banner tone="warning" title="A recording could not be moved to the Recycle Bin" action={<Button onClick={() => void dictation.historyDismissNotice()}>Dismiss</Button>}>
          {s.keptRecordings === 1 ? "The file is" : `${s.keptRecordings} files are`} still in Speak Kit&apos;s data folder. The entry is gone; the recording was kept, not deleted.
        </Banner>
      ) : null}
    </>
  );
}

/** History: what was dictated, searchable, with the raw text beside the final one, copy, retention and kept recordings. */
export function DictationHistoryPage({ openDictation }: { openDictation: () => void }) {
  const s = useDictation();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("final");
  const [asking, setAsking] = useState(false);
  const [recordings, setRecordings] = useState(false);
  const total = s?.historyCount ?? 0;
  const retention = s?.settings.retention ?? "7d";
  const load = useCallback(() => {
    void dictation.historyList(search.trim() || undefined).then(setItems);
    void dictation.historyStats().then(setStats);
  }, [search]);
  const rev = s?.historyRev ?? 0;
  useEffect(load, [load, total, rev]);

  return (
    <Page
      title="History"
      lead={historyLead(retention)}
      action={
        <div className="dict-hist__head-acts">
          <CopyRecent disabled={total === 0} />
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
            <DropdownMenuItem icon="microphone" onSelect={() => setRecordings(true)}>
              Keep recordings ({s?.settings.keepRecordings ? "on" : "off"})
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon="trash" destructive disabled={total === 0} onSelect={() => setAsking(true)}>
              Clear all history
            </DropdownMenuItem>
          </DropdownMenu>
        </div>
      }
    >
      {s ? <Notices s={s} /> : null}
      {total > 0 ? <Stats stats={stats} retention={retention} /> : null}
      <Toolbar search={search} setSearch={setSearch} view={view} setView={setView} empty={total === 0} />
      {total === 0 ? (
        <Empty s={s} />
      ) : s ? (
        <>
          <Groups items={items ?? []} load={load} view={view} s={s} openDictation={openDictation} />
          {items?.length === 0 && <p className="dict-hist__none">Nothing matches that search.</p>}
          <p className="dict-hist__foot">{historyFooter(items?.length ?? 0, total, retention)}</p>
        </>
      ) : null}
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
