import { useState, type ReactElement } from "react";
import { Banner, Button, DropdownMenu, DropdownMenuItem } from "@speakkit/ui";
import type { Format } from "@speakkit/transcripts/pure";
import { transcripts } from "./api";

export type ExportResult = { kind: "copied" } | { kind: "saved"; id: string; format: Format; path: string; how: "new" | "replaced" | "copy" } | { kind: "error"; message: string };

const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** The Export menu: Copy transcript and the file formats. The result goes to `onResult`; the menu itself shows nothing. */
export function ExportMenu({ id, trigger, onResult }: { id: string; trigger: ReactElement; onResult: (r: ExportResult) => void }) {
  const save = async (format: Format) => {
    const r = await transcripts.save(id, format).catch(() => null);
    if (!r) onResult({ kind: "error", message: "The file could not be saved." });
    else onResult(r.ok ? { kind: "saved", id, format, path: r.path, how: r.kind } : { kind: "error", message: r.failure.message });
  };
  return (
    <DropdownMenu trigger={trigger} align="end">
      <DropdownMenuItem icon="copy" onSelect={() => void transcripts.copyText(id).then((ok) => onResult(ok ? { kind: "copied" } : { kind: "error", message: "That transcript is gone." }))}>
        Copy transcript
      </DropdownMenuItem>
      <DropdownMenuItem icon="download" onSelect={() => void save("md")}>
        Save as Markdown
      </DropdownMenuItem>
      <DropdownMenuItem icon="download" onSelect={() => void save("txt")}>
        Save as plain text
      </DropdownMenuItem>
      <DropdownMenuItem icon="download" onSelect={() => void save("srt")}>
        Save as SRT subtitles
      </DropdownMenuItem>
      <DropdownMenuItem icon="download" onSelect={() => void save("vtt")}>
        Save as VTT subtitles
      </DropdownMenuItem>
      <DropdownMenuItem icon="download" onSelect={() => void save("json")}>
        Save as JSON
      </DropdownMenuItem>
    </DropdownMenu>
  );
}

/** What an export did: copied, saved (with Show in folder, which selects the file), saved as a copy because the earlier file was changed, or failed. */
export function ExportNotice({ result, onClose }: { result: ExportResult | null; onClose: () => void }) {
  const [revealFailed, setRevealFailed] = useState(false);
  if (!result) return null;
  const close = (
    <Button size="sm" variant="ghost" onClick={onClose}>
      Dismiss
    </Button>
  );
  if (result.kind === "copied")
    return (
      <Banner tone="info" icon="circle-check" action={close}>
        Copied to the clipboard.
      </Banner>
    );
  if (result.kind === "error")
    return (
      <Banner tone="error" action={close}>
        {result.message}
      </Banner>
    );
  const name = baseName(result.path);
  return (
    <Banner
      tone={result.how === "copy" ? "warning" : "info"}
      icon={result.how === "copy" ? "alert-triangle" : "circle-check"}
      action={
        <div className="tr-notice__actions">
          <Button size="sm" onClick={() => void transcripts.reveal(result.id, result.format).then((ok) => setRevealFailed(!ok))}>
            Show in folder
          </Button>
          {close}
        </div>
      }
    >
      {result.how === "copy" ? `The file already existed and was changed, so a new copy was saved: ${name}.` : `Saved as ${name}.`}
      {revealFailed ? " The file could not be found." : ""}
    </Banner>
  );
}
