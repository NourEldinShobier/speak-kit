import { utilityProcess } from "electron";
import type { Channel } from "@speakkit/engine";
import { channelOf } from "./utility-channel";

/**
 * Starts a model host as an Electron utility process: a Node environment that loads the native addons like any child process, without needing the
 * app binary to run as plain Node. Messages are structured-cloned both ways.
 */
export function utilityChannel(file: string, env: Record<string, string>): Channel<unknown, unknown> {
  return channelOf(utilityProcess.fork(file, [], { env, serviceName: "Speak Kit model host", stdio: "inherit" }));
}
