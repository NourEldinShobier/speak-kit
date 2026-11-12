import { execFile } from "node:child_process";
import * as v from "valibot";
import type { UiNode } from "./labels";

/** Runs a program and gives back what it printed; rejects on a failure or after the time is up. */
export type Run = (file: string, args: readonly string[], timeoutMs: number) => Promise<string>;

export interface ContextReader {
  /** The controls of the window in front, or undefined when the system would not say (no permission, no window, a timeout). */
  read(): Promise<UiNode[] | undefined>;
}

const MAX_NODES = 400;
const MAX_DEPTH = 8;
const TIMEOUT_MS = 6000;

/**
 * Windows UI Automation: walks the window in front breadth-limited and prints one JSON array. Only the name and the password flag of each control
 * are asked for; no value or text pattern is ever read.
 */
export const WINDOWS_SCRIPT = `
Add-Type -AssemblyName UIAutomationClient
Add-Type -Namespace SK -Name Win -MemberDefinition '[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();'
$h = [SK.Win]::GetForegroundWindow()
if ($h -eq [System.IntPtr]::Zero) { '[]'; exit }
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
export const MAC_SCRIPT = `
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
const wins = front.windows();
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

const COMMANDS: Record<string, readonly [string, readonly string[]]> = {
  win32: ["powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_SCRIPT]],
  darwin: ["osascript", ["-l", "JavaScript", "-e", MAC_SCRIPT]],
};

/** The reader for this system, or undefined where there is none. `run` is the way programs are started (tests give a fake). */
export function createContextReader(os: string, run: Run = runProgram): ContextReader | undefined {
  const via = COMMANDS[os];
  if (!via) return undefined;
  return {
    async read() {
      try {
        return parseNodes(await run(via[0], via[1], TIMEOUT_MS));
      } catch {
        // no permission, no window or too slow: the capture goes on without context
        return undefined;
      }
    },
  };
}

function runProgram(file: string, args: readonly string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, [...args], { timeout: timeoutMs, windowsHide: true, maxBuffer: 2_000_000 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}
