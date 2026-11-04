import { Banner, SettingRow, SettingsSection, Toggle } from "@speakkit/ui";
import type { AppState } from "../../../shared/ipc";
import { NOTIFY_CHANNELS, NOTIFY_EVENTS, type NotifyChannel, type NotifyEvent } from "../../../shared/schemas";
import { api, Page } from "../../ui";

const EVENT_LABEL: Record<NotifyEvent, string> = {
  "reading-finished": "Reading finished",
  "export-done": "Export finished",
  "engine-error": "Voice engine problem",
  "update-ready": "Update ready",
};
const CHANNEL_LABEL: Record<NotifyChannel, string> = { toast: "Toast", bell: "Bell", sound: "Sound" };

/** Settings > Notifications (H14): event by Toast, Bell and Sound, plus Do not disturb. */
export function NotificationsPage({ s }: { s: AppState }) {
  const c = s.config;
  const set = (event: NotifyEvent, channel: NotifyChannel, on: boolean) => api.patchConfig({ notifications: { ...c.notifications, [event]: { ...c.notifications[event], [channel]: on } } });
  return (
    <Page title="Notifications" lead="A toast is a Windows notification. The bell is the list in the title bar. Clicking a toast opens the place it is about.">
      <SettingsSection title="Do not disturb">
        <SettingRow
          label="Do not disturb"
          description="No toasts or sounds from Speak Kit. The bell still keeps a line for each event."
          control={<Toggle aria-label="Do not disturb" checked={c.doNotDisturb} onChange={(v) => api.patchConfig({ doNotDisturb: v })} />}
        />
      </SettingsSection>
      <SettingsSection title="Events" description="At most one toast per task every 10 minutes.">
        <table className="sk-notify" data-testid="notify-table">
          <thead>
            <tr>
              <th scope="col">Event</th>
              {NOTIFY_CHANNELS.map((ch) => (
                <th key={ch} scope="col">
                  {CHANNEL_LABEL[ch]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFY_EVENTS.map((ev) => (
              <tr key={ev}>
                <th scope="row">{EVENT_LABEL[ev]}</th>
                {NOTIFY_CHANNELS.map((ch) => (
                  <td key={ch}>
                    <Toggle aria-label={`${EVENT_LABEL[ev]}: ${CHANNEL_LABEL[ch]}`} checked={c.notifications[ev][ch]} onChange={(v) => set(ev, ch, v)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </SettingsSection>
      <Banner tone="info" title="Windows Focus and Do Not Disturb also apply">
        When Windows is in a focus session, toasts go straight to the notification center.
      </Banner>
    </Page>
  );
}
