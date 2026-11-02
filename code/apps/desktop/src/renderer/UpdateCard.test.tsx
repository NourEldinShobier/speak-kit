import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { parseConfig } from "../shared/schemas";
import type { UpdateState } from "../shared/updates";
import { appState } from "./app-state.fixture";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { UpdateCard, UpdatePill, UpdatingCard } from "./UpdateCard";

const card = (update: UpdateState, over = {}) => renderToStaticMarkup(<UpdateCard s={appState({ update, ...over })} />);
const pill = (update: UpdateState, config = {}) => renderToStaticMarkup(<UpdatePill s={appState({ update, config: parseConfig({ setupDone: true, ...config }) })} />);

describe("UpdateCard", () => {
  it("unsupported (portable or source copy) says it does not update itself", () => {
    expect(card({ kind: "unsupported" })).toContain("so it does not update itself");
  });

  it("manual (macOS) shows the version, the release notes and a Download button", () => {
    const html = card({ kind: "manual", version: "0.4.0", url: "https://github.com/NourEldinShobier/speak-kit/releases/tag/v0.4.0" });
    for (const text of ["Speak Kit 0.4.0 is available", "Release notes", "Download", "Remind me later"]) expect(html).toContain(text);
    expect(html).not.toContain("Restart now");
  });

  it.each([
    ["offline", "check", "Could not check for updates", "cannot reach the update server"],
    ["not-found", "check", "Could not check for updates", "No update information is published"],
    ["checksum", "download", "Could not download the update", "did not match its checksum"],
    ["interrupted", "download", "Could not download the update", "connection dropped"],
  ] as const)("a %s failure during %s", (reason, phase, title, body) => {
    const html = card({ kind: "error", message: "raw", reason, phase });
    expect(html).toContain(title);
    expect(html).toContain(body);
    expect(html).toContain("Try again");
  });

  it("an unknown failure shows the raw message", () => {
    expect(card({ kind: "error", message: "disk full", reason: "other", phase: "download" })).toContain("disk full");
  });

  it("ready offers both install choices", () => {
    const html = card({ kind: "ready", version: "0.3.2", onQuit: false });
    for (const text of ["Install when I quit", "Restart now", "Remind me later"]) expect(html).toContain(text);
  });
});

describe("UpdateCard progress and arming", () => {
  it("downloading shows the version and percent", () => {
    expect(card({ kind: "downloading", version: "0.3.2", percent: 41 })).toContain("Downloading 0.3.2, 41%");
  });

  it("ready with Install when I quit armed says so and drops that button", () => {
    const html = card({ kind: "ready", version: "0.3.2", onQuit: true });
    expect(html).toContain("It installs when you quit Speak Kit.");
    expect(html).not.toContain("Install when I quit</button>");
    expect(html).not.toContain("Remind me later");
  });

  it("restarting shows the updating card", () => {
    const html = renderToStaticMarkup(<UpdatingCard s={appState({ update: { kind: "restarting", version: "0.3.2" } })} />);
    expect(html).toContain("Updating to 0.3.2");
    expect(renderToStaticMarkup(<UpdatingCard s={appState({ update: { kind: "idle", checkedAtMs: null } })} />)).toBe("");
  });
});

describe("UpdatePill", () => {
  it("shows for a downloaded update and for a manual one, not otherwise", () => {
    expect(pill({ kind: "ready", version: "0.3.2", onQuit: false })).toContain("Update ready · 0.3.2");
    expect(pill({ kind: "manual", version: "0.4.0", url: "https://github.com/NourEldinShobier/speak-kit/releases/" })).toContain("Update available · 0.4.0");
    expect(pill({ kind: "available", version: "0.3.2" })).toBe("");
  });

  it("Remind me later hides it for a day", () => {
    expect(pill({ kind: "ready", version: "0.3.2", onQuit: false }, { updateRemindAtMs: Date.now() + 60_000 })).toBe("");
  });
});
