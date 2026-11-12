import { app } from "electron";
import path from "node:path";

const PROTOCOL = "speakkit";

export function registerProtocol() {
  // Tests run with an isolated userData; do not touch the user's registry then.
  if (process.env.SPEAKKIT_USER_DATA && !process.env.SPEAKKIT_REGISTER_PROTOCOL) return;
  if (process.defaultApp && process.argv[1]) app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  else app.setAsDefaultProtocolClient(PROTOCOL);
}
