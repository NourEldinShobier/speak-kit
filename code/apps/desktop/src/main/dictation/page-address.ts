import { createLineClient, osascript, spawnPowerShellLoop, type LineProcess } from "./caret-reader";
import { isChromiumBrowser } from "./app-profile";
import type { ForegroundInfo } from "./types";

// UI Automation: from the focused element up to its window, then the first edit field named like an address bar, and its value.
export const WINDOWS_ADDRESS_LOOP = String.raw`
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$AE = [System.Windows.Automation.AutomationElement]
$edit = New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
[Console]::Out.WriteLine('ready')
while (($l = [Console]::In.ReadLine()) -ne $null) {
  $out = 'none'
  try {
    $w = $AE::FocusedElement
    $root = $AE::RootElement
    while ($true) {
      $p = $walker.GetParent($w)
      if ($p -eq $null -or [System.Windows.Automation.Automation]::Compare($p, $root)) { break }
      $w = $p
    }
    foreach ($e in $w.FindAll([System.Windows.Automation.TreeScope]::Descendants, $edit)) {
      if ($e.Current.Name -match '(?i)address|url|location') {
        $vp = $null
        if ($e.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$vp)) { $out = 'url:' + $vp.Current.Value; break }
      }
    }
  } catch { $out = 'none' }
  [Console]::Out.WriteLine($out)
}
`;

const BROWSERS_MAC = ["Google Chrome", "Brave Browser", "Microsoft Edge", "Arc", "Vivaldi", "Chromium"];
const MAC_SCRIPT = `tell application "System Events" to set front to name of first application process whose frontmost is true
if front is "Safari" then
  tell application "Safari" to return "url:" & (URL of front document)
${BROWSERS_MAC.map(
  (b) => `else if front is "${b}" then
  tell application "${b}" to return "url:" & (URL of active tab of front window)`,
).join("\n")}
end if
return "none"`;

/** The address in the address bar of the browser in front: the text after `url:`, or undefined. */
export const parseAddress = (line: string): string | undefined => (line.startsWith("url:") && line.length > 4 ? line.slice(4).trim() : undefined);

const NON_CHROMIUM = new Set(["firefox", "safari", "org.mozilla.firefox", "com.apple.safari"]);
const isBrowser = (exe: string | null): boolean => !!exe && (isChromiumBrowser(exe) || NON_CHROMIUM.has(exe.toLowerCase().replace(/\.exe$/, "")));

export interface PageAddress {
  /** The address bar of the foreground browser; undefined for any other program, when the bar cannot be read, or when it takes over 1.5 s. Never rejects. */
  read(fg: ForegroundInfo | null): Promise<string | undefined>;
  dispose(): void;
}

interface Deps {
  platform: NodeJS.Platform;
  start(): LineProcess;
  once(script: string): Promise<string>;
  timeoutMs?: number;
}

export function createPageAddress({ platform, start, once, timeoutMs = 1500 }: Deps): PageAddress {
  const helper = createLineClient(start, timeoutMs);
  return {
    async read(fg) {
      if (!fg || !isBrowser(fg.exe)) return undefined;
      try {
        if (platform === "win32") return parseAddress(await helper.ask("url"));
        if (platform === "darwin") return parseAddress(await Promise.race([once(MAC_SCRIPT), new Promise<string>((r) => setTimeout(() => r("none"), timeoutMs))]));
      } catch {
        // an unreadable bar is no address
      }
      return undefined;
    },
    dispose: helper.close,
  };
}

export const systemPageAddress = (): PageAddress => createPageAddress({ platform: process.platform, start: () => spawnPowerShellLoop(WINDOWS_ADDRESS_LOOP), once: (s) => osascript(s, 2000) });
