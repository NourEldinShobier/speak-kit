import type { MicUser, OpenWindow, Probe } from "@speakkit/meetings";
import type { Exec, MeetingsPlatform } from "./types";

const CONSENT = String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone`;

/** The program name an entry of the microphone consent list stands for: the file name of a desktop program, the package name of a store app. */
export function exeOfConsentKey(key: string): string {
  const name = key.slice(key.lastIndexOf("\\") + 1);
  if (key.includes("\\NonPackaged\\")) return (name.split("#").pop() ?? name).toLowerCase().replace(/\.exe$/, "");
  return (name.split("_")[0] ?? name).toLowerCase();
}

/**
 * Programs using the microphone now, from the consent list Windows keeps for the privacy page: an entry whose "last used stop" time is 0 is still using it.
 * `reg query /s` prints each key as a header line followed by its values.
 */
export function parseConsent(out: string): string[] {
  const exes = new Set<string>();
  let key = "";
  let start = 0n;
  let stop = -1n;
  const flush = () => {
    if (key && start > 0n && stop === 0n) exes.add(exeOfConsentKey(key));
  };
  for (const raw of out.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^HKEY_/i.test(line)) {
      flush();
      key = line;
      start = 0n;
      stop = -1n;
      continue;
    }
    const m = /^(LastUsedTimeStart|LastUsedTimeStop)\s+REG_QWORD\s+(0x[0-9a-f]+)/i.exec(line);
    if (m) m[1]!.toLowerCase().endsWith("start") ? (start = BigInt(m[2]!)) : (stop = BigInt(m[2]!));
  }
  flush();
  return [...exes];
}

interface ProcessRow {
  Id: number;
  ProcessName: string;
  MainWindowTitle: string;
}

/** The process list as the shell printed it: a single object when there is one process, an array otherwise. */
export function parseProcesses(out: string): OpenWindow[] {
  let rows: unknown;
  try {
    rows = JSON.parse(out);
  } catch {
    return [];
  }
  const list = (Array.isArray(rows) ? rows : [rows]) as Partial<ProcessRow>[];
  return list.flatMap((r) =>
    typeof r?.Id === "number" && typeof r.ProcessName === "string" ? [{ pid: r.Id, exe: r.ProcessName.toLowerCase(), title: typeof r.MainWindowTitle === "string" ? r.MainWindowTitle : "" }] : [],
  );
}

/** One microphone user per program: the process that has a window, else the first. */
export function micUsersOf(exes: readonly string[], procs: readonly OpenWindow[]): MicUser[] {
  return exes.flatMap((exe) => {
    const own = procs.filter((p) => p.exe === exe);
    const pick = own.find((p) => p.title) ?? own[0];
    return pick ? [{ pid: pick.pid, exe }] : [];
  });
}

const LIST = "Get-Process | Select-Object Id,ProcessName,MainWindowTitle | ConvertTo-Json -Compress";

/**
 * Windows: the microphone consent list says who is using the microphone (no native code, and it needs no permission), and one process listing gives the
 * window titles. The listing runs only while something is using the microphone. A browser's title is the title of its active tab, so a call in a
 * background tab is found only while its tab is in front. Windows does not say which microphone or output a program uses, so those are not claimed.
 */
export function windowsPlatform(exec: Exec): MeetingsPlatform {
  return {
    capabilities: () => ({ platform: "win32", systemAudio: "available", callDetection: "available", micFollowsCallApp: "unavailable", callAppOutput: "unavailable" }),
    async probe(): Promise<Probe> {
      try {
        const exes = parseConsent(await exec("reg.exe", ["query", CONSENT, "/s"], 4000));
        if (!exes.length) return { micUsers: [], windows: [] };
        const windows = parseProcesses(await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", LIST], 8000));
        return { micUsers: micUsersOf(exes, windows), windows: windows.filter((w) => w.title) };
      } catch {
        return { micUsers: [], windows: [] };
      }
    },
    callAppMic: async () => null,
  };
}
