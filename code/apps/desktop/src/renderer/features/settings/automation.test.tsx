import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import type { AppState } from "../../../shared/ipc";
import { AutomationPage } from "./AutomationPage";
import { DEEP_LINKS, discoveryPath, EXIT_ROWS, MCP_CONFIG } from "./automation";

const state = (controlServer: boolean, platform = "win32") => ({ platform, config: { controlServer } }) as unknown as AppState;

describe("automation model", () => {
  it("names the discovery file the way each system writes it", () => {
    expect(discoveryPath("win32")).toBe("%APPDATA%\Speak Kit\control.json");
    expect(discoveryPath("darwin")).toBe("~/Library/Application Support/Speak Kit/control.json");
  });

  it("the MCP block starts the bridge by command and holds no token", () => {
    expect(JSON.parse(MCP_CONFIG)).toEqual({ mcpServers: { speakkit: { command: "speakkit", args: ["mcp"] } } });
  });

  it("lists every exit code the tool can end with, and three deep links", () => {
    expect(EXIT_ROWS.map((r) => r.code)).toEqual([0, 1, 2, 3, 4]);
    expect(DEEP_LINKS.map((l) => l.url)).toEqual(["speakkit://settings/shortcuts", "speakkit://settings/diagnostics", "speakkit://settings/experiments"]);
  });
});

describe("Automation page", () => {
  it("with the server running shows Running, no warning, and every section", () => {
    const html = renderToStaticMarkup(<AutomationPage s={state(true)} />);
    expect(html).toContain("Running");
    expect(html).not.toContain("The local server is not running");
    for (const t of ["Command-line tool", "MCP server", "Deep links", "speakkit status --json", "control.json"]) expect(html).toContain(t);
    expect(html).toMatch(/aria-label="Copy speakkit:\/\/settings\/shortcuts"/);
  });

  it("with the server off shows the warning with Start server and an off toggle", () => {
    const html = renderToStaticMarkup(<AutomationPage s={state(false, "darwin")} />);
    expect(html).toContain("The local server is not running");
    expect(html).toContain("Start server");
    expect(html).toContain("Library/Application Support");
    expect(html).toMatch(/aria-label="Local server"[^>]*/);
  });
});
