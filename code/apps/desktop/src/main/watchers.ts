import { powerMonitor } from "electron";
import type { Activity, AppState } from "../shared/ipc";
import { applyMemory } from "../shared/memory";
import type { Config } from "../shared/schemas";
import { watchPairing } from "./pairing";
import type { ServerRuntime } from "./server-lifecycle";

/** On battery the model unloads sooner (the Battery saver setting): the server is told whenever the power source changes. */
export function watchPower(d: { state: AppState; config: Config; runtime: ServerRuntime; publish(): void }): void {
  d.state.onBattery = powerMonitor.isOnBatteryPower();
  const onPower = (battery: boolean) => {
    d.state.onBattery = battery;
    applyMemory(d.runtime.server, d.config, battery);
    d.publish();
  };
  powerMonitor.on("on-battery", () => onPower(true));
  powerMonitor.on("on-ac", () => onPower(false));
}

/** Notes the first call of a browser extension in the bell. */
export function watchPairingActivity(d: { state: AppState; addActivity(kind: Activity["kind"], title: string, body: string): void; publish(): void }): void {
  watchPairing(d.state.pairing, {
    token: () => d.state.token,
    port: () => d.state.port,
    onChange: () => {
      if (d.state.pairing.firstSeenMs === d.state.pairing.lastSeenMs) d.addActivity("pair", "Browser paired", "An extension made its first call.");
      d.publish();
    },
  });
}
