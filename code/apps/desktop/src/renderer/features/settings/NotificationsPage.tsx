import { Banner, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import { NOTIFY_CHANNELS, NOTIFY_EVENTS, type NotifyChannel, type NotifyEvent } from "../../../shared/schemas";
import { useT } from "../../i18n";
import { Page } from "../../ui";
import { change } from "./change";

/** Settings > Notifications: event by Toast, Bell and Sound, plus Do not disturb. */
export function NotificationsPage({ s }: { s: AppState }) {
  const { t } = useT();
  const c = s.config;
  const eventLabel = (e: NotifyEvent) => t(`notify.${e}`);
  const channelLabel = (ch: NotifyChannel) => t(`notify.${ch}`);
  const set = (event: NotifyEvent, channel: NotifyChannel, on: boolean) => change({ notifications: { ...c.notifications, [event]: { ...c.notifications[event], [channel]: on } } });
  return (
    <Page title={t("notify.title")} lead={t("notify.lead")}>
      <SettingsSection title={t("notify.dnd")}>
        <SettingRow
          label={t("notify.dnd")}
          description={t("notify.dndHint")}
          control={<Toggle aria-label={t("notify.dnd")} checked={c.doNotDisturb} onChange={(v) => change({ doNotDisturb: v })} />}
        />
      </SettingsSection>
      <SettingsSection title={t("notify.events")} description={t("notify.eventsHint")}>
        <table className="sk-notify" data-testid="notify-table">
          <thead>
            <tr>
              <th scope="col">{t("notify.event")}</th>
              {NOTIFY_CHANNELS.map((ch) => (
                <th key={ch} scope="col">
                  {channelLabel(ch)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFY_EVENTS.map((ev) => (
              <tr key={ev}>
                <th scope="row">{eventLabel(ev)}</th>
                {NOTIFY_CHANNELS.map((ch) => (
                  <td key={ch}>
                    <Toggle aria-label={`${eventLabel(ev)}: ${channelLabel(ch)}`} checked={c.notifications[ev][ch]} onChange={(v) => set(ev, ch, v)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </SettingsSection>
      <Banner tone="info" title={t("notify.focusTitle")}>
        {t("notify.focusBody")}
      </Banner>
    </Page>
  );
}
