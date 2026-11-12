import { describe, expect, it } from "vite-plus/test";
import { appNameOfPath, macosPlatform, parseWindows, type CoreAudio } from "./macos";
import type { Exec } from "./types";
import { exeOfConsentKey, micUsersOf, parseConsent, parseProcesses, windowsPlatform } from "./windows";

const KEY = String.raw`HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone`;

const consent = `
${KEY}
    Value    REG_SZ    Allow

${KEY}\\NonPackaged

${KEY}\\NonPackaged\\C:#Program Files#Zoom#bin#Zoom.exe
    LastUsedTimeStart    REG_QWORD    0x1dc5a1b2c3d4e5f
    LastUsedTimeStop    REG_QWORD    0x0

${KEY}\\NonPackaged\\C:#Windows#System32#SoundRecorder.exe
    LastUsedTimeStart    REG_QWORD    0x1dc5a1b2c3d4e5f
    LastUsedTimeStop    REG_QWORD    0x1dc5a1b2c3d9999

${KEY}\\MSTeams_8wekyb3d8bbwe
    LastUsedTimeStart    REG_QWORD    0x1dc5a1b2c3d4e5f
    LastUsedTimeStop    REG_QWORD    0x0

${KEY}\\NonPackaged\\C:#Program Files#Google#Chrome#Application#chrome.exe
    LastUsedTimeStart    REG_QWORD    0x0
    LastUsedTimeStop    REG_QWORD    0x0
`;

describe("Windows microphone use", () => {
  it("names the programs whose microphone use has not stopped", () => {
    expect(parseConsent(consent)).toEqual(["zoom", "msteams"]);
  });

  it("reads nothing from empty or unrelated output", () => {
    expect(parseConsent("")).toEqual([]);
    expect(parseConsent("ERROR: The system was unable to find the specified registry key")).toEqual([]);
  });

  it("names a desktop program by its file and a store app by its package", () => {
    expect(exeOfConsentKey(`${KEY}\\NonPackaged\\C:#Users#me#AppData#Local#Discord#app-1#Discord.exe`)).toBe("discord");
    expect(exeOfConsentKey(`${KEY}\\MSTeams_8wekyb3d8bbwe`)).toBe("msteams");
  });

  it("reads the process list for one process and for many, and drops rows it cannot use", () => {
    expect(parseProcesses('{"Id":4,"ProcessName":"Zoom","MainWindowTitle":"Zoom Meeting"}')).toEqual([{ pid: 4, exe: "zoom", title: "Zoom Meeting" }]);
    expect(parseProcesses('[{"Id":1,"ProcessName":"a","MainWindowTitle":null},{"Id":"x"},null]')).toEqual([{ pid: 1, exe: "a", title: "" }]);
    expect(parseProcesses("not json")).toEqual([]);
  });

  it("picks the process with a window for a program that has several", () => {
    const procs = [
      { pid: 1, exe: "chrome", title: "" },
      { pid: 2, exe: "chrome", title: "Meet - abc-defg-hij - Google Chrome" },
    ];
    expect(micUsersOf(["chrome", "gone"], procs)).toEqual([{ pid: 2, exe: "chrome" }]);
  });

  const exec =
    (answers: Record<string, string | Error>): Exec =>
    async (file) => {
      const a = answers[file];
      if (a instanceof Error) throw a;
      if (a === undefined) throw new Error("not found");
      return a;
    };

  it("probes with the consent list and one process listing, only when something uses the microphone", async () => {
    const calls: string[] = [];
    const p = windowsPlatform(async (file) => {
      calls.push(file);
      return file === "reg.exe" ? consent : '[{"Id":10,"ProcessName":"Zoom","MainWindowTitle":"Zoom Meeting"},{"Id":11,"ProcessName":"notepad","MainWindowTitle":""}]';
    });
    expect(await p.probe()).toEqual({ micUsers: [{ pid: 10, exe: "zoom" }], windows: [{ pid: 10, exe: "zoom", title: "Zoom Meeting" }] });
    expect(calls).toEqual(["reg.exe", "powershell.exe"]);
    const idle: string[] = [];
    const q = windowsPlatform(async (file) => (idle.push(file), file === "reg.exe" ? `${KEY}\n    Value    REG_SZ    Allow` : ""));
    expect(await q.probe()).toEqual({ micUsers: [], windows: [] });
    expect(idle).toEqual(["reg.exe"]);
  });

  it("answers an empty probe when the system cannot be read", async () => {
    expect(await windowsPlatform(exec({ "reg.exe": new Error("denied") })).probe()).toEqual({ micUsers: [], windows: [] });
  });

  it("says what Windows cannot tell: the call app's microphone and output", async () => {
    const p = windowsPlatform(exec({}));
    expect(p.capabilities()).toEqual({ platform: "win32", systemAudio: "available", callDetection: "available", micFollowsCallApp: "unavailable", callAppOutput: "unavailable" });
    expect(await p.callAppMic({ pid: 1, exe: "zoom" })).toBeNull();
  });
});

describe("macOS microphone use", () => {
  it("names an app from its program path, a browser helper as the browser", () => {
    expect(appNameOfPath("/Applications/zoom.us.app/Contents/MacOS/zoom.us")).toBe("zoom.us");
    expect(appNameOfPath("/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Helpers/Google Chrome Helper.app/Contents/MacOS/Google Chrome Helper")).toBe(
      "google chrome",
    );
    expect(appNameOfPath("/usr/sbin/coreaudiod")).toBe("coreaudiod");
  });

  it("reads window titles, several windows of one app giving several rows", () => {
    expect(parseWindows('[{"pid":7,"name":"Slack","titles":["Huddle with Priya","General"]},{"pid":8,"name":"Finder","titles":[]}]')).toEqual([
      { pid: 7, exe: "slack", title: "Huddle with Priya" },
      { pid: 7, exe: "slack", title: "General" },
    ]);
    expect(parseWindows("oops")).toEqual([]);
  });

  const audio = (pids: number[] | Error): CoreAudio => ({
    processesUsingInput() {
      if (pids instanceof Error) throw pids;
      return pids;
    },
  });
  const run: Exec = async (file, args) =>
    file === "/bin/ps" ? `/Applications/zoom.us.app/Contents/MacOS/zoom.us pid${args[1]}\n`.replace(/ pid\d+\n/, "\n") : '[{"pid":5,"name":"zoom.us","titles":["Zoom Meeting"]}]';

  it("finds who runs an input, names them, and reads titles", async () => {
    const p = macosPlatform({ exec: run, audio: async () => audio([5]) });
    expect(await p.probe()).toEqual({ micUsers: [{ pid: 5, exe: "zoom.us" }], windows: [{ pid: 5, exe: "zoom.us", title: "Zoom Meeting" }] });
    expect(p.capabilities().callDetection).toBe("available");
  });

  it("still finds native apps when titles cannot be read (no Accessibility)", async () => {
    const p = macosPlatform({
      exec: async (file) => {
        if (file === "/bin/ps") return "/Applications/zoom.us.app/Contents/MacOS/zoom.us\n";
        throw new Error("not allowed");
      },
      audio: async () => audio([5]),
    });
    expect(await p.probe()).toEqual({ micUsers: [{ pid: 5, exe: "zoom.us" }], windows: [] });
  });

  it("reports detection as unavailable when CoreAudio refuses the question", async () => {
    const p = macosPlatform({ exec: run, audio: async () => audio(new Error("older macOS")) });
    expect(await p.probe()).toEqual({ micUsers: [], windows: [] });
    expect(p.capabilities().callDetection).toBe("unavailable");
  });

  it("skips a process that ended before its name was read, and probes nothing when no input runs", async () => {
    const ended = macosPlatform({
      exec: async () => {
        throw new Error("no such process");
      },
      audio: async () => audio([5]),
    });
    expect(await ended.probe()).toEqual({ micUsers: [], windows: [] });
    const quiet = macosPlatform({ exec: run, audio: async () => audio([]) });
    expect(await quiet.probe()).toEqual({ micUsers: [], windows: [] });
  });
});
