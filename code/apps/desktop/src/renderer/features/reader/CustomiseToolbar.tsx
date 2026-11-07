import { IconButton, Popover, Toggle } from "@speakkit/ui";
import { TOOLBAR_LABEL } from "./toolbar";

interface Props<Id extends keyof typeof TOOLBAR_LABEL> {
  /** Accessible name of the "…" button. */
  label: string;
  /** Every item of the toolbar, in drawing order. */
  ids: readonly Id[];
  hidden: readonly Id[];
  side: "top" | "bottom";
  onShown(id: Id, shown: boolean): void;
}

/** The "…" button at the end of a toolbar: a list of switches, one per item. The order is fixed. */
export function CustomiseToolbar<Id extends keyof typeof TOOLBAR_LABEL>({ label, ids, hidden, side, onShown }: Props<Id>) {
  return (
    <Popover side={side} align="end" width={264} title="Customise toolbar" trigger={(t) => <IconButton name="dots" label={label} size={28} variant="secondary" className="rd-more" {...t} />}>
      <div className="rd-pop rd-pop--switches">
        {ids.map((id) => (
          <label key={id} className="rd-pop__row">
            <span>{TOOLBAR_LABEL[id]}</span>
            <Toggle checked={!hidden.includes(id)} onChange={(on) => onShown(id, on)} aria-label={TOOLBAR_LABEL[id]} />
          </label>
        ))}
      </div>
    </Popover>
  );
}
