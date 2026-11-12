import type { Device, SettingsView } from "../../../shared/meetings/contract";

const RECORD_OPTIONS = [
  { value: "call-app", label: "The call app only" },
  { value: "system", label: "Everything this computer plays" },
];

/** What is recorded can only be limited to the call app where the system tells which program a sound comes from; elsewhere the whole system is recorded, and the page says so. */
export function recordChoice(v: SettingsView): { value: string; options: typeof RECORD_OPTIONS } {
  if (v.capabilities.callAppOutput === "available") return { value: v.config.recordSource, options: RECORD_OPTIONS };
  return { value: "system", options: RECORD_OPTIONS.filter((o) => o.value === "system") };
}

/** The microphone choices; "Follows the call app" is offered only where the system can name the call app's microphone. */
export function micChoice(v: SettingsView, inputs: Device[]): { value: string; options: { value: string; label: string }[] } {
  const follows = v.capabilities.micFollowsCallApp === "available";
  return {
    value: v.config.mic === "call-app" && !follows ? "dictation" : v.config.mic,
    options: [{ value: "dictation", label: "Same as dictation" }, ...(follows ? [{ value: "call-app", label: "Follows the call app" }] : []), ...inputs.map((i) => ({ value: i.id, label: i.label }))],
  };
}
