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

/** What a field read gives: the text, or the answer that the field is a password field, which nothing may be read or copied from. */
export type FieldValue = { text: string } | { password: true };

/** The reader the app calls: the context around the caret, or undefined when the focused field cannot be read. Never rejects. */
export interface CaretReader {
  /** Starts the helper ahead of the first dictation, so the first read is not slow. */
  warm(): void;
  read(): Promise<CaretContext | undefined>;
  /** The whole text of the focused field, read once on request; a password field says so, and undefined is a field that cannot be read. */
  readValue(): Promise<FieldValue | undefined>;
  dispose(): void;
}

/** Most characters of a field one read returns; the dictation is looked for in these. */
const VALUE_CAP = 200_000;

// UI Automation text pattern: the caret is the empty selection; one character to its left is the character before it. "value" reads the whole field instead.
const WINDOWS_LOOP = String.raw`
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
[Console]::Out.WriteLine('ready')
while (($l = [Console]::In.ReadLine()) -ne $null) {
  $out = 'unreadable'
  try {
    $e = [System.Windows.Automation.AutomationElement]::FocusedElement
    $p = $null
    if ($l -eq 'value') {
      $t = $null
      if ($e.Current.IsPassword) { $out = 'password' }
      elseif ($e.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$p)) { $t = $p.Current.Value }
      elseif ($e.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$p)) { $t = $p.DocumentRange.GetText(${VALUE_CAP}) }
      if ($t -ne $null) { $out = 'value:' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($t)) }
    }
    elseif ($e.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$p)) {
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

const MAC_VALUE_SCRIPT = `tell application "System Events"
  try
    set p to first application process whose frontmost is true
    set el to value of attribute "AXFocusedUIElement" of p
    if (value of attribute "AXSubrole" of el) is "AXSecureTextField" then return "password"
    return "value:" & (value of attribute "AXValue" of el)
  on error
    return "unreadable"
  end try
end tell`;

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

/** The helper's answer to a field read: the text, a password verdict, or undefined for anything it does not recognise. */
export function parseValue(line: string, platform: NodeJS.Platform): FieldValue | undefined {
  const text = line.replace(/\r?\n$/, "");
  if (text === "password") return { password: true };
  if (!text.startsWith("value:")) return undefined;
  const body = text.slice("value:".length);
  const out = platform === "win32" ? Buffer.from(body, "base64").toString("utf8") : body;
  return { text: out.slice(0, VALUE_CAP) };
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
    ask(line = "read", ms = timeoutMs): Promise<string> {
      const p = open();
      return new Promise<string>((resolve) => {
        const timer = setTimeout(() => {
          p.kill();
          resolve("unreadable");
        }, ms);
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

/** A whole field is longer than one character, and a long document takes a moment. */
const VALUE_MS = 2000;

export function createCaretReader({ platform, start, once, timeoutMs = 600 }: Deps): CaretReader {
  const helper = createLineClient(start, timeoutMs);
  const oneShot = (script: string, ms: number) => Promise.race([once(script), new Promise<string>((r) => setTimeout(() => r("unreadable"), ms))]);
  return {
    warm() {
      if (platform === "win32") helper.open();
    },
    async read() {
      try {
        if (platform === "win32") return parseCaret(await helper.ask());
        if (platform === "darwin") return parseCaret(await oneShot(MAC_SCRIPT, timeoutMs));
      } catch {
        // an unreadable field is not an error
      }
      return undefined;
    },
    async readValue() {
      try {
        if (platform === "win32") return parseValue(await helper.ask("value", VALUE_MS), platform);
        if (platform === "darwin") return parseValue(await oneShot(MAC_VALUE_SCRIPT, VALUE_MS), platform);
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
