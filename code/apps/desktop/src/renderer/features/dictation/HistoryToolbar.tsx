import { Button, DropdownMenu, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, IconButton, Segmented, TextInput } from "@speakkit/ui";
import { dictation } from "./api";
import { CopyRecent } from "./HistoryParts";
import type { View } from "./HistoryRow";
import { RETENTION_OPTIONS } from "./model";

interface ToolbarProps {
  search: string;
  setSearch: (s: string) => void;
  view: View;
  setView: (v: View) => void;
  empty: boolean;
  retention: string;
  keepRecordings: boolean;
  onClear: () => void;
  onStats: () => void;
  onRecordings: () => void;
  /** Selection mode: null when off. */
  picked: ReadonlySet<string> | null;
  shown: number;
  setSelecting: (on: boolean) => void;
  selectAll: () => void;
  onDeleteSelected: () => void;
}

function MoreMenu({ p }: { p: ToolbarProps }) {
  return (
    <DropdownMenu trigger={<IconButton name="dots" label="More history actions" variant="secondary" />}>
      <DropdownMenuItem icon="download" disabled={p.empty} onSelect={() => void dictation.historyExport()}>
        Export history
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Keep entries for</DropdownMenuLabel>
      {RETENTION_OPTIONS.map((o) => (
        <DropdownMenuItem key={o.value} selected={o.value === p.retention} onSelect={() => void dictation.patchSettings({ retention: o.value })}>
          {o.label}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem icon="microphone" onSelect={p.onRecordings}>
        Keep recordings ({p.keepRecordings ? "on" : "off"})
      </DropdownMenuItem>
    </DropdownMenu>
  );
}

function ViewToggle({ view, setView }: Pick<ToolbarProps, "view" | "setView">) {
  return (
    <Segmented
      label="Show"
      value={view}
      onChange={(v) => setView(v as View)}
      items={[
        { id: "final", label: "Final text" },
        { id: "side", label: "Side by side" },
      ]}
    />
  );
}

function Tools(p: ToolbarProps) {
  const { picked } = p;
  if (picked)
    return (
      <>
        <Button disabled={p.shown === 0} onClick={p.selectAll}>
          Select all
        </Button>
        <Button className="dict-clear" disabled={picked.size === 0} onClick={p.onDeleteSelected}>
          {`Delete selected (${picked.size})`}
        </Button>
        <Button onClick={() => p.setSelecting(false)}>Done</Button>
      </>
    );
  return (
    <>
      <CopyRecent disabled={p.empty} />
      <Button disabled={p.empty} onClick={p.onStats}>
        Statistics
      </Button>
      <Button disabled={p.empty} onClick={() => p.setSelecting(true)}>
        Select
      </Button>
      <Button className="dict-clear" disabled={p.empty} onClick={p.onClear}>
        Clear all
      </Button>
      <MoreMenu p={p} />
    </>
  );
}

export function Toolbar(p: ToolbarProps) {
  return (
    <div className="dict-hist__bar">
      <TextInput
        icon="search"
        aria-label="Search what you dictated"
        placeholder="Search what you dictated"
        value={p.search}
        disabled={p.empty}
        onChange={(e) => p.setSearch(e.target.value)}
        frameClassName="dict-hist__search"
      />
      <ViewToggle view={p.view} setView={p.setView} />
      <div className="dict-hist__tools">
        <Tools {...p} />
      </div>
    </div>
  );
}
