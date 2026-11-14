import type { PermissionId } from "../../../shared/permissions/channels";
import type { GuideStep } from "../../../shared/permissions/guide";

const LABEL: Record<PermissionId, { name: string; why: string }> = {
  microphone: { name: "Microphone", why: "To hear you while the hotkey is held." },
  "input-monitoring": { name: "Input Monitoring", why: "To notice the hotkey in any app." },
  accessibility: { name: "Accessibility", why: "To paste the text into the app you are using." },
  "screen-recording": { name: "Screen Recording", why: "To read what is on the screen." },
};

export const permissionLabel = (id: PermissionId) => LABEL[id];

export const stepButton = (s: GuideStep): string | null => ({ request: "Allow", "open-settings": "Open settings", none: null })[s.action];

const STATE_TEXT: Partial<Record<GuideStep["state"], string>> = { denied: "Blocked", restricted: "Restricted by your administrator" };

export const stepStatus = (s: GuideStep): string => (s.action === "none" ? "Allowed" : (STATE_TEXT[s.state] ?? "Not allowed yet"));

/** The hotkey banner: on a Mac it names the permission that is still missing, because a refused key tap is almost always that. */
export function hotkeyFailedCopy(platform: string, pending: GuideStep | null): { title: string; text: string } {
  const key = pending && (pending.id === "input-monitoring" || pending.id === "accessibility") ? pending : null;
  if (platform === "darwin" && key)
    return { title: "Allow Speak Kit to see the hotkey", text: `Dictation needs ${permissionLabel(key.id).name} in System Settings. The hotkey starts by itself once you allow it.` };
  return { title: "The hotkey could not start", text: "Dictation does not hear the hotkey. Turn Dictation off and on again; if that does not help, restart Speak Kit." };
}
