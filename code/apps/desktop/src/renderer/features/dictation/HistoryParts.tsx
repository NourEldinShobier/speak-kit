import { useState } from "react";
import type { HistoryStats } from "@speakkit/dictation";
import { Banner, Button, EmptyState, Kbd, Popover, Segmented, TextInput } from "@speakkit/ui";
import type { DictationStatus, HistoryItem } from "../../../shared/dictation/contract";
import { hotkeyLabels } from "../../../shared/dictation/keys";
import { api } from "../../ui";
import { dictation } from "./api";
import type { View } from "./HistoryRow";
import { emptyHint, entryLabel, listeningText, numberText, statsTitle, timeText } from "./model";

export function Empty({ s }: { s: DictationStatus | null }) {
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

/** The numbers above the list. */
export function Stats({ stats, retention }: { stats: HistoryStats | null; retention: DictationStatus["settings"]["retention"] }) {
  const title = statsTitle(retention);
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
export function CopyRecent({ disabled }: { disabled: boolean }) {
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

export function Toolbar({ search, setSearch, view, setView, empty }: { search: string; setSearch: (s: string) => void; view: View; setView: (v: View) => void; empty: boolean }) {
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
export function Notices({ s }: { s: DictationStatus }) {
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
