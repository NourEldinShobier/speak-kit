import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { Page } from "@playwright/test";
import { electronPath, launch, type Launched } from "./harness";

const run = promisify(execFile);
const running: Launched[] = [];

/** An app whose skill home folder, launcher PATH and macOS bin folder are in a temp folder, so nothing of the machine running the test changes. */
async function start(config: object = {}) {
  const sandbox = mkdtempSync(path.join(tmpdir(), "speakkit-auto-"));
  const home = path.join(sandbox, "home");
  mkdirSync(home);
  const l = await launch({
    config: { setupDone: true, setupSkipped: false, preferredPort: 0, ...config },
    env: { SPEAKKIT_TEST: "1", SPEAKKIT_TEST_LAUNCHER_DIR: sandbox },
  });
  running.push(l);
  return { ...l, sandbox, home };
}
afterEach(async () => {
  await Promise.all(running.splice(0).map((l) => l.cleanup()));
});

const goto = async (p: Page, name: string) => {
  const nav = p.getByRole("navigation", { name: "Settings" });
  if (!(await nav.isVisible())) await p.getByRole("link", { name: "Settings" }).click();
  await nav.getByRole("link", { name, exact: true }).click();
  await p.getByRole("heading", { name, exact: true }).waitFor();
};
const open = (p: Page) => goto(p, "Automation");

/** Runs the installed launcher the way a terminal does: the shim and its console output, through the app's own executable as Node. */
async function speakkit(a: { userData: string; port: number; sandbox: string }, args: string[]) {
  const env = { ...process.env, SPEAKKIT_USER_DATA: a.userData, SPEAKKIT_PORT: String(a.port) };
  const file = process.platform === "win32" ? path.join(a.userData, "bin", "speakkit.cmd") : path.join(a.sandbox, "bin", "speakkit");
  try {
    const r = await run(process.platform === "win32" ? "cmd.exe" : file, process.platform === "win32" ? ["/c", file, ...args] : args, { env, windowsHide: true });
    return { code: 0, out: r.stdout, err: r.stderr };
  } catch (e) {
    const x = e as { code: number; stdout: string; stderr: string };
    return { code: x.code, out: x.stdout, err: x.stderr };
  }
}

describe("Automation page", () => {
  it("shows the tool, what this version can do, the error codes and the real server limits", async () => {
    const a = await start();
    await open(a.page);
    await a.page.getByTestId("automation-cli").waitFor();
    expect(await a.page.getByTestId("automation-cli").innerText()).toContain("Not installed");
    const chips = await a.page.getByTestId("automation-capabilities").innerText();
    expect(chips).toContain("speak");
    expect(chips).toContain("live-stream · parked");
    expect((await a.page.getByTestId("automation-errors").getByRole("row").allInnerTexts()).map((t) => t.split("\n")[0])).toEqual([
      "model_missing",
      "busy",
      "permission_denied",
      "too_large",
      "unsupported",
      "queue_full",
      "invalid_input",
      "not_running",
      "token_rejected",
      "timeout",
      "failed",
    ]);
    const limits = a.page.getByTestId("automation-limits");
    expect(await limits.getAttribute("data-offline")).toBe("false");
    expect(await limits.innerText()).toContain("Live streams");
    expect(await limits.innerText()).toContain("100 000 characters");
  });

  it("puts the command on the PATH, prints in a terminal, and takes it off again", async () => {
    const a = await start();
    await open(a.page);
    await a.page.getByRole("button", { name: "Put on PATH" }).click();
    await vi.waitFor(async () => expect(await a.page.getByTestId("automation-cli").innerText()).toContain("Installed"));
    expect(await a.page.getByTestId("automation-terminal").innerText()).toContain("Working");
    await a.page.getByText("Open a new terminal").waitFor();

    // The launcher file is real, and running it prints in the terminal that ran it.
    const status = await speakkit(a, ["status", "--json"]);
    expect({ code: status.code, err: status.err, out: status.code ? status.out : "" }).toEqual({ code: 0, err: "", out: "" });
    expect(JSON.parse(status.out)).toMatchObject({ status: "idle", queued: 0 });
    const caps = await speakkit(a, ["capabilities", "--json"]);
    expect(JSON.parse(caps.out)).toMatchObject({ app: "speakkit", commands: { speak: "available", "live-stream": "parked" } });

    await a.page.getByRole("button", { name: "Test in terminal" }).click();
    await vi.waitFor(async () => expect(await a.app.evaluate(() => (globalThis as unknown as { __speakkit: { terminals(): string[] } }).__speakkit.terminals())).toHaveLength(1));

    await a.page.getByRole("button", { name: "Remove" }).click();
    await vi.waitFor(async () => expect(await a.page.getByTestId("automation-cli").innerText()).toContain("Not installed"));
  });

  it("shows Repair when the launcher file is gone, and repairing brings it back", async () => {
    const a = await start();
    await open(a.page);
    await a.page.getByRole("button", { name: "Put on PATH" }).click();
    await a.page.getByRole("button", { name: "Remove" }).waitFor();
    const { rm } = await import("node:fs/promises");
    const file = process.platform === "win32" ? path.join(a.userData, "bin", "speakkit.cmd") : path.join(a.sandbox, "bin", "speakkit");
    await rm(file);
    // The page reads again when it opens.
    await goto(a.page, "General");
    await open(a.page);
    if (process.platform === "win32") {
      expect(await a.page.getByTestId("automation-terminal").innerText()).toContain("Terminal output is off");
      expect(await a.page.getByTestId("automation-terminal").innerText()).toContain("speakkit.cmd is missing");
      await a.page.getByRole("button", { name: "Repair" }).click();
      await vi.waitFor(() => expect(existsSync(file)).toBe(true));
    }
  });

  it("installs the agent skill and then shows it as up to date", async () => {
    const a = await start();
    await open(a.page);
    await a.page.getByRole("button", { name: "Install skill" }).click();
    await vi.waitFor(async () => expect(await a.page.getByTestId("automation-skill").innerText()).toContain("Up to date"));
    const file = path.join(a.home, ".claude", "skills", "speakkit", "SKILL.md");
    expect(readFileSync(file, "utf8")).toContain("<!-- speakkit-version:");
  });

  it("every control on the page has a name and the keyboard reaches the actions", async () => {
    const a = await start();
    await open(a.page);
    await a.page.getByTestId("automation-cli").waitFor();
    const unnamed = await a.page.evaluate(() =>
      [...document.querySelectorAll("button, [role=switch], pre[tabindex]")].filter((e) => !(e.getAttribute("aria-label") || e.textContent?.trim())).map((e) => e.outerHTML.slice(0, 100)),
    );
    expect(unnamed).toEqual([]);
    await a.page.getByRole("button", { name: "Put on PATH" }).focus();
    expect(await a.page.evaluate(() => document.activeElement?.textContent)).toBe("Put on PATH");
  });

  it("stays inside the 960 px window with nothing scrolling sideways", async () => {
    const a = await start();
    await a.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(960, 700));
    await open(a.page);
    await a.page.getByTestId("automation-cli").waitFor();
    expect(await a.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});

describe("the speakkit command against the running app", () => {
  it("speaks, reports, previews and stops through the real server", async () => {
    const a = await start();
    await open(a.page);
    await a.page.getByRole("button", { name: "Put on PATH" }).click();
    await a.page.getByRole("button", { name: "Remove" }).waitFor();

    const printed = await speakkit(a, ["speak", "--print", "Hello there. How are you today?"]);
    expect(printed).toMatchObject({ code: 0, out: "Hello there.\nHow are you today?\n" });

    const spoken = await speakkit(a, ["speak", "Hello there.", "--json"]);
    expect(spoken.code).toBe(0);
    expect(JSON.parse(spoken.out)).toMatchObject({ position: 0, sentences: 1 });
    const queued = await speakkit(a, ["speak", "--queue", "Second one.", "--json"]);
    expect(queued.code).toBe(0);
    const q = await speakkit(a, ["queue", "--json"]);
    expect(JSON.parse(q.out)).toHaveProperty("items");
    const stopped = await speakkit(a, ["stop", "--json"]);
    expect(JSON.parse(stopped.out)).toMatchObject({ status: "idle", queued: 0 });

    const bad = await speakkit(a, ["speak", "--print"]);
    expect(bad.code).toBe(2);
    expect(bad.err).toContain("invalid_input");
  });

  it("refuses a request that is too large with exit code 1", async () => {
    const a = await start();
    await open(a.page);
    await a.page.getByRole("button", { name: "Put on PATH" }).click();
    await a.page.getByRole("button", { name: "Remove" }).waitFor();
    const big = path.join(a.sandbox, "big.txt");
    (await import("node:fs")).writeFileSync(big, "a".repeat(100_001));
    const r = await speakkit(a, ["speak", big]);
    expect(r.code).toBe(1);
    expect(r.err).toContain("too_large");
  });

  it("prints the labs in a terminal and changes one without touching other settings, and the running app follows", async () => {
    const a = await start({ speed: 1.5, futureThing: { a: 1 } });
    await open(a.page);
    await a.page.getByRole("button", { name: "Put on PATH" }).click();
    await a.page.getByRole("button", { name: "Remove" }).waitFor();
    const list = await speakkit(a, ["labs", "list"]);
    expect(list.code).toBe(0);
    expect(list.out).toContain("hide-tray-icon	off");
    expect(await speakkit(a, ["labs", "on", "hide-tray-icon"])).toMatchObject({ code: 0 });
    const stored = JSON.parse(readFileSync(path.join(a.userData, "config.json"), "utf8"));
    expect(stored).toMatchObject({ speed: 1.5, futureThing: { a: 1 }, labs: { "hide-tray-icon": true } });
    expect((await speakkit(a, ["labs", "on", "nope"])).code).toBe(3);
    await goto(a.page, "Experiments");
    await vi.waitFor(async () => expect(await a.page.getByRole("switch", { name: "Hide the tray icon" }).getAttribute("aria-checked")).toBe("true"));
  });

  it("a wrong token is rejected with exit code 3", async () => {
    const a = await start();
    await open(a.page);
    await a.page.getByRole("button", { name: "Put on PATH" }).click();
    await a.page.getByRole("button", { name: "Remove" }).waitFor();
    const wrong = await new Promise<{ code: number; err: string }>((resolve) => {
      execFile(
        electronPath,
        [path.resolve(__dirname, "../dist/main/cli.js"), "status", "--token", "wrong", "--port", String(a.port)],
        { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", SPEAKKIT_USER_DATA: a.userData } },
        (e, _o, err) => resolve({ code: (e as { code?: number } | null)?.code ?? 0, err }),
      );
    });
    expect(wrong.code).toBe(3);
    expect(wrong.err).toContain("token_rejected");
  });
});
