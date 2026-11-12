import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { UpdateState } from "../shared/updates";
import { appState } from "./app-state.fixture";

vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = { speakkit: {}, speakkitLibrary: {} };
});

import { UpdateCard, UpdatePill, UpdatingCard } from "./UpdateCard";

const card = (update: UpdateState, over = {}) => renderToStaticMarkup(<UpdateCard s={appState({ update, ...over })} />);
const pill = (update: UpdateState) => renderToStaticMarkup(<UpdatePill s={appState({ update })} />);

describe("UpdateCard", () => {
  it("lists the lines of the release in an available, ready or manual update", () => {
    const notes = ["fix(tray): keep the menu open", "feat: new page"];
    for (const u of [
      { kind: "available", version: "0.4.0", notes },
      { kind: "ready", version: "0.4.0", onQuit: false, notes },
      { kind: "manual", version: "0.4.0", url: "https://github.com/NourEldinShobier/speak-kit/releases/tag/v0.4.0", notes },
    ] as const) {
      const html = card(u);
      expect(html).toContain("fix(tray): keep the menu open");
      expect(html).toContain("feat: new page");
    }
  });

  it("shows no list when the release has no notes", () => {
    expect(card({ kind: "available", version: "0.4.0" })).not.toContain("update-notes");
  });

  it("unsupported (portable or source copy) says it does not update itself", () => {
    expect(card({ kind: "unsupported" })).toContain("so it does not update itself");
  });

  it("manual (macOS) shows the version, the release notes and a Download button", () => {
    const html = card({ kind: "manual", version: "0.4.0", url: "https://github.com/NourEldinShobier/speak-kit/releases/tag/v0.4.0" });
    for (const text of ["Speak Kit 0.4.0 is available", "Release notes", "Download"]) expect(html).toContain(text);
    expect(html).not.toContain("Restart now");
    expect(html).not.toContain("Remind me later");
  });

  it.each([
    ["offline", "check", "Could not check for updates", "cannot reach the update server"],
    ["not-found", "check", "Could not check for updates", "No update information is published"],
    ["checksum", "download", "Could not download the update", "did not match its checksum"],
    ["interrupted", "download", "Could not download the update", "connection dropped"],
  ] as const)("a %s failure during %s", (reason, phase, title, body) => {
    const html = card({ kind: "error", error: { code: `update-${reason}` }, phase });
    expect(html).toContain(title);
    expect(html).toContain(body);
    expect(html).toContain("Try again");
  });

  it("an unknown failure shows the raw message", () => {
    expect(card({ kind: "error", error: { code: "update-failed", args: { detail: "disk full" } }, phase: "download" })).toContain("disk full");
  });

  it("ready offers both install choices", () => {
    const html = card({ kind: "ready", version: "0.3.2", onQuit: false });
    for (const text of ["Install when I quit", "Restart now"]) expect(html).toContain(text);
    expect(html).not.toContain("Remind me later");
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
});
