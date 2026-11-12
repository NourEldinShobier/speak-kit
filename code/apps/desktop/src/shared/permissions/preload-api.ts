import type { IpcRenderer } from "electron";
import { PERMISSION_METHODS, PERMISSIONS_EVENT, permissionChannel } from "./channels";
import type { PermissionsBridge, PermissionsStatus } from "./contract";

export function permissionsBridge(ipc: IpcRenderer): PermissionsBridge {
  const methods = Object.fromEntries(PERMISSION_METHODS.map((m) => [m, (...args: unknown[]) => ipc.invoke(permissionChannel(m), ...args)]));
  return {
    ...methods,
    onStatus(cb) {
      const h = (_: unknown, s: PermissionsStatus) => cb(s);
      ipc.on(PERMISSIONS_EVENT, h);
      return () => void ipc.off(PERMISSIONS_EVENT, h);
    },
  } as PermissionsBridge;
}
