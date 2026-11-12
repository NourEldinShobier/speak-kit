/** One audio input as the operating system lists it. `id` is the stable device id used to open it. */
export interface MicDevice {
  id: string;
  label: string;
}

export type MicKind = "virtual" | "bluetooth" | "built-in" | "wired";

const VIRTUAL = /virtual|aggregate|loopback|voicemeeter|vb-audio|cable (input|output)|blackhole|soundflower|\bobs\b|\bndi\b|stereo mix|iphone|ipad|continuity|\bcamo\b|droidcam|epoccam/i;
const BLUETOOTH = /bluetooth|hands-free|handsfree|airpods|\bbuds\b|wh-1000|wf-1000|\bbt\b/i;
const BUILT_IN = /built-in|internal|macbook|microphone array|integrated|realtek/i;

/** Guesses what a device is from its name; the system gives no transport type to a web page. */
export function micKind(device: MicDevice, exclusions: readonly string[] = []): MicKind {
  const label = device.label;
  if (VIRTUAL.test(label) || exclusions.some((x) => x.trim() && label.toLowerCase().includes(x.trim().toLowerCase()))) return "virtual";
  if (BLUETOOTH.test(label)) return "bluetooth";
  return BUILT_IN.test(label) ? "built-in" : "wired";
}

export interface ChooseInput {
  devices: readonly MicDevice[];
  /** The device the person picked, if any. */
  saved?: string | undefined;
  /** The system default input. */
  defaultId?: string | undefined;
  /** Extra name fragments to never pick on their own. */
  exclusions?: readonly string[];
  /** Prefer a built-in or wired input when the default is a headset. */
  avoidBluetooth: boolean;
  /** Inputs that only delivered silence; never picked automatically. */
  silent?: readonly string[];
}

export type MicChoice =
  | {
      kind: "device";
      id: string;
      label: string;
      source: "saved" | "default" | "built-in" | "wired" | "bluetooth";
      /** The saved device is not connected, so another one is used until it returns. */
      fellBack: boolean;
      /** The chosen input is a headset: the call quality tradeoff applies. */
      bluetooth: boolean;
    }
  | { kind: "none"; reason: "no-device" | "built-in-off" };

/**
 * Which input to record from. A saved device always wins, even a virtual one, because the person asked for it; when it is unplugged the choice falls back
 * and returns to it by itself as soon as it is listed again. Without a saved device, virtual, aggregate and phone inputs are never picked, a headset is
 * skipped for a built-in or wired input when asked, and an input that only delivered silence is passed over.
 */
export function chooseMic(input: ChooseInput): MicChoice {
  const { devices, saved, defaultId, avoidBluetooth } = input;
  const exclusions = input.exclusions ?? [];
  const silent = new Set(input.silent ?? []);
  const pick = (d: MicDevice, source: Exclude<MicChoice, { kind: "none" }>["source"], fellBack: boolean): MicChoice => ({
    kind: "device",
    id: d.id,
    label: d.label,
    source,
    fellBack,
    bluetooth: micKind(d, exclusions) === "bluetooth",
  });

  const wanted = saved ? devices.find((d) => d.id === saved) : undefined;
  if (wanted) return pick(wanted, "saved", false);
  const fellBack = !!saved;

  const usable = devices.filter((d) => micKind(d, exclusions) !== "virtual" && !silent.has(d.id));
  const def = usable.find((d) => d.id === defaultId);
  const skipDefault = def && avoidBluetooth && micKind(def, exclusions) === "bluetooth";
  if (def && !skipDefault) return pick(def, "default", fellBack);
  const builtIn = usable.find((d) => micKind(d, exclusions) === "built-in");
  if (builtIn) return pick(builtIn, "built-in", fellBack);
  const wired = usable.find((d) => micKind(d, exclusions) === "wired");
  if (wired) return pick(wired, "wired", fellBack);
  if (def) return pick(def, "bluetooth", fellBack);
  const any = usable[0];
  if (any) return pick(any, "bluetooth", fellBack);
  // A laptop with its lid closed reports no built-in microphone; saying so beats switching to a phone.
  return { kind: "none", reason: devices.length > 0 && devices.every((d) => micKind(d) === "virtual") ? "built-in-off" : "no-device" };
}
