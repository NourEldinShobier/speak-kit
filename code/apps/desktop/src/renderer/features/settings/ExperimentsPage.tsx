import { SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import { LABS, visibleLabs, type LabId } from "../../../shared/labs";
import type { AppState } from "../../../shared/ipc";
import { api, Page } from "../../ui";
import { ExperimentCards, experimentCards } from "../experiments";
import { arrowTarget, rowAttr } from "./focus";
import { change } from "./change";

const GROUPS = ["App", "Developer"] as const;

export function ExperimentsPage({ s }: { s: AppState }) {
  const [confirm, setConfirm] = useState<Experiment | null>(null);
  const [restart, setRestart] = useState(false);
  const flags = s.config.experiments;
  const list = visibleExperiments(!s.packaged);
  const set = async (e: Experiment, on: boolean) => {
    const next = toggled(flags, e.id, on);
    if (needsRestart(flags, next, experiments())) setRestart(true);
    await change({ experiments: next });
  };
  return (
    <Page title="Experiments" lead="Features that are still being tried out. Each one is off until you switch it on.">
      {GROUPS.map((g) => {
        const ids = shown.filter((id) => LABS[id].group === g);
        return (
          ids.length > 0 && (
            <SettingsSection key={g} title={g}>
              {ids.map((id) => (
                <SettingRow
                  key={id}
                  label={LABS[id].title}
                  description={LABS[id].description}
                  control={<Toggle aria-label={LABS[id].title} data-testid={`lab-${id}`} checked={c.labs[id]} onChange={(on) => set(id, on)} />}
                />
              ))}
            </SettingsSection>
          )
        );
      })}
      <SettingsSection title="Developers">
        <SettingRow
          label="Show developer experiments"
          description="Experiments meant for people who build on or debug Speak Kit."
          control={<Toggle aria-label="Show developer experiments" checked={c.showDeveloperLabs} onChange={(on) => api.patchConfig({ showDeveloperLabs: on })} />}
        />
      </SettingsSection>
    </Page>
  );
}
