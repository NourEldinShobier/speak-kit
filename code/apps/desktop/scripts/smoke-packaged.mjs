// Smoke test of the packaged app (Windows exe or macOS .app of this machine's architecture): starts it, waits for /v1/health, speaks one sentence, checks the bundled extension,
// checks the Electron fuses of the binary, then asks it to quit (Speak Kit --quit) and checks that it exits, frees the port and leaves no process behind.
// SMOKE_WAIT_S raises the start-up and second-launch waits (the portable exe unpacks 170 MB first). A second launch must hand over and exit without adding processes.
//   node scripts/smoke-packaged.mjs [--exe path-to-Speak Kit.exe or Speak Kit.app/Contents/MacOS/Speak Kit] [--real]
// --real uses the real Kokoro engine and the shared model cache (code/.cache/models); otherwise the fake engine runs.
import { FuseV1Options, getCurrentFuseWire } from "@electron/fuses";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const mac = process.platform === "darwin";
const unpacked = mac ? `release/${process.arch === "arm64" ? "mac-arm64" : "mac"}/Speak Kit.app/Contents/MacOS/Speak Kit` : "release/win-unpacked/Speak Kit.exe";
const exe = path.resolve(args.includes("--exe") ? args[args.indexOf("--exe") + 1] : path.join(desktop, unpacked));
const real = args.includes("--real");
if (!existsSync(exe)) throw new Error(`no such file: ${exe}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
};
const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
// Processes started from this executable (the app, its engine process; Electron's helper processes have their own executables).
const running = () =>
  mac
    ? execFileSync("ps", ["-axo", "comm="], { encoding: "utf8" })
        .split("\n")
        .filter((l) => l.trim() === exe).length
    : Number(
        execFileSync("powershell", ["-NoProfile", "-Command", `@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq '${exe.replace(/'/g, "''")}' }).Count`], {
          encoding: "utf8",
        }).trim(),
      );

// RunAsNode stays on while the model host starts with child_process.fork; the other three are hardened.
const ENABLE = 49; // the fuse wire stores the ASCII digit "1" for on and "0" (48) for off
const DISABLE = 48;
const wire = await getCurrentFuseWire(mac ? exe.replace(/\.app\/.*$/, ".app") : exe);
const fuses = {
  RunAsNode: ENABLE,
  EnableNodeOptionsEnvironmentVariable: DISABLE,
  EnableNodeCliInspectArguments: DISABLE,
  EnableCookieEncryption: ENABLE,
};
for (const [name, want] of Object.entries(fuses)) check(`fuse ${name}`, wire[FuseV1Options[name]] === want, `${wire[FuseV1Options[name]]}`);

const userData = mkdtempSync(path.join(tmpdir(), "speakkit-smoke-"));
writeFileSync(path.join(userData, "config.json"), JSON.stringify({ setupDone: true }));
const port = await freePort();
const env = {
  ...process.env,
  SPEAKKIT_USER_DATA: userData,
  SPEAKKIT_PORT: String(port),
  SPEAKKIT_QUIET_NOTIFY: "1",
  ...(real ? { SPEAKKIT_MODELS_DIR: path.resolve(desktop, "../../.cache/models") } : { SPEAKKIT_ENGINE: "fake" }),
};
delete env.ELECTRON_RUN_AS_NODE;

const app = spawn(exe, ["--hidden"], { env, stdio: "ignore" });
let exitCode = null;
app.on("exit", (c) => (exitCode = c ?? -1));
const base = `http://127.0.0.1:${port}`;

try {
  let health = null;
  for (let i = 0; i < (Number(process.env.SMOKE_WAIT_S) || 30) * 5 && !health && exitCode === null; i++) {
    health = await fetch(`${base}/v1/health`).then(
      (r) => r.json(),
      () => null,
    );
    if (!health) await sleep(200);
  }
  check("serves /v1/health", health?.app === "speakkit", health ? `engine ${health.engine.state}, v${health.version}` : "no answer");

  const token = existsSync(path.join(userData, "token")) ? readFileSync(path.join(userData, "token"), "utf8").trim() : "";
  const auth = { Authorization: `Bearer ${token}` };
  const voices = await fetch(`${base}/v1/voices`, { headers: auth }).then(
    (r) => r.json(),
    () => null,
  );
  check("lists voices with the token", (voices?.voices?.length ?? 0) > 0, `${voices?.voices?.length ?? 0} voices`);

  const t0 = Date.now();
  const speak = await fetch(`${base}/v1/speak`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ sentences: ["Hello from the packaged app."], voice: voices?.default ?? "af_heart", speed: 1 }),
  }).catch(() => null);
  const bytes = speak?.ok ? (await speak.arrayBuffer()).byteLength : 0;
  check("speaks a sentence", bytes > (real ? 20_000 : 1_000), `${bytes} bytes in ${Date.now() - t0} ms${real ? " (real engine)" : ""}`);

  // The app process and its window renderer (the window is created hidden), plus the engine worker (forked from the same executable) once a real engine has loaded; one more would be a leak.
  const started = running();
  check("runs the app and its engine worker, no more", started >= 1 && started <= (real ? 3 : 2), `${started} processes`);

  // A second launch hands over to the running instance and exits; it must not leave a second process tree.
  const before = started;
  const second = spawn(exe, [], { env, stdio: "ignore" });
  const secondCode = await new Promise((r) => {
    const t = setTimeout(() => (second.kill(), r("timeout")), (Number(process.env.SMOKE_WAIT_S) || 15) * 1000);
    second.on("exit", (c) => (clearTimeout(t), r(c)));
  });
  await sleep(1000);
  check("second launch exits and adds no processes", secondCode === 0 && running() === before, `exit ${secondCode}, ${before} -> ${running()} processes`);

  // The portable exe unpacks itself into a temp folder at every start, so its own folder has no resources.
  if (!/portable/i.test(path.basename(exe))) {
    const resources = mac ? path.join(path.dirname(exe), "../Resources") : path.join(path.dirname(exe), "resources");
    check("bundles the extension", existsSync(path.join(resources, "extension/manifest.json")));
    check("bundles the engine worker next to the app", existsSync(path.join(resources, "app/dist/worker/worker.js")));
    const script = path.join(resources, "chatterbox/chatterbox_sidecar.py"); // without it Chatterbox installs but cannot load
    check("bundles the Chatterbox sidecar script", existsSync(script) && readFileSync(script, "utf8").includes('"op": "synth"'));
  }

  const q = spawn(exe, ["--quit"], { env, stdio: "ignore" });
  await new Promise((r) => q.on("exit", r));
  for (let i = 0; i < 75 && exitCode === null; i++) await sleep(200);
  check("exits after --quit", exitCode === 0, `exit code ${exitCode}`);
  await sleep(500);
  const closed = await fetch(`${base}/v1/health`).then(
    () => false,
    () => true,
  );
  check("frees the port", closed);
  const left = running();
  check("leaves no process behind", left === 0, `${left} left`);
} finally {
  if (exitCode === null) app.kill();
  rmSync(userData, { recursive: true, force: true });
}
console.log(process.exitCode ? "SMOKE FAILED" : "SMOKE PASSED");
