import { useEffect, useState } from "react";
import type { PermissionsBridge, PermissionsStatus } from "../../../shared/permissions/contract";

declare global {
  interface Window {
    speakkitPermissions?: PermissionsBridge;
  }
}

/** The permission status: fetched once, then pushed by the main process. Null until it arrives or where the bridge is missing. */
export function usePermissions(bridge: PermissionsBridge | undefined = window.speakkitPermissions): PermissionsStatus | null {
  const [status, setStatus] = useState<PermissionsStatus | null>(null);
  useEffect(() => {
    if (!bridge) return;
    let live = true;
    void bridge
      .status()
      .then((s) => live && setStatus((cur) => cur ?? s))
      .catch(() => undefined);
    const off = bridge.onStatus(setStatus);
    return () => {
      live = false;
      off();
    };
  }, [bridge]);
  return status;
}
