import { ipcMain, shell, systemPreferences, type WebContents } from "electron";
import { PERMISSION_METHODS, PERMISSIONS_EVENT, permissionChannel, type PermissionMethod } from "../../../shared/permissions/channels";
import { PERMISSION_ARGS, type PermissionsBridge } from "../../../shared/permissions/contract";
import { registerValidatedIpc } from "../../ipc-register";
import { loadMacNative } from "../../dictation/macos/native";
import { macAdapter, noPermissionsAdapter, windowsAdapter } from "./adapters";
import { createPermissions, type Permissions } from "./service";


function adapterFor(platform: NodeJS.Platform) {
  if (platform === "darwin") return macAdapter(systemPreferences, async () => (await loadMacNative()).inputMonitoring);
  return platform === "win32" ? windowsAdapter(systemPreferences) : noPermissionsAdapter;
}

/**
 * The permissions service for this operating system, wired to the app window: the Settings pages read the status, ask for a permission and open its
 * settings pane through the bridge, and the window hears every change. Call `refresh` when the window gets focus back.
 */
export function setupPermissions(window: () => WebContents | undefined): Permissions & { refresh(): void } {
  const permissions = createPermissions({
    adapter: adapterFor(process.platform),
    openUrl: (url) => shell.openExternal(url),
    onChange(status) {
      const contents = window();
      if (contents && !contents.isDestroyed()) contents.send(PERMISSIONS_EVENT, status);
    },
  });
  const handlers: Pick<PermissionsBridge, PermissionMethod> = {
    status: () => permissions.status(),
    request: (id) => permissions.request(id),
    openSettings: (id) => permissions.openSettings(id),
  };
  registerValidatedIpc<PermissionMethod>(ipcMain, {
    methods: PERMISSION_METHODS,
    channel: permissionChannel,
    args: PERMISSION_ARGS,
    handler: (m) => handlers[m] as (...a: unknown[]) => unknown,
    trusted: (e) => e.sender === window(),
  });
  return { ...permissions, refresh: () => void permissions.status() };
}
