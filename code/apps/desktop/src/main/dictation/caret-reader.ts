import { execFile, spawn } from "node:child_process";
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

/** Asks a line-per-answer helper one question at a time. A helper that does not answer in time is killed and started again by the next read. */
export function createLineClient(start: () => LineProcess, timeoutMs: number) {
  let proc: LineProcess | undefined;
  let ready = false;
  const waiting: ((line: string) => void)[] = [];

  const open = (): LineProcess => {
    if (proc) return proc;
    const p = (proc = start());
    p.onLine((line) => {
      if (ready) waiting.shift()?.(line);
      else ready = line.trim() === "ready";
    });
    p.onExit(() => {
      if (proc === p) proc = undefined;
      ready = false;
      for (const settle of waiting.splice(0)) settle("unreadable");
    });
    return p;
  };

  return {
    open,
    ask(line = "read"): Promise<string> {
      const p = open();
      return new Promise<string>((resolve) => {
        const timer = setTimeout(() => {
          p.kill();
          resolve("unreadable");
        }, timeoutMs);
        waiting.push((line) => {
          clearTimeout(timer);
          resolve(line);
        });
        p.write(line);
      });
    },
    close() {
      proc?.kill();
      proc = undefined;
    },
  };
}

export function createCaretReader({ platform, start, once, timeoutMs = 600 }: Deps): CaretReader {
  const helper = createLineClient(start, timeoutMs);
  const oneShot = () => Promise.race([once(MAC_SCRIPT), new Promise<string>((r) => setTimeout(() => r("unreadable"), timeoutMs))]);
  return {
    warm() {
      if (platform === "win32") helper.open();
    },
    async read() {
      try {
        if (platform === "win32") return parseCaret(await helper.ask());
        if (platform === "darwin") return parseCaret(await oneShot());
      } catch {
        // an unreadable field is not an error
      }
      return undefined;
    },
    dispose: helper.close,
  };
}

const NL = String.fromCharCode(10);

/** The real helpers: PowerShell kept alive on Windows (the script goes in the command line, so no file is written), osascript per read on macOS. */
export function systemCaretReader(): CaretReader {
  return createCaretReader({
    platform: process.platform,
    start: () => spawnPowerShellLoop(WINDOWS_LOOP),
    once: osascript,
  });
}

/** Runs one AppleScript and gives what it printed. */
export const osascript = (script: string, timeout = 1500): Promise<string> =>
  new Promise((resolve, reject) => execFile("osascript", ["-e", script], { timeout, env: launchEnv() }, (err, out) => (err ? reject(err) : resolve(out))));

/** PowerShell kept alive with a script that answers one line per line; the script goes in the command line, so no file is written. */
export function spawnPowerShellLoop(script: string): LineProcess {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
    env: launchEnv(),
    windowsHide: true,
    stdio: ["pipe", "pipe", "ignore"],
  });
  let buffer = "";
  let lines: (line: string) => void = () => undefined;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (d: string) => {
    buffer += d;
    for (let i = buffer.indexOf(NL); i >= 0; i = buffer.indexOf(NL)) {
      lines(buffer.slice(0, i).trimEnd());
      buffer = buffer.slice(i + 1);
    }
  });
  child.stdin.on("error", () => undefined);
  return {
    write: (line) => void child.stdin.write(line + NL),
    onLine: (fn) => void (lines = fn),
    onExit: (fn) => void child.once("exit", fn),
    kill: () => void child.kill(),
  };
}
