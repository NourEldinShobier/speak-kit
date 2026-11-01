// Installs the NSIS installer silently into a temp folder, runs smoke-packaged.mjs against the installed exe (health, speech, bundled files,
// single instance, quit), runs the uninstaller silently and checks that the folder is gone. Everything runs with an isolated user-data folder and port.
//   node scripts/smoke-installer.mjs [--installer release/Speak-Kit-Setup-<version>.exe]
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const installer = path.resolve(
  args.includes("--installer")
    ? args[args.indexOf("--installer") + 1]
    : path.join(desktop, "release", readdirSync(path.join(desktop, "release")).find((f) => /^Speak-Kit-Setup-.*\.exe$/.test(f)) ?? ""),
);
if (!existsSync(installer)) throw new Error(`no such file: ${installer}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
};
const run = (exe, a, env) => new Promise((resolve) => spawn(exe, a, { env, stdio: "ignore" }).on("exit", resolve));

const root = mkdtempSync(path.join(tmpdir(), "speakkit-install-"));
const dir = path.join(root, "app");
const userData = path.join(root, "data");
// The installer starts the app when it finishes (runAfterFinish); the isolated folder and port keep that run away from a real installation.
const env = { ...process.env, SPEAKKIT_USER_DATA: userData, SPEAKKIT_PORT: String(52000 + Math.floor(Math.random() * 3000)), SPEAKKIT_ENGINE: "fake", SPEAKKIT_QUIET_NOTIFY: "1" };
delete env.ELECTRON_RUN_AS_NODE;
mkdirSync(userData, { recursive: true });
writeFileSync(path.join(userData, "config.json"), JSON.stringify({ setupDone: true }));
const exe = path.join(dir, "Speak Kit.exe");
const running = () =>
  Number(
    execFileSync("powershell", ["-NoProfile", "-Command", `@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq '${exe.replace(/'/g, "''")}' }).Count`], { encoding: "utf8" }).trim(),
  );

try {
  const t0 = Date.now();
  // /D must be the last argument and unquoted (NSIS).
  const code = await run(installer, ["/S", `/D=${dir}`], env);
  check("silent install exits 0", code === 0, `exit ${code} in ${Date.now() - t0} ms`);
  check("installs the app", existsSync(exe) && existsSync(path.join(dir, "resources/extension/manifest.json")), dir);
  const uninstaller = path.join(dir, "Uninstall Speak Kit.exe");
  check("writes an uninstaller", existsSync(uninstaller));

  // Stop whatever the installer started before the smoke test starts its own instance.
  if (running()) await run(exe, ["--quit"], env);
  for (let i = 0; i < 50 && running(); i++) await sleep(200);

  const smoke = spawnSync(process.execPath, [path.join(desktop, "scripts/smoke-packaged.mjs"), "--exe", exe], { stdio: "inherit" });
  check("smoke test of the installed app", smoke.status === 0, `exit ${smoke.status}`);

  if (running()) await run(exe, ["--quit"], env);
  const un = await run(uninstaller, ["/S"], env);
  check("silent uninstall exits 0", un === 0, `exit ${un}`);
  // The uninstaller copies itself to a temp folder and returns at once; the folder disappears a moment later.
  for (let i = 0; i < 100 && existsSync(dir); i++) await sleep(300);
  check("uninstall removes the folder", !existsSync(dir));
} finally {
  if (existsSync(exe) && running()) await run(exe, ["--quit"], env);
  rmSync(root, { recursive: true, force: true });
}
console.log(process.exitCode ? "INSTALLER SMOKE FAILED" : "INSTALLER SMOKE PASSED");
