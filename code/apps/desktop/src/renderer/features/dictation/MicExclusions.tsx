import { useState } from "react";
import { Button, Icon, SettingsSection, TextInput } from "@speakkit/ui";
import { MAX_EXCLUSIONS } from "../../../shared/dictation/settings";
import { dictation } from "./api";
import { withExclusion } from "./mic-model";

/** Names the automatic choice must never pick: any input whose name contains one of these words. A microphone picked by hand is still used. */
export function MicExclusions({ list }: { list: readonly string[] }) {
  const [word, setWord] = useState("");
  const save = (next: string[]) => void dictation.patchSettings({ micExclusions: next });
  const add = () => {
    save(withExclusion(list, word));
    setWord("");
  };
  return (
    <SettingsSection title="Skipped microphones" description="Automatic never picks an input whose name contains one of these words. A microphone you choose yourself is always used.">
      {list.length === 0 && <div className="lm-row dict-rule__empty">Nothing is skipped by name. Virtual, aggregate and phone inputs are always skipped.</div>}
      {list.map((x) => (
        <div className="lm-row dict-rule" key={x}>
          <span className="dict-rule__name">{x}</span>
          <button type="button" className="lm-btn lm-btn--icon" aria-label={`Stop skipping ${x}`} onClick={() => save(list.filter((y) => y !== x))}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      ))}
      <form
        className="lm-row dict-rule dict-rule--add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <TextInput
          aria-label="Microphone name to skip"
          placeholder="Part of a name, for example webcam"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          maxLength={60}
          className="dict-rule__field"
        />
        <Button type="submit" variant="primary" disabled={!word.trim() || list.length >= MAX_EXCLUSIONS}>
          Add
        </Button>
      </form>
    </SettingsSection>
  );
}
