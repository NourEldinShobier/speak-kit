import { useState } from "react";
import { Banner, Button, Popover } from "@speakkit/ui";
import type { DictationStatus, HistoryItem } from "../../../shared/dictation/contract";
import { api } from "../../ui";
import { dictation } from "./api";
import { entryLabel, timeText } from "./model";

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

/** The notices above the list: a file from a newer Speak Kit, a file that could not be read, and recordings the Recycle Bin would not take. */
export function Notices({ s }: { s: DictationStatus }) {
  return (
    <>
      {s.historyStatus === "newer" ? (
        <Banner tone="warning" title="This history was saved by a newer Speak Kit" action={<Button onClick={() => void api.updateAction("check")}>Check for updates</Button>}>
          It is left unchanged and a copy was made next to it. Nothing is saved to it until you update, so what you dictate now is not kept after you quit.
        </Banner>
      ) : null}
      {s.historyStatus === "unreadable" ? (
        <Banner tone="warning" title="The history file could not be read">
          {s.historyCopy ? `A copy was kept as ${s.historyCopy} next to it. ` : ""}The history starts empty, and what you dictate from now on replaces the unreadable file.
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
