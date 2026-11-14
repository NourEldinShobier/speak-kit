import * as v from "valibot";
import { runCommand } from "../command-narrator/node";
import type { UiNode } from "./labels";

/** Runs a program and gives back what it printed; rejects on a failure or after the time is up. */
export type Run = (file: string, args: string[], timeoutMs: number) => Promise<string>;

/** Which window to read. */
export interface ReadTarget {
  /** The window the recording was pointed at (its native handle), when it was a window; the window in front otherwise. */
  windowHandle?: string | undefined;
  /** This app's own process: its windows (the capsule, the app) are never read. */
  ownPid: number;
}

export interface ContextReader {
  /** The controls of the window, or undefined when the system would not say (no permission, no window, a timeout) or the window is this app's own. */
  read(target: ReadTarget): Promise<UiNode[] | undefined>;
}

/** The native window handle inside a capture source id ("window:123456:0"), or undefined for a screen or an area. */
export const handleOfSource = (sourceId: string | undefined): string | undefined => /^window:(\d{1,20}):/.exec(sourceId ?? "")?.[1];

const MAX_NODES = 400;
const MAX_DEPTH = 8;
const TIMEOUT_MS = 6000;

/**
 * Windows UI Automation: walks the window in front breadth-limited and prints one JSON array. Only the name and the password flag of each control
 * are asked for; no value or text pattern is ever read.
 */
export const windowsScript = (t: ReadTarget): string => `
Add-Type -AssemblyName UIAutomationClient
Add-Type -Namespace SK -Name Win -MemberDefinition '[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);'
$h = ${t.windowHandle ? `[System.IntPtr][long]${Number(t.windowHandle)}` : "[SK.Win]::GetForegroundWindow()"}
if ($h -eq [System.IntPtr]::Zero) { '[]'; exit }
$owner = [uint32]0
[void][SK.Win]::GetWindowThreadProcessId($h, [ref]$owner)
if ($owner -eq ${Math.trunc(t.ownPid)}) { '[]'; exit }
$root = [System.Windows.Automation.AutomationElement]::FromHandle($h)
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$out = New-Object System.Collections.ArrayList
function Walk($el, $depth) {
  if ($script:out.Count -ge ${MAX_NODES} -or $depth -gt ${MAX_DEPTH}) { return }
  $c = $el.Current
  [void]$script:out.Add(@{ role = $c.ControlType.ProgrammaticName; name = $c.Name; secure = [bool]$c.IsPassword; depth = $depth })
  if ($c.IsPassword) { return }
  $child = $walker.GetFirstChild($el)
  while ($child -ne $null) { Walk $child ($depth + 1); $child = $walker.GetNextSibling($child) }
}
Walk $root 0
ConvertTo-Json -InputObject @($out) -Compress -Depth 4
`;

/** macOS Accessibility through System Events: the window in front, roles, names and the secure-field subrole; values are not read. */
export const macScript = (t: ReadTarget): string => `
const se = Application('System Events');
const out = [];
function attempt(f, fallback) {
  try { return f(); } catch (e) { return fallback; }
}
function walk(el, depth) {
  if (out.length >= ${MAX_NODES} || depth > ${MAX_DEPTH}) return;
  const role = attempt(() => el.role(), '');
  const name = attempt(() => el.name() || el.title() || el.description() || '', '');
  const secure = attempt(() => el.subrole() === 'AXSecureTextField', false);
  out.push({ role: role, name: name, secure: secure, depth: depth });
  if (secure) return;
  for (const k of attempt(() => el.uiElements(), [])) walk(k, depth + 1);
}
const front = se.processes.whose({ frontmost: true })[0];
const wins = front.unixId() === ${Math.trunc(t.ownPid)} ? [] : front.windows();
if (wins.length) walk(wins[0], 0);
JSON.stringify(out);
`;

const nodesSchema = v.array(
  v.object({
    role: v.string(),
    name: v.optional(v.nullable(v.string())),
    secure: v.optional(v.boolean()),
    depth: v.pipe(v.number(), v.integer(), v.minValue(0)),
  }),
);

/** The nodes in the printed JSON, or undefined when it is not a list of controls. A single control printed as an object counts as a list of one. */
export function parseNodes(text: string): UiNode[] | undefined {
  let json: unknown;
  try {
    json = JSON.parse(text.trim());
  } catch {
    return undefined;
  }
  const parsed = v.safeParse(nodesSchema, Array.isArray(json) ? json : [json]);
  if (!parsed.success) return undefined;
  return parsed.output.slice(0, MAX_NODES).map((n) => ({ role: n.role, name: n.name ?? undefined, secure: n.secure, depth: n.depth }));
}

const COMMANDS: Record<string, (t: ReadTarget) => readonly [string, string[]]> = {
  win32: (t) => ["powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", windowsScript(t)]],
  darwin: (t) => ["osascript", ["-l", "JavaScript", "-e", macScript(t)]],
};

/** The reader for this system, or undefined where there is none. `run` is the way programs are started (tests give a fake). */
export function createContextReader(os: string, run: Run = runCommand): ContextReader | undefined {
  const via = COMMANDS[os];
  if (!via) return undefined;
  return {
    async read(target) {
      try {
        const [file, args] = via(target);
        return parseNodes(await run(file, args, TIMEOUT_MS));
      } catch {
        // no permission, no window or too slow: the capture goes on without context
        return undefined;
      }
    },
  };
}
