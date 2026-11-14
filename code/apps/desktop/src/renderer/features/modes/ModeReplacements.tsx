import type { WritingMode as Mode } from "@speakkit/dictation";
import { Chip, SettingRow } from "@speakkit/ui";
import { MAX_REPLACEMENTS } from "../../../shared/dictation/settings";
import { ReplacementRules, useLive } from "../vocabulary";

/** Phrases swapped only when dictating in this mode; they win over a shared replacement of the same phrase. */
export function ModeReplacements({ mode, onChange }: { mode: Mode; onChange(next: Mode): void }) {
  const [list, update] = useLive(mode.replacements, async (replacements) => onChange({ ...mode, replacements }));
  return (
    <div className="lm-card">
      <SettingRow
        label="Replacements for this mode"
        description={`Used only when you dictate in ${mode.name}. They win over the shared replacements for the same phrase. Leave Replace with empty to delete the phrase.`}
        control={
          <Chip>
            {list.length} of {MAX_REPLACEMENTS}
          </Chip>
        }
      />
      <ReplacementRules rules={list} update={update} label={`Replacements for ${mode.name}`} />
    </div>
  );
}
