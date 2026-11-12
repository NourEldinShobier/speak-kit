import { ipcMain } from "electron";
import { CAPTURE_METHODS, captureChannel, type CaptureMethod } from "../../shared/capture/channels";
import { CAPTURE_ARGS, type CaptureBridge } from "../../shared/capture/contract";
import { registerValidatedIpc } from "../ipc-register";
import type { CaptureService } from "./service";

type Handlers = Pick<CaptureBridge, CaptureMethod>;

const handlersOf = (c: CaptureService): Handlers => ({
  status: () => c.statusNow(),
  setEnabled: (on) => c.setEnabled(on),
  patchSettings: (patch) => c.patchSettings(patch),
  list: (search) => c.list(search),
  detail: (id) => c.detail(id),
  copy: (id, what) => c.copy(id, what),
  reveal: (id) => c.reveal(id),
  remove: (id) => c.remove(id),
  start: () => c.start(),
  stop: async () => c.stop(),
  discard: async () => c.discard(),
  noticeAction: (action) => c.noticeAction(action),
  dismissNotice: async () => c.dismissNotice(),
  dismissRecovery: async () => c.dismissRecovery(),
  chooseFolder: () => c.chooseFolder(),
  source: (id, file) => c.source(id, file),
  saveEdit: (id, file, png) => c.saveEdit(id, file, png),
  trim: (id, startMs, endMs) => c.trim(id, startMs, endMs),
});

/** The Capture pages of the app window call these (only the app window may). Arguments are checked before any handler runs. */
export function registerCaptureIpc(c: CaptureService, isAppWindow: (contents: Electron.WebContents) => boolean): void {
  const handlers = handlersOf(c);
  registerValidatedIpc<CaptureMethod>(ipcMain, {
    methods: CAPTURE_METHODS,
    channel: captureChannel,
    args: CAPTURE_ARGS,
    handler: (m) => handlers[m] as (...a: unknown[]) => unknown,
    trusted: (e) => isAppWindow(e.sender),
  });
}
