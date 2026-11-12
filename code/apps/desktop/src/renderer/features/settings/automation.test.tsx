import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { ERROR_CODES } from "../../../shared/control/contract";
import { MCP_TOOLS } from "../../../shared/control/mcp-tools";
import { parseConfig } from "../../../shared/schemas";
import { appState } from "../../app-state.fixture";
import { AutomationPage } from "./AutomationPage";
import { COMMAND_ROWS, commandLineView, DEEP_LINKS, discoveryPath, ERROR_ROWS, EXIT_ROWS, MCP_CONFIG, toolRows } from "./automation";

const state = (controlServer: boolean, platform = "win32", mcpTools = {}) => appState({ platform, config: parseConfig({ controlServer, mcpTools }) });

describe("automation model", () => {
  it("names the discovery file the way each system writes it", () => {
    expect(discoveryPath("win32")).toBe("%APPDATA%\\Speak Kit\\control.json");
    expect(discoveryPath("darwin")).toBe("~/Library/Application Support/Speak Kit/control.json");
  });

  it("the MCP block starts the bridge by command and holds no token", () => {
    expect(JSON.parse(MCP_CONFIG)).toEqual({ mcpServers: { speakkit: { command: "speakkit", args: ["mcp"] } } });
  });

  it("lists every exit code, every error code with a sentence, the commands and four deep links", () => {
    expect(EXIT_ROWS.map((r) => r.code)).toEqual([0, 1, 2, 3, 4]);
    expect(Object.keys(ERROR_ROWS).sort()).toEqual([...ERROR_CODES].sort());
    expect(COMMAND_ROWS.length).toBe(5);
    expect(DEEP_LINKS.map((l) => l.url)).toEqual(["speakkit://settings/shortcuts", "speakkit://settings/diagnostics", "speakkit://settings/experiments", "speakkit://lab/caption-export"]);
  });

  it("says what the command-line row shows and offers in each state", () => {
    expect(commandLineView({ kind: "not-installed" }, "1.2.3")).toMatchObject({ pill: { text: "Not installed" }, action: { label: "Install", do: "install" } });
    expect(commandLineView({ kind: "installed", where: "x" }, "1.2.3")).toEqual({ pill: { tone: "green", text: "Installed" }, text: "Version 1.2.3 · on your PATH for new terminals", action: { label: "Remove", do: "remove" } });
    expect(commandLineView({ kind: "needs-repair", why: "The launcher file is missing." }, "1")).toMatchObject({ text: "The launcher file is missing. Repair puts it back.", action: { label: "Repair", do: "install" } });
    expect(commandLineView({ kind: "needs-path", where: "/h/.local/bin/speakkit", folder: "/h/.local/bin" }, "1").text).toContain("/h/.local/bin, which is not on your PATH");
    expect(commandLineView({ kind: "unavailable", reason: "Only the installed app." }, "1")).toMatchObject({ pill: { text: "Not available" }, text: "Only the installed app.", action: null });
  });

  it("lists every tool with its switch: reading tools on, tools that read your words off, until chosen", () => {
    expect(toolRows({}).map((t) => [t.name, t.on])).toEqual(MCP_TOOLS.map((t) => [t.name, !t.private]));
    expect(toolRows({ history_search: true, read_aloud: false }).filter((t) => ["history_search", "read_aloud"].includes(t.name)).map((t) => t.on)).toEqual([false, true]);
  });
});

describe("Automation page", () => {
  it("with the server running shows Running, no warning, the sections and a named switch for every tool", () => {
    const html = renderToStaticMarkup(<AutomationPage s={state(true)} />);
    expect(html).toContain("Running");
    expect(html).not.toContain("The local server is not running");
    for (const t of ["Command-line tool", "MCP server", "Deep links", "speakkit status --json", "control.json", "Show file", "Reset token", "Error codes", "What it can do"]) expect(html).toContain(t);
    for (const t of MCP_TOOLS) expect(html).toContain(`aria-label="${t.title}"`);
    expect(html).toMatch(/aria-label="Copy speakkit:\/\/settings\/shortcuts"/);
  });

  it("shows a loading line until the app has answered", () => {
    expect(renderToStaticMarkup(<AutomationPage s={state(true)} />)).toContain("Loading…");
  });

  it("with the server off shows the warning with Start server, Off, and the tool switches disabled", () => {
    const html = renderToStaticMarkup(<AutomationPage s={state(false, "darwin")} />);
    expect(html).toContain("The local server is not running");
    expect(html).toContain("Start server");
    expect(html).toContain("Library/Application Support");
    expect(html).toMatch(/aria-label="Let AI apps use Speak Kit"/);
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(MCP_TOOLS.length);
  });
});
