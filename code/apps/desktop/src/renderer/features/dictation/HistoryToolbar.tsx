import { Button, TextInput } from "@speakkit/ui";

interface ToolbarProps {
  search: string;
  setSearch: (s: string) => void;
  empty: boolean;
  onClear: () => void;
  onStats: () => void;
  /** Selection mode: null when off. */
  picked: ReadonlySet<string> | null;
  shown: number;
  setSelecting: (on: boolean) => void;
  selectAll: () => void;
  onDeleteSelected: () => void;
}

export function Toolbar(p: ToolbarProps) {
  const { picked } = p;
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
      <div className="dict-hist__tools">
        {picked ? (
          <>
            <Button disabled={p.shown === 0} onClick={p.selectAll}>
              Select all
            </Button>
            <Button className="dict-clear" disabled={picked.size === 0} onClick={p.onDeleteSelected}>
              {`Delete selected (${picked.size})`}
            </Button>
            <Button onClick={() => p.setSelecting(false)}>Done</Button>
          </>
        ) : (
          <>
            <Button disabled={p.empty} onClick={p.onStats}>
              Statistics
            </Button>
            <Button disabled={p.empty} onClick={() => p.setSelecting(true)}>
              Select
            </Button>
            <Button className="dict-clear" disabled={p.empty} onClick={p.onClear}>
              Clear all
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
