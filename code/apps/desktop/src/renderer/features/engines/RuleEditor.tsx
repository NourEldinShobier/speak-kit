import { useState } from "react";
import { Button, Icon, Select, SettingRow, TextInput, Toggle } from "@speakkit/ui";
import type { SpeechModelsView, SwitchRuleView } from "../../../shared/speech-models/contract";
import { patchEngines } from "./api";
import type { Run } from "./run";

interface RowProps {
  rule: SwitchRuleView;
  options: { value: string; label: string }[];
  skipped: boolean;
  modelName: string;
  update(patch: Partial<SwitchRuleView>): void;
  commit(next?: Partial<SwitchRuleView>): void;
  remove(): void;
}

function RuleRow({ rule: r, options, skipped, modelName, update, commit, remove }: RowProps) {
  return (
    <div className="sk-rule">
      <TextInput aria-label="Keyboard layout" placeholder="Layout, e.g. de" maxLength={16} value={r.layout ?? ""} onChange={(e) => update({ layout: e.target.value })} onBlur={() => commit()} />
      <TextInput aria-label="App" placeholder="App, e.g. slack" maxLength={80} value={r.app ?? ""} onChange={(e) => update({ app: e.target.value })} onBlur={() => commit()} />
      <Select label="Model" size="sm" value={r.model} options={options.length ? options : [{ value: r.model, label: modelName }]} onChange={(model) => commit({ model })} />
      <Button aria-label="Remove rule" onClick={remove}>
        <Icon name="trash" size={14} />
      </Button>
      {skipped && <p className="sk-rule__skip">Skipped: {modelName} is not downloaded.</p>}
    </div>
  );
}

/** Automatic switching: off by default, only downloaded models, a 300 ms wait, and a rule whose model is missing says it is skipped. */
export function RuleEditor({ v, run }: { v: SpeechModelsView; run: Run }) {
  const installed = v.models.filter((m) => m.installed);
  const [rules, setRules] = useState<SwitchRuleView[]>(v.autoSwitch.rules);
  const save = (enabled: boolean, next: SwitchRuleView[]) => {
    setRules(next);
    run(() => patchEngines({ autoSwitch: { enabled, rules: next } }));
  };
  const patch = (id: string, p: Partial<SwitchRuleView>) => rules.map((r) => (r.id === id ? { ...r, ...p } : r));
  const options = installed.map((m) => ({ value: m.id, label: m.name }));
  const add = () => save(true, [...rules, { id: `r${Date.now().toString(36)}`, layout: "", model: installed[0]!.id }]);
  return (
    <>
      <SettingRow
        label="Switch model automatically"
        description="Off by default. Only downloaded models are used, and never during a recording."
        control={<Toggle aria-label="Switch model automatically" checked={v.autoSwitch.enabled} onChange={(on) => save(on, rules)} />}
      />
      {v.autoSwitch.enabled && (
        <div className="sk-rules" role="group" aria-label="Automatic switching rules">
          <p className="sk-rules__note">Speak Kit waits 300 ms after the keyboard layout or the app changes before it switches.</p>
          {rules.map((r) => (
            <RuleRow
              key={r.id}
              rule={r}
              options={options}
              skipped={v.autoSwitch.skippedRuleIds.includes(r.id)}
              modelName={v.names[r.model] ?? r.model}
              update={(p) => setRules(patch(r.id, p))}
              commit={(p) => save(true, p ? patch(r.id, p) : rules)}
              remove={() =>
                save(
                  true,
                  rules.filter((x) => x.id !== r.id),
                )
              }
            />
          ))}
          <Button disabled={installed.length === 0 || rules.length >= 20} onClick={add}>
            Add rule
          </Button>
          {v.platform !== "win32" && <p className="sk-rules__note">Keyboard layout rules need Windows. Rules by app name work where Speak Kit can tell which app is in front.</p>}
        </div>
      )}
    </>
  );
}
