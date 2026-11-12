import { describe, expect, it } from "vite-plus/test";
import { macCommandLine, windowsCommandLine, type MacBoundary, type WindowsBoundary } from "./index";
import { addEntry, hasEntry, removeEntry } from "./path-list";
import { parseRegQuery } from "./real";

describe("PATH list editing", () => {
  it("adds one entry at the end, keeps every other entry as written and never adds twice", () => {
    expect(addEntry("C:\\a;%USERPROFILE%\\b", "C:\\app\\bin", ";")).toBe("C:\\a;%USERPROFILE%\\b;C:\\app\\bin");
    expect(addEntry("C:\\a;C:\\APP\\bin\\", "c:\\app\\bin", ";")).toBe("C:\\a;C:\\APP\\bin\\");
    expect(addEntry("", "C:\\app\\bin", ";")).toBe("C:\\app\\bin");
    expect(addEntry("C:\\a;;", "C:\\x", ";")).toBe("C:\\a;C:\\x");
  });
  it("removes only that entry, without regard to case or a trailing slash on Windows", () => {
    expect(removeEntry("C:\\a;C:\\APP\\bin\\;%X%", "c:\\app\\bin", ";")).toBe("C:\\a;%X%");
    expect(removeEntry("C:\\a", "C:\\none", ";")).toBe("C:\\a");
    expect(hasEntry("/usr/bin:/opt/x", "/OPT/x", ":")).toBe(false);
    expect(hasEntry("/usr/bin:/opt/x/", "/opt/x", ":")).toBe(true);
  });
  it("reads the Path value from reg query output", () => {
    expect(parseRegQuery("\r\nHKEY_CURRENT_USER\\Environment\r\n    Path    REG_EXPAND_SZ    C:\\a;%USERPROFILE%\\b\r\n\r\n")).toBe("C:\\a;%USERPROFILE%\\b");
    expect(parseRegQuery("    Path    REG_SZ    C:\\a")).toBe("C:\\a");
    expect(parseRegQuery("ERROR: The system was unable to find the specified registry key or value.")).toBeUndefined();
  });
});

function win(initial: string | undefined, marker: string | undefined, files: string[] = []) {
  const s = { path: initial, marker, files: new Set(files), writes: [] as string[] };
  const b: WindowsBoundary = {
    readPath: async () => s.path,
    writePath: async (v) => void (s.writes.push(v), (s.path = v)),
    marker: { read: async () => s.marker, write: async (d) => void (s.marker = d), clear: async () => void (s.marker = undefined) },
    exists: async (f) => s.files.has(f),
  };
  return { s, b };
}
const DIR = "C:\\Apps\\Speak Kit\\resources\\bin";

describe("Windows command-line tool", () => {
  it("is not available in a build run from source", async () => {
    expect(await windowsCommandLine({ dir: undefined }, win("", undefined).b).status()).toMatchObject({ kind: "unavailable" });
    expect(await windowsCommandLine({ dir: undefined }, win("", undefined).b).install()).toMatchObject({ kind: "unavailable" });
  });

  it("goes from not installed to installed with only its folder added, and back with the rest of the PATH untouched", async () => {
    const w = win("C:\\a;%USERPROFILE%\\bin", undefined, [`${DIR}\\speakkit.cmd`]);
    const cli = windowsCommandLine({ dir: DIR }, w.b);
    expect(await cli.status()).toEqual({ kind: "not-installed" });
    expect(await cli.install()).toEqual({ kind: "installed", where: DIR });
    expect(w.s.path).toBe(`C:\\a;%USERPROFILE%\\bin;${DIR}`);
    expect(await cli.remove()).toEqual({ kind: "not-installed" });
    expect(w.s.path).toBe("C:\\a;%USERPROFILE%\\bin");
    expect(w.s.marker).toBeUndefined();
  });

  it("installing twice leaves one entry", async () => {
    const w = win(undefined, undefined, [`${DIR}\\speakkit.cmd`]);
    const cli = windowsCommandLine({ dir: DIR }, w.b);
    await cli.install();
    await cli.install();
    expect(w.s.writes).toEqual([DIR, DIR]);
    expect(w.s.path).toBe(DIR);
  });

  it("asks for a repair when the launcher is gone, the entry was removed or the app moved, and a repair fixes each", async () => {
    const OLD = "D:\\Old\\resources\\bin";
    const moved = win(`C:\\a;${OLD}`, OLD, [`${DIR}\\speakkit.cmd`]);
    const cli = windowsCommandLine({ dir: DIR }, moved.b);
    expect(await cli.status()).toEqual({ kind: "needs-repair", why: "Speak Kit was moved since the command-line tool was installed." });
    expect(await cli.install()).toEqual({ kind: "installed", where: DIR });
    expect(moved.s.path).toBe(`C:\\a;${DIR}`);

    const gone = win("C:\\a", DIR, [`${DIR}\\speakkit.cmd`]);
    expect(await windowsCommandLine({ dir: DIR }, gone.b).status()).toEqual({ kind: "needs-repair", why: "The folder is no longer on your PATH." });

    const nofile = win(DIR, DIR, []);
    expect(await windowsCommandLine({ dir: DIR }, nofile.b).status()).toEqual({ kind: "needs-repair", why: "The launcher file is missing." });
  });

  it("remove clears a stale marker entry too", async () => {
    const w = win("C:\\a;D:\\Old\\bin", "D:\\Old\\bin", []);
    expect(await windowsCommandLine({ dir: DIR }, w.b).remove()).toEqual({ kind: "not-installed" });
    expect(w.s.path).toBe("C:\\a");
  });
});

function mac(files: Record<string, string>, onPath: string[], unwritable: string[] = []) {
  const s = { files: { ...files } };
  const b: MacBoundary = {
    pathFolders: () => onPath,
    read: async (f) => s.files[f],
    writeExecutable: async (f, t) => {
      if (unwritable.some((d) => f.startsWith(`${d}/`))) throw new Error("EACCES");
      s.files[f] = t;
    },
    remove: async (f) => void delete s.files[f],
  };
  return { s, b };
}
const SHIM = "/Applications/Speak Kit.app/Contents/Resources/bin/speakkit";

describe("macOS command-line tool", () => {
  it("writes a launcher in /usr/local/bin that runs the shipped script by full path", async () => {
    const m = mac({}, ["/usr/local/bin"]);
    const cli = macCommandLine({ shim: SHIM, home: "/Users/a" }, m.b);
    expect(await cli.status()).toEqual({ kind: "not-installed" });
    expect(await cli.install()).toEqual({ kind: "installed", where: "/usr/local/bin/speakkit" });
    expect(m.s.files["/usr/local/bin/speakkit"]).toBe(`#!/bin/sh\nexec "${SHIM}" "$@"\n`);
  });

  it("falls back to the person's own folder and says when it is not on the PATH", async () => {
    const m = mac({}, ["/usr/bin"], ["/usr/local/bin"]);
    const cli = macCommandLine({ shim: SHIM, home: "/Users/a" }, m.b);
    expect(await cli.install()).toEqual({ kind: "needs-path", where: "/Users/a/.local/bin/speakkit", folder: "/Users/a/.local/bin" });
  });

  it("reports when no folder can be written", async () => {
    const m = mac({}, [], ["/usr/local/bin", "/Users/a/.local/bin"]);
    expect(await macCommandLine({ shim: SHIM, home: "/Users/a" }, m.b).install()).toEqual({ kind: "needs-repair", why: "No folder for the launcher could be written." });
  });

  it("asks for a repair when the launcher points at another copy, and remove deletes every launcher", async () => {
    const m = mac({ "/usr/local/bin/speakkit": '#!/bin/sh\nexec "/Old/speakkit" "$@"\n' }, ["/usr/local/bin"]);
    const cli = macCommandLine({ shim: SHIM, home: "/Users/a" }, m.b);
    expect(await cli.status()).toMatchObject({ kind: "needs-repair" });
    expect(await cli.install()).toMatchObject({ kind: "installed" });
    expect(await cli.remove()).toEqual({ kind: "not-installed" });
    expect(m.s.files).toEqual({});
  });

  it("is not available without the shipped script", async () => {
    expect(await macCommandLine({ shim: undefined, home: "/h" }, mac({}, []).b).status()).toMatchObject({ kind: "unavailable" });
  });
});
