import { execFile, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CaretContext } from "@speakkit/dictation";
import { launchEnv } from "../system/launch-env";

/** A program that answers one line with one line. */
export interface LineProcess {
  write(line: string): void;
  onLine(fn: (line: string) => void): void;
  onExit(fn: () => void): void;
  kill(): void;
}

/** The reader the app calls: the context around the caret, or undefined when the focused field cannot be read. Never rejects. */
export interface CaretReader {
  /** Starts the helper ahead of the first dictation, so the first read is not slow. */
  warm(): void;
  read(): Promise<CaretContext | undefined>;
  dispose(): void;
}

// UI Automation text pattern: the caret is the empty selection; one character to its left is the character before it.
const WINDOWS_LOOP = String.raw`
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
[Console]::Out.WriteLine('ready')
while (($l = [Console]::In.ReadLine()) -ne $null) {
  $out = 'unreadable'
  try {
    $e = [System.Windows.Automation.AutomationElement]::FocusedElement
    $p = $null
    if ($e.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$p)) {
      $sel = $p.GetSelection()
      if ($sel.Length -gt 0) {
        $r = $sel[0]
        if ($r.GetText(1).Length -gt 0) { $out = 'selected' }
        else {
          $c = $r.Clone()
          $n = $c.MoveEndpointByUnit([System.Windows.Automation.Text.TextPatternRangeEndpoint]::Start, [System.Windows.Automation.Text.TextUnit]::Character, -1)
          if ($n -eq 0) { $out = 'start' } else { $out = 'char:' + [int][char]($c.GetText(1)) }
        }
      }
    }
  } catch { $out = 'unreadable' }
  [Console]::Out.WriteLine($out)
}
`;

const MAC_SCRIPT = `tell application "System Events"
  try
    set p to first application process whose frontmost is true
    set el to value of attribute "AXFocusedUIElement" of p
    set rng to value of attribute "AXSelectedTextRange" of el
    set txt to value of attribute "AXValue" of el
    set loc to item 1 of rng
    set len to item 2 of rng
    if len > 0 then return "selected"
    if loc is 0 then return "start"
    return "char:" & (id of (character loc of txt))
  on error
    return "unreadable"
  end try
end tell`;

/** The helper's answer as a context; anything it does not recognise is unreadable. */
export function parseCaret(line: string): CaretContext | undefined {
  const text = line.trim();
  if (text === "selected") return { before: "", selected: true };
  if (text === "start") return { before: "", selected: false };
  const m = /^char:(\d{1,7})$/.exec(text);
  if (!m) return undefined;
  const code = Number(m[1]);
  return code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? { before: String.fromCodePoint(code), selected: false } : { before: "\u0000", selected: false };
}

interface Deps {
  platform: NodeJS.Platform;
  /** Starts the long-running helper (Windows). */
  start(): LineProcess;
  /** Runs the one-shot script (macOS) and gives what it printed. */
  once(script: string): Promise<string>;
  /** How long one read may take. */
  timeoutMs?: number;
}

export function createCaretReader({ platform, start, once, timeoutMs = 600 }: Deps): CaretReader {
  let proc: LineProcess | undefined;
  let ready = false;
  const waiting: ((line: string) => void)[] = [];

  const open = (): LineProcess => {
    if (proc) return proc;
    const p = (proc = start());
    p.onLine((line) => {
      if (!ready) {
        ready = line.trim() === "ready";
        return;
      }
      waiting.shift()?.(line);
    });
    p.onExit(() => {
      if (proc === p) proc = undefined;
      ready = false;
      for (const settle of waiting.splice(0)) settle("unreadable");
    });
    return p;
  };

  const readWindows = (): Promise<string> => {
    const p = open();
    return new Promise<string>((resolve) => {
      const timer = setTimeout(() => {
        // A helper that does not answer in time may answer later and shift the replies: it is dropped and restarted on the next read.
        p.kill();
        resolve("unreadable");
      }, timeoutMs);
      waiting.push((line) => {
        clearTimeout(timer);
        resolve(line);
      });
      p.write("read");
    });
  };

  return {
    warm() {
      if (platform === "win32") open();
    },
    async read() {
      try {
        if (platform === "win32") return parseCaret(await readWindows());
        if (platform === "darwin") return parseCaret(await Promise.race([once(MAC_SCRIPT), new Promise<string>((r) => setTimeout(() => r("unreadable"), timeoutMs))]));
      } catch {
        // an unreadable field is not an error
      }
      return undefined;
    },
    dispose() {
      proc?.kill();
      proc = undefined;
    },
  };
}

/** The real helpers: PowerShell kept alive on Windows, osascript per read on macOS. */
export function systemCaretReader(): CaretReader {
  return createCaretReader({
    platform: process.platform,
    start() {
      // A script file keeps stdin free for the requests.
      const file = path.join(mkdtempSync(path.join(tmpdir(), "speakkit-caret-")), "caret.ps1");
      writeFileSync(file, WINDOWS_LOOP);
      const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", file], { env: launchEnv(), windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
      let buffer = "";
      let lines: (line: string) => void = () => undefined;
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (d: string) => {
        buffer += d;
        for (let i = buffer.indexOf("\n"); i >= 0; i = buffer.indexOf("\n")) {
          lines(buffer.slice(0, i));
          buffer = buffer.slice(i + 1);
        }
      });
      child.stdin.on("error", () => undefined);
      child.stdin.write(WINDOWS_LOOP + "\n");
      return {
        write: (line) => void child.stdin.write(line + "\n"),
        onLine: (fn) => void (lines = fn),
        onExit: (fn) => void child.once("exit", fn),
        kill: () => void child.kill(),
      };
    },
    once: (script) => new Promise((resolve, reject) => execFile("osascript", ["-e", script], { timeout: 1500, env: launchEnv() }, (err, out) => (err ? reject(err) : resolve(out)))),
  });
}
