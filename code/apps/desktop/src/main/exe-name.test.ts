import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const lines = readFileSync(path.join(here, "../../electron-builder.yml"), "utf8").split(/\r?\n/);
const value = (key: string): string | undefined => {
  const line = lines.find((l) => l.trim().startsWith(`${key}:`));
  return line
    ?.slice(line.indexOf(":") + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
};

/** Programs that game overlays and detection lists (voice chat apps, graphics vendor tools) already know; ours must not share their file name. */
const KNOWN = [
  "discord",
  "discordptb",
  "discordcanary",
  "update",
  "nvidia share",
  "nvidia overlay",
  "nvcontainer",
  "nvsphelper64",
  "geforce experience",
  "overwolf",
  "steam",
  "obs64",
  "gamebar",
  "xboxgamebar",
];

describe("executable name", () => {
  const exe = (value("executableName") ?? value("productName") ?? "").toLowerCase();

  it("is not the name of a program that game detection or an overlay already knows", () => {
    expect(exe).not.toBe("");
    expect(KNOWN).not.toContain(exe.replace(/\.exe$/, ""));
  });

  it("is the product name, so the installed program and the window title agree", () => {
    expect(value("productName")).toBe("Speak Kit");
  });

  it("the app id and the window class are not those of a program the same lists know", () => {
    // Windows version info (file description, company) is taken from the product name by the packager; the window class is Chromium's own.
    const id = (value("appId") ?? "").toLowerCase();
    expect(id).toMatch(/^[a-z]+\.speakkit\./);
    for (const k of KNOWN) expect(id).not.toContain(k.replaceAll(" ", ""));
    expect(KNOWN).not.toContain("chrome_widgetwin_1");
  });

  it("the check itself notices a colliding name", () => {
    expect(KNOWN).toContain("discord");
  });
});
