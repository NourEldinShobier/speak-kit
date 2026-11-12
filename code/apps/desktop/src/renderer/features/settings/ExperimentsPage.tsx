import { SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import { LABS, visibleLabs, type LabId } from "../../../shared/labs";
import type { AppState } from "../../../shared/ipc";
import { api, Page } from "../../ui";

const GROUPS = ["App", "Developer"] as const;

export function ExperimentsPage({ s }: { s: AppState }) {
  const c = s.config;
  const shown = visibleLabs(c.showDeveloperLabs);
  const set = (id: LabId, on: boolean) => api.patchConfig({ labs: { ...c.labs, [id]: on } });
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
