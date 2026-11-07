// Windows helpers for the update e2e: processes, and a snapshot of what an install touches outside its folder (the Uninstall entries,
// the speakkit URL protocol key, the Start menu and desktop shortcuts) so the test can leave the machine as it found it.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export const ps = (script) => execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" }).trim();
const quote = (s) => s.replace(/'/g, "''");

/** Number of running processes whose executable lives in `dir` (the installed app, its helpers and the uninstaller). */
export const countIn = (dir) => Number(ps(`@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith('${quote(dir)}', 'OrdinalIgnoreCase') }).Count`));

export const killIn = (dir) =>
  ps(
    `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith('${quote(dir)}', 'OrdinalIgnoreCase') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`,
  );

/** True while an electron-updater installer run (it is started with --updated) is alive. */
export const updaterRunning = () => Number(ps(`@(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*--updated*' -and $_.Name -like '*Setup*' }).Count`)) > 0;

const UNINSTALL = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall";
const PROTOCOL = "HKCU\\Software\\Classes\\speakkit";

const reg = (args) => {
  try {
    return execFileSync("reg", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
};
const subkeys = (root) =>
  (reg(["query", root]) ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.toUpperCase().startsWith("HKEY_") && l.length > root.length + 4)
    .map((l) => l.replace(/^HKEY_CURRENT_USER/i, "HKCU"))
    .sort();
const displayName = (key) => /DisplayName\s+REG_SZ\s+(.*)/.exec(reg(["query", key, "/v", "DisplayName"]) ?? "")?.[1]?.trim();
const exportKey = (key, file) => (reg(["export", key, file, "/y"]) === null ? null : readFileSync(file, "utf16le"));

const links = () => {
  const home = process.env.USERPROFILE;
  return [path.join(process.env.APPDATA, "Microsoft/Windows/Start Menu/Programs/Speak Kit.lnk"), path.join(home, "Desktop/Speak Kit.lnk")];
};

/** Everything an install can change outside its own folder. */
export function snapshotShell(tmp) {
  mkdirSync(tmp, { recursive: true });
  const keys = subkeys(UNINSTALL);
  const speakKitKeys = keys.filter((k) => displayName(k) === "Speak Kit");
  return {
    keys,
    speakKitKeys: speakKitKeys.map((k, i) => ({ key: k, file: path.join(tmp, `uninstall-${i}.reg`), text: exportKey(k, path.join(tmp, `uninstall-${i}.reg`)) })),
    protocol: { file: path.join(tmp, "protocol.reg"), text: exportKey(PROTOCOL, path.join(tmp, "protocol.reg")) },
    links: links().map((p) => ({ path: p, bytes: existsSync(p) ? readFileSync(p) : null })),
  };
}

const change = (was, now) => {
  if (was === null) return "added";
  return now === null ? "removed" : "changed";
};

/** Differences between two snapshots, as readable lines. Empty means identical. */
export function diffShell(a, b) {
  const out = [];
  for (const k of b.keys.filter((k) => !a.keys.includes(k))) out.push(`Uninstall key added: ${k}`);
  for (const k of a.keys.filter((k) => !b.keys.includes(k))) out.push(`Uninstall key removed: ${k}`);
  if (a.protocol.text !== b.protocol.text) out.push(`speakkit URL protocol key ${change(a.protocol.text, b.protocol.text)}`);
  a.links.forEach((l, i) => {
    const m = b.links[i];
    if ((l.bytes === null) !== (m.bytes === null) || (l.bytes && m.bytes && !l.bytes.equals(m.bytes))) out.push(`shortcut ${change(l.bytes, m.bytes)}: ${l.path}`);
  });
  return out;
}

/** Puts whatever differs from the snapshot back: registry keys and shortcuts. Returns what it had to repair. */
export function restoreShell(before, tmp) {
  const repaired = diffShell(before, snapshotShell(path.join(tmp, "after")));
  const now = subkeys(UNINSTALL);
  for (const k of now.filter((k) => !before.keys.includes(k) && displayName(k) === "Speak Kit")) reg(["delete", k, "/f"]);
  for (const k of before.speakKitKeys) if (k.text !== null && !now.includes(k.key)) reg(["import", k.file]);
  const protocolNow = exportKey(PROTOCOL, path.join(tmp, "protocol-now.reg"));
  if (protocolNow !== before.protocol.text) {
    reg(["delete", PROTOCOL, "/f"]);
    if (before.protocol.text !== null) reg(["import", before.protocol.file]);
  }
  for (const l of before.links) {
    if (l.bytes && !(existsSync(l.path) && readFileSync(l.path).equals(l.bytes))) writeFileSync(l.path, l.bytes);
    else if (!l.bytes) rmSync(l.path, { force: true });
  }
  return repaired;
}

/** /v1/health of the app whose process runs from `dir`, found through the ports it listens on (null until one answers). */
export async function healthOfProcessesIn(dir) {
  const ports = ps(
    `$ids = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith('${quote(dir)}', 'OrdinalIgnoreCase') } | ForEach-Object { $_.ProcessId }); if ($ids.Count) { (Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ids -contains $_.OwningProcess -and $_.LocalAddress -eq '127.0.0.1' }).LocalPort -join ' ' }`,
  )
    .split(/\s+/)
    .filter(Boolean);
  for (const port of ports) {
    const h = await fetch(`http://127.0.0.1:${port}/v1/health`, { signal: AbortSignal.timeout(2000) }).then(
      (r) => r.json(),
      () => null,
    );
    if (h?.app === "speakkit") return h;
  }
  return null;
}
