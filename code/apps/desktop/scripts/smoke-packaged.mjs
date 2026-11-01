// Smoke test of the packaged app: starts the exe, waits for /v1/health, speaks one sentence, checks the bundled extension,
// then asks it to quit (SpeakKit.exe --quit) and checks that it exits, frees the port and leaves no process behind.
// SMOKE_WAIT_S raises the start-up and second-launch waits (the portable exe unpacks 170 MB first). A second launch must hand over and exit without adding processes.
//   node scripts/smoke-packaged.mjs [--exe path-to-SpeakKit.exe] [--real]
// --real uses the real Kokoro engine and the shared model cache (code/.cache/models); otherwise the fake engine runs.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const exe = path.resolve(args.includes("--exe") ? args[args.indexOf("--exe") + 1] : path.join(desktop, "release/win-unpacked/SpeakKit.exe"));
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
const running = () =>
  Number(
    execFileSync("powershell", ["-NoProfile", "-Command", `@(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq '${exe.replace(/'/g, "''")}' }).Count`], { encoding: "utf8" }).trim(),
  );

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

  // A second launch hands over to the running instance and exits; it must not leave a second process tree.
  const before = running();
  const second = spawn(exe, [], { env, stdio: "ignore" });
  const secondCode = await new Promise((r) => {
    const t = setTimeout(() => (second.kill(), r("timeout")), (Number(process.env.SMOKE_WAIT_S) || 15) * 1000);
    second.on("exit", (c) => (clearTimeout(t), r(c)));
  });
  await sleep(1000);
  check("second launch exits and adds no processes", secondCode === 0 && running() === before, `exit ${secondCode}, ${before} -> ${running()} processes`);

  // The portable exe unpacks itself into a temp folder at every start, so its own folder has no resources.
  if (!/portable/i.test(path.basename(exe))) {
    const resources = path.join(path.dirname(exe), "resources");
    check("bundles the extension", existsSync(path.join(resources, "extension/manifest.json")));
    check("bundles the engine worker next to the app", existsSync(path.join(resources, "app/dist/worker/worker.js")));
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
