// Installs the NSIS installer silently into a temp folder, runs smoke-packaged.mjs against the installed exe (health, speech, bundled files,
// single instance, quit), installs the same version over it (an update must keep downloaded models), then runs the uninstaller silently and
// checks that the folder is gone, the downloaded models and engines are removed and the library, cloned voices and token stay.
// Everything runs with an isolated user-data folder and port.
//   node scripts/smoke-installer.mjs [--installer release/Speak-Kit-Setup-<version>.exe]
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

/** Processes whose executable lies under the install folder or the (fake) engines folder. */
const leftovers = () =>
  Number(
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and ($_.ExecutablePath.StartsWith('${dir.replace(/'/g, "''")}', 'CurrentCultureIgnoreCase') -or $_.ExecutablePath.StartsWith('${userData.replace(/'/g, "''")}', 'CurrentCultureIgnoreCase')) }).Count`,
      ],
      { encoding: "utf8" },
    ).trim(),
  );
const put = (rel, text) => {
  mkdirSync(path.dirname(path.join(userData, rel)), { recursive: true });
  writeFileSync(path.join(userData, rel), text);
};
const downloaded = ["models/onnx/model.onnx", "engines/chatterbox/installed", "chatterbox/installed", "exports/a.wav", "IndexedDB/ocr/eng.traineddata"];
const own = { "library/library.json": '{"docs":1}', "voices/me.wav": "clone", token: "secret", "config.json": JSON.stringify({ setupDone: true }) };

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

  // Fake downloads and the person's own data, in the isolated user-data folder only.
  for (const f of downloaded) put(f, "x".repeat(1000));
  for (const [f, text] of Object.entries(own)) put(f, text);

  const smoke = spawnSync(process.execPath, [path.join(desktop, "scripts/smoke-packaged.mjs"), "--exe", exe], { stdio: "inherit" });
  check("smoke test of the installed app", smoke.status === 0, `exit ${smoke.status}`);

  if (running()) await run(exe, ["--quit"], env);

  // Installing the same version over it runs the old uninstaller with --updated: nothing downloaded may be removed.
  const again = await run(installer, ["/S", `/D=${dir}`], env);
  check("silent update over an existing install exits 0", again === 0, `exit ${again}`);
  check(
    "an update keeps the downloaded models and engines",
    downloaded.every((f) => existsSync(path.join(userData, f))),
  );
  if (running()) await run(exe, ["--quit"], env);
  for (let i = 0; i < 50 && running(); i++) await sleep(200);

  const un = await run(uninstaller, ["/S"], env);
  check("silent uninstall exits 0", un === 0, `exit ${un}`);
  // The uninstaller copies itself to a temp folder and returns at once; the folder disappears a moment later.
  for (let i = 0; i < 100 && existsSync(dir); i++) await sleep(300);
  check("uninstall removes the folder", !existsSync(dir));
  check(
    "uninstall removes the downloaded models, engines, exports and OCR data",
    downloaded.every((f) => !existsSync(path.join(userData, path.dirname(f)))),
    downloaded.filter((f) => existsSync(path.join(userData, f))).join(", "),
  );
  check(
    "uninstall keeps the library, cloned voices, token and settings",
    Object.entries(own).every(([f, text]) => existsSync(path.join(userData, f)) && readFileSync(path.join(userData, f), "utf8") === text),
  );
  for (let i = 0; i < 25 && leftovers(); i++) await sleep(200);
  check("no Speak Kit process is left", leftovers() === 0);
} finally {
  if (existsSync(exe) && running()) await run(exe, ["--quit"], env);
  rmSync(root, { recursive: true, force: true });
}
console.log(process.exitCode ? "INSTALLER SMOKE FAILED" : "INSTALLER SMOKE PASSED");
