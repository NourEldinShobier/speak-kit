import { useEffect, useState } from "react";
import type { PermissionId } from "../../../shared/permissions/channels";
import type { PermissionsBridge, PermissionsStatus } from "../../../shared/permissions/contract";
import type { GuideStep } from "../../../shared/permissions/guide";

declare global {
  interface Window {
    speakkitPermissions?: PermissionsBridge;
  }
}

/** The permission status: fetched once, then pushed by the main process. Null until it arrives. */
const noop = (): undefined => undefined;

export function usePermissions(bridge: PermissionsBridge | undefined = window.speakkitPermissions): PermissionsStatus | null {
  const [status, setStatus] = useState<PermissionsStatus | null>(null);
  useEffect(() => {
    if (!bridge) return;
    let live = true;
    void bridge
      .status()
      .then((s) => live && setStatus((cur) => cur ?? s))
      .catch(noop);
    const off = bridge.onStatus(setStatus);
    return () => {
      live = false;
      off();
    };
  }, [bridge]);
  return status;
}

const NAME: Record<PermissionId, string> = { microphone: "Microphone", "screen-recording": "Screen Recording", accessibility: "Accessibility", "input-monitoring": "Input Monitoring" };
const WHY: Record<PermissionId, string> = {
  microphone: "To record your voice in the call.",
  "screen-recording": "To record the sound of the call.",
  accessibility: "To read the window title of a call app.",
  "input-monitoring": "To notice the shortcut in any app.",
};

export const permissionName = (id: PermissionId) => NAME[id];
export const permissionWhy = (id: PermissionId) => WHY[id];
export const stepButton = (s: GuideStep): string | null => ({ request: "Allow", "open-settings": "Open settings", none: null })[s.action];
export const stepStatus = (s: GuideStep): string => {
  if (s.action === "none") return "Allowed";
  if (s.state === "denied") return "Blocked";
  return s.state === "restricted" ? "Restricted by your administrator" : "Not allowed yet";
};
