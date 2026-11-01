import { describe, expect, it } from "vite-plus/test";
import { IDLE_READER } from "./reader";
import { classifyUpdateError, isNewerVersion, updateBlockers, updateErrorText, workRunning } from "./updates";

describe("classifyUpdateError", () => {
  it.each([
    ["sha512 checksum mismatch, expected a, got b", "checksum"],
    ["Cannot find latest.yml in the latest release artifacts: HttpError: 404 Not Found", "not-found"],
    ["GitHub answered 404 for the latest release", "not-found"],
    ["read ECONNRESET", "interrupted"],
    ["net::ERR_CONNECTION_RESET", "interrupted"],
    ["net::ERR_INTERNET_DISCONNECTED", "offline"],
    ["getaddrinfo ENOTFOUND github.com", "offline"],
    ["connect ECONNREFUSED 127.0.0.1:1", "offline"],
    ["fetch failed", "offline"],
    ["something else broke", "other"],
  ] as const)("%s -> %s", (message, reason) => expect(classifyUpdateError(message)).toBe(reason));
});

describe("updateErrorText", () => {
  it("words each reason and shows the raw message only for an unknown one", () => {
    expect(updateErrorText("offline", "check", "x")).toEqual({ title: "Could not check for updates", body: expect.stringContaining("cannot reach the update server") });
    expect(updateErrorText("checksum", "download", "x").title).toBe("Could not download the update");
    expect(updateErrorText("other", "check", "weird").body).toBe("weird");
  });
});

describe("isNewerVersion", () => {
  it.each([
    ["0.3.2", "0.3.1", true],
    ["v0.4.0", "0.3.9", true],
    ["0.10.0", "0.9.0", true],
    ["0.3.1", "0.3.1", false],
    ["0.3.0", "0.3.1", false],
    ["0.4.0", "0.4.0-beta.1", true],
    ["0.4.0-beta.1", "0.4.0", false],
    ["garbage", "0.3.1", false],
  ] as const)("%s over %s is %s", (a, b, want) => expect(isNewerVersion(a, b)).toBe(want));
});

describe("updateBlockers", () => {
  it("counts a reading in any live status and the exports that are working", () => {
    expect(workRunning({ reader: IDLE_READER, exports: [] })).toBe(false);
    expect(updateBlockers({ reader: { ...IDLE_READER, status: "paused" }, exports: [] })).toEqual({ reading: true, exports: 0 });
  });
});
