// End-to-end proof of the automatic update on Windows, without GitHub: two builds of the installer (0.3.1 and 0.3.2), the newer one
// served from a local static server through electron-updater's generic provider (SPEAKKIT_UPDATE_URL). For each of "Install when I
// quit" and "Restart now": silent-install the older build into a temp folder, start it with an isolated SPEAKKIT_USER_DATA, drive it
// over the Chrome DevTools port (the renderer's window.speakkit API, the same calls the update card makes), assert the states
// checking, available, downloading, ready, apply the install and assert the running version through /v1/health. Finally uninstall
// and put the registry and shortcuts back as found. Slow (two packaging builds on a cold run). See docs/auto-update.md.
//   node scripts/update-e2e/run.mjs [--old 0.3.1] [--new 0.3.2] [--rebuild] [--only quit|restart]
// Built installers are reused from release/update-e2e/ unless --rebuild.
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveFeed } from "./feed-server.mjs";
import { countIn, diffShell, healthOfProcessesIn, killIn, restoreShell, snapshotShell, updaterRunning } from "./windows.mjs";

if (process.platform !== "win32") throw new Error("the update e2e runs against the Windows installer");
const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const OLD = opt("--old", "0.3.1");
const NEW = opt("--new", "0.3.2");
const only = opt("--only", "");
const { chromium } = createRequire(path.resolve(desktop, "../../e2e/package.json"))("@playwright/test");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
  if (!ok) {
    failures.push(name);
    process.exitCode = 1;
  }
};
const until = async (what, f, ms = 120_000) => {
  for (const end = Date.now() + ms; Date.now() < end;) {
    const v = await f();
    if (v) return v;
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${what}`);
};
const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
const exited = (child) => new Promise((resolve) => (child.exitCode !== null ? resolve(child.exitCode) : child.on("exit", resolve)));

// ---- 1. the two installers and the feed folder ----
const artifacts = path.join(desktop, "release/update-e2e");
const feedDir = path.join(artifacts, "feed");
const oldInstaller = path.join(artifacts, `old/Speak-Kit-Setup-${OLD}.exe`);
function build(version, copies) {
  console.log(`== package ${version}`);
  const r = spawnSync(process.execPath, ["scripts/package.mjs", "--version", version], { cwd: desktop, stdio: "inherit" });
  if (r.status) throw new Error(`packaging ${version} failed with ${r.status}`);
  for (const [from, to] of copies) {
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(path.join(desktop, "release", from), to);
  }
}
const feedFiles = [`Speak-Kit-Setup-${NEW}.exe`, `Speak-Kit-Setup-${NEW}.exe.blockmap`, "latest.yml"];
if (args.includes("--rebuild") || !existsSync(oldInstaller)) build(OLD, [[`Speak-Kit-Setup-${OLD}.exe`, oldInstaller]]);
if (args.includes("--rebuild") || !feedFiles.every((f) => existsSync(path.join(feedDir, f))))
  build(
    NEW,
    feedFiles.map((f) => [f, path.join(feedDir, f)]),
  );
const latest = readFileSync(path.join(feedDir, "latest.yml"), "utf8");
check("the feed's latest.yml announces the new version", new RegExp(`^version: ${NEW.replace(/\./g, "\\.")}$`, "m").test(latest));

// ---- 2. the machine as found ----
const work = mkdtempSync(path.join(tmpdir(), "speakkit-update-e2e-"));
const before = snapshotShell(path.join(work, "before"));
console.log(`registry before: ${before.keys.length} Uninstall keys, speakkit protocol ${before.protocol.text === null ? "absent" : "present"}`);

// The app the installer relaunches after "Restart now" has no isolated data folder; remove what it creates if there was nothing before.
const realData = path.join(process.env.APPDATA, "@speakkit");
const realDataExisted = existsSync(realData);
const feed = await serveFeed(feedDir);
console.log(`feed ${feed.url}`);

/** One isolated install: its folders, ports, environment and the calls that look at it. */
async function makeSite(name) {
  const root = path.join(work, name);
  const dir = path.join(root, "app");
  const userData = path.join(root, "data");
  const port = await freePort();
  mkdirSync(userData, { recursive: true });
  writeFileSync(path.join(userData, "config.json"), JSON.stringify({ setupDone: true }));
  const env = { ...process.env, SPEAKKIT_USER_DATA: userData, SPEAKKIT_PORT: String(port), SPEAKKIT_ENGINE: "fake", SPEAKKIT_QUIET_NOTIFY: "1", SPEAKKIT_UPDATE_URL: feed.url };
  delete env.ELECTRON_RUN_AS_NODE;
  const exe = path.join(dir, "Speak Kit.exe");
  const health = () =>
    fetch(`http://127.0.0.1:${port}/v1/health`, { signal: AbortSignal.timeout(2000) }).then(
      (r) => r.json(),
      () => null,
    );
  // null while an installer is replacing the files
  const installedVersion = () => {
    try {
      return JSON.parse(readFileSync(path.join(dir, "resources/app/package.json"), "utf8")).version;
    } catch {
      return null;
    }
  };
  const quit = async () => {
    if (countIn(dir) === 0) return;
    spawn(exe, ["--quit"], { env, stdio: "ignore" });
    for (let i = 0; i < 60 && countIn(dir) > 0; i++) await sleep(500);
  };
  return { name, dir, exe, env, health, installedVersion, quit, cdp: await freePort() };
}

/** Silent-installs the old build; the installer starts the app when it finishes, so that run is stopped before the real one. */
async function installOld(site) {
  const { name, dir, exe, env } = site;
  // electron-updater keeps a verified download here and would reuse it, so the second scenario would not fetch from the feed
  if (before.speakKitKeys.length === 0) rmSync(path.join(process.env.LOCALAPPDATA, "speakkit-updater"), { recursive: true, force: true });
  const install = spawn(oldInstaller, ["/S", `/D=${dir}`], { env, stdio: "ignore" });
  check(`${name}: silent install of ${OLD} exits 0`, (await exited(install)) === 0);
  await until("the installed app", () => existsSync(exe));
  await sleep(2000);
  await site.quit();
  check(`${name}: installed version is ${OLD}`, site.installedVersion() === OLD);
}

/** Starts the old build and connects to its window; records every update state the renderer is told about. */
async function startOld(site) {
  const { name, exe, env, cdp, health } = site;
  const app = spawn(exe, ["--hidden", `--remote-debugging-port=${cdp}`], { env, stdio: "ignore" });
  const h0 = await until("health of the old build", health, 60_000);
  check(`${name}: /v1/health reports ${OLD}`, h0.version === OLD, `v${h0.version}`);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdp}`);
  const page = await until(
    "the main window",
    () =>
      browser
        .contexts()
        .flatMap((c) => c.pages())
        .find((p) => p.url().includes("index.html")),
    30_000,
  );
  await page.evaluate(() => {
    window.__kinds = [];
    const note = (s) => window.__kinds.at(-1) !== s.update.kind && window.__kinds.push(s.update.kind);
    window.speakkit.state().then(note);
    window.speakkit.onState(note);
  });
  const update = () => page.evaluate(() => window.speakkit.state().then((s) => s.update));
  return { app, browser, page, update, kinds: () => page.evaluate(() => window.__kinds) };
}

/** Check, download and wait until the update is ready; asserts the states and the files fetched from the local feed. */
async function downloadUpdate(site, run) {
  const { name, health, installedVersion } = site;
  check(`${name}: updates are on for the installed build (idle)`, (await run.update()).kind === "idle");
  await run.page.evaluate(() => void (window.__check = window.speakkit.updateAction("check")));
  await until("the update to be ready", async () => (await run.update()).kind === "ready", 180_000);
  const seen = await run.kinds();
  check(
    `${name}: states walk checking, available, downloading, ready`,
    ["checking", "available", "downloading", "ready"].every((k, i, all) => seen.indexOf(k) >= (i ? seen.indexOf(all[i - 1]) : 0) && seen.includes(k)),
    seen.join(" > "),
  );
  const ready = await run.update();
  check(`${name}: the ready update is ${NEW} and waits for the user`, ready.version === NEW && ready.onQuit === false);
  check(
    `${name}: the app fetched latest.yml and the installer from the local feed`,
    feed.requests.some((r) => r.endsWith("/latest.yml")) && feed.requests.some((r) => r.endsWith(`Speak-Kit-Setup-${NEW}.exe`)),
    feed.requests.join(", "),
  );
  check(`${name}: still running ${OLD} after the download`, (await health())?.version === OLD && installedVersion() === OLD);
}

async function installOnQuit(site, run) {
  const { name, dir, exe, env, health, installedVersion } = site;
  await run.page.evaluate(() => window.speakkit.updateAction("install-on-quit"));
  check(`${name}: Install when I quit is armed and nothing installed yet`, (await run.update()).onQuit === true && installedVersion() === OLD);
  await run.browser.close().catch(() => {});
  await site.quit();
  await exited(run.app).catch(() => {});
  await until(`the installer to put ${NEW} in place`, () => installedVersion() === NEW, 180_000);
  await until("the update installer to finish", () => !updaterRunning(), 120_000);
  await sleep(1500);
  check(`${name}: quitting installed ${NEW} without restarting the app`, countIn(dir) === 0);
  spawn(exe, ["--hidden"], { env, stdio: "ignore" });
  const h1 = await until("health of the new build", async () => (await health())?.version === NEW && (await health()), 60_000);
  check(`${name}: next start runs ${NEW} (health)`, h1.version === NEW, `v${h1.version}`);
}

async function restartNow(site, run) {
  const { name, dir, installedVersion } = site;
  void run.page.evaluate(() => window.speakkit.updateAction("install-now")).catch(() => {});
  await until("the installer to replace the files", () => installedVersion() === NEW, 180_000);
  await until("the update installer to finish", () => !updaterRunning(), 180_000);
  // The installer relaunches the app through the Windows shell, which does not pass the SPEAKKIT_* variables of this run on: the
  // relaunched app has the default data folder and port (or a fallback port), so find its port from the process instead.
  const h1 = await until(`the restarted app to report ${NEW}`, () => healthOfProcessesIn(dir), 120_000);
  check(`${name}: Restart now left the app running ${NEW} (health)`, h1.version === NEW, `v${h1.version}`);
  check(`${name}: the restarted app is the installed one`, installedVersion() === NEW && countIn(dir) > 0);
  await run.browser.close().catch(() => {});
}

async function uninstall(site) {
  const { name, dir, env } = site;
  await site.quit().catch(() => {});
  for (let i = 0; i < 240 && updaterRunning(); i++) await sleep(500);
  if (countIn(dir) > 0) killIn(dir);
  const uninstaller = path.join(dir, "Uninstall Speak Kit.exe");
  if (!existsSync(uninstaller)) return;
  const un = spawn(uninstaller, ["/S"], { env, stdio: "ignore" });
  check(`${name}: silent uninstall exits 0`, (await exited(un)) === 0);
  // The uninstaller copies itself to a temp folder and returns at once; the folder disappears a moment later.
  for (let i = 0; i < 400 && existsSync(dir); i++) await sleep(300);
  check(`${name}: uninstall removes the folder`, !existsSync(dir));
}

async function scenario(name, how) {
  console.log(`\n== ${name}`);
  const site = await makeSite(name);
  try {
    await installOld(site);
    const run = await startOld(site);
    await downloadUpdate(site, run);
    await (how === "quit" ? installOnQuit(site, run) : restartNow(site, run));
  } finally {
    await uninstall(site);
  }
}

try {
  if (only !== "restart") await scenario("install-on-quit", "quit");
  if (only !== "quit") await scenario("restart-now", "restart");
} catch (e) {
  check(`unexpected error: ${e?.message ?? e}`, false);
} finally {
  await feed.close();
  if (!realDataExisted) rmSync(realData, { recursive: true, force: true });
  const repaired = restoreShell(before, work);
  if (repaired.length) console.log(`restored after the run: ${repaired.join("; ")}`);
  const left = diffShell(before, snapshotShell(path.join(work, "final")));
  check("registry and shortcuts are as found", left.length === 0, left.join("; "));
  rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
}
console.log(failures.length ? `UPDATE E2E FAILED: ${failures.join(", ")}` : "UPDATE E2E PASSED");
