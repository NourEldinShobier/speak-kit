import type { MicUser, OpenWindow, Probe } from "@speakkit/meetings";
import type { Exec, MeetingsPlatform } from "./types";

/** The CoreAudio calls the probe needs, typed, so a test can stand in for the system. */
export interface CoreAudio {
  /** Process ids that have an audio input running (macOS 14.2 and later). Throws when the system does not know the question. */
  processesUsingInput(): number[];
  /** The name of the first input device the process has open, or null when it has none. Throws when the system refuses the question. */
  inputDeviceName(pid: number): string | null;
}

type Koffi = (typeof import("koffi"))["default"];

const CA_PATH = "/System/Library/Frameworks/CoreAudio.framework/CoreAudio";
const fourcc = (s: string) => (s.charCodeAt(0) << 24) | (s.charCodeAt(1) << 16) | (s.charCodeAt(2) << 8) | s.charCodeAt(3);
const SYSTEM_OBJECT = 1;
const GLOBAL = fourcc("glob");
const PROCESS_LIST = fourcc("prs#");
const PROCESS_PID = fourcc("ppid");
const PROCESS_RUNNING_INPUT = fourcc("piri");
const PROCESS_DEVICES = fourcc("pdv#");
const INPUT_SCOPE = fourcc("inpt");
const OBJECT_NAME = fourcc("lnam");
const CF_PATH = "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation";
const UTF8 = 0x08000100;

/**
 * CoreAudio through koffi: the list of audio processes, and for each its process id and whether it runs an input. Untested on a real Mac in this build:
 * any failure (an older macOS, a refused call) throws, and the platform then reports detection as unavailable instead of guessing.
 */
export function loadCoreAudio(koffi: Koffi): CoreAudio {
  const lib = koffi.load(CA_PATH);
  koffi.struct("SpeakKitAudioObjectPropertyAddress", { selector: "uint32", scope: "uint32", element: "uint32" });
  const getSize = lib.func("int AudioObjectGetPropertyDataSize(uint32 object, SpeakKitAudioObjectPropertyAddress *address, uint32 qualifierSize, void *qualifier, uint32 *size)");
  const getData = lib.func("int AudioObjectGetPropertyData(uint32 object, SpeakKitAudioObjectPropertyAddress *address, uint32 qualifierSize, void *qualifier, uint32 *size, void *data)");
  const cf = koffi.load(CF_PATH);
  const getString = cf.func("bool CFStringGetCString(void *s, _Out_ uint8_t *buf, long size, uint32 encoding)");
  const release = cf.func("void CFRelease(void *s)");
  const read = (object: number, selector: number, bytes: number, scope = GLOBAL): Buffer => {
    const addr = { selector, scope, element: 0 };
    const size = [bytes];
    const buf = Buffer.alloc(bytes);
    if (getData(object, addr, 0, null, size, buf) !== 0) throw new Error("CoreAudio refused the question");
    return buf;
  };
  const sizeOf = (object: number, selector: number, scope: number): number => {
    const size = [0];
    return getSize(object, { selector, scope, element: 0 }, 0, null, size) === 0 ? (size[0] ?? 0) : 0;
  };
  const nameOf = (device: number): string | null => {
    const ref = koffi.decode(read(device, OBJECT_NAME, 8), "void *");
    if (!ref) return null;
    try {
      const out = Buffer.alloc(256);
      return getString(ref, out, out.length, UTF8) ? out.toString("utf8", 0, out.indexOf(0)) : null;
    } finally {
      release(ref);
    }
  };
  const processList = (): Buffer => {
    const bytes = sizeOf(SYSTEM_OBJECT, PROCESS_LIST, GLOBAL);
    return bytes ? read(SYSTEM_OBJECT, PROCESS_LIST, bytes) : Buffer.alloc(0);
  };
  return {
    inputDeviceName(pid) {
      const list = processList();
      for (let i = 0; i + 4 <= list.length; i += 4) {
        const object = list.readUInt32LE(i);
        if (read(object, PROCESS_PID, 4).readInt32LE(0) !== pid) continue;
        const bytes = sizeOf(object, PROCESS_DEVICES, INPUT_SCOPE);
        if (bytes < 4) return null;
        return nameOf(read(object, PROCESS_DEVICES, bytes, INPUT_SCOPE).readUInt32LE(0));
      }
      return null;
    },
    processesUsingInput() {
      const addr = { selector: PROCESS_LIST, scope: GLOBAL, element: 0 };
      const size = [0];
      if (getSize(SYSTEM_OBJECT, addr, 0, null, size) !== 0) throw new Error("no process list");
      const bytes = size[0] ?? 0;
      const list = bytes ? read(SYSTEM_OBJECT, PROCESS_LIST, bytes) : Buffer.alloc(0);
      const pids: number[] = [];
      for (let i = 0; i + 4 <= list.length; i += 4) {
        const object = list.readUInt32LE(i);
        if (read(object, PROCESS_RUNNING_INPUT, 4).readUInt32LE(0) !== 0) pids.push(read(object, PROCESS_PID, 4).readInt32LE(0));
      }
      return pids;
    },
  };
}

/** The app name in a program path: the outermost bundle, so a browser's helper process is the browser ("Google Chrome.app/.../Google Chrome Helper"). */
export function appNameOfPath(path: string): string {
  const m = /([^/]+)\.app(?:\/|$)/.exec(path);
  return (m?.[1] ?? path.slice(path.lastIndexOf("/") + 1)).trim().toLowerCase();
}

interface Row {
  pid: number;
  name: string;
  titles: string[];
}

const WINDOWS_SCRIPT = `const se = Application("System Events");
JSON.stringify(se.processes.whose({ backgroundOnly: false })().map((p) => ({ pid: p.unixId(), name: p.name(), titles: (() => { try { return p.windows().map((w) => w.name()); } catch (e) { return []; } })() })))`;

/** The window titles as the script printed them. Several windows of one app give several rows. */
export function parseWindows(out: string): OpenWindow[] {
  let rows: Row[];
  try {
    rows = JSON.parse(out) as Row[];
  } catch {
    return [];
  }
  return (Array.isArray(rows) ? rows : []).flatMap((r) =>
    typeof r?.pid === "number" && typeof r.name === "string" ? (r.titles ?? []).filter((t) => typeof t === "string" && t).map((title) => ({ pid: r.pid, exe: r.name.toLowerCase(), title })) : [],
  );
}

export interface MacDeps {
  exec: Exec;
  audio: () => Promise<CoreAudio>;
}

/**
 * macOS: CoreAudio says which processes run an input (14.2 and later), `ps` names them, and System Events gives window titles (it needs Accessibility, which
 * dictation asks for anyway; without it only native apps are found, by program name). The system's own sound is asked of the engine; when it gives none the recording says so and keeps the microphone track. The
 * microphone a call app uses is named by CoreAudio (14.2 and later); the output it plays to is not, so the whole system sound is recorded.
 */
export function macosPlatform(d: MacDeps): MeetingsPlatform {
  let audio: CoreAudio | undefined;
  let usable = true;
  let named = true;
  const input = async (): Promise<number[]> => {
    try {
      audio ??= await d.audio();
      return audio.processesUsingInput();
    } catch {
      usable = false;
      return [];
    }
  };
  return {
    capabilities: () => ({
      platform: "darwin",
      systemAudio: "available",
      callDetection: usable ? "available" : "unavailable",
      micFollowsCallApp: usable && named ? "available" : "unavailable",
      callAppOutput: "unavailable",
    }),
    async probe(): Promise<Probe> {
      const pids = await input();
      if (!pids.length) return { micUsers: [], windows: [] };
      const micUsers: MicUser[] = [];
      for (const pid of pids) {
        try {
          const path = (await d.exec("/bin/ps", ["-p", String(pid), "-o", "comm="], 3000)).trim();
          if (path) micUsers.push({ pid, exe: appNameOfPath(path) });
        } catch {
          /* the process ended */
        }
      }
      let windows: OpenWindow[] = [];
      try {
        windows = parseWindows(await d.exec("/usr/bin/osascript", ["-l", "JavaScript", "-e", WINDOWS_SCRIPT], 8000));
      } catch {
        /* no Accessibility: native apps are still found by name */
      }
      return { micUsers, windows };
    },
    async callAppMic({ pid }) {
      try {
        audio ??= await d.audio();
        return audio.inputDeviceName(pid);
      } catch {
        named = false;
        return null;
      }
    },
  };
}
