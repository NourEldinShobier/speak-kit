import { describe, expect, it } from "vite-plus/test";
import type { DesktopError } from "../shared/errors";
import { ERROR_TEXT, errorText, updateErrorText } from "./error-text";

const CASES: [DesktopError, string][] = [
  [{ code: "unexpected", args: { detail: "disk full" } }, "disk full"],
  [{ code: "server-error", args: { status: 500, detail: "model not loaded" } }, "model not loaded"],
  [{ code: "server-error", args: { status: 502, detail: null } }, "The server answered HTTP 502."],
  [{ code: "no-audio" }, "The server sent no audio."],
  [{ code: "no-free-port", args: { from: 47615, to: 47634 } }, "No free port from 47615 to 47634"],
  [{ code: "file-too-large", args: { name: "book.pdf", mb: 100 } }, "book.pdf is larger than 100 MB."],
  [{ code: "dropped-file-too-large", args: { mb: 100 } }, "The file is larger than 100 MB."],
  [{ code: "page-too-large" }, "That page is larger than 8 MB."],
  [{ code: "not-a-web-address" }, "That is not a web address."],
  [{ code: "only-http" }, "Only http and https addresses can be read."],
  [{ code: "too-many-redirects", args: { host: "a.test" } }, "a.test redirected too many times."],
  [{ code: "local-address", args: { host: "intranet" } }, "intranet is on this computer or your local network. Only public web addresses can be read."],
  [{ code: "no-answer", args: { host: "slow.test", seconds: 15 } }, "slow.test did not answer in 15 seconds."],
  [{ code: "unreachable", args: { host: "gone.test" } }, "Could not reach gone.test. Check the address and your connection."],
  [{ code: "http-status", args: { host: "a.test", status: 404 } }, "a.test answered with HTTP 404."],
  [{ code: "not-a-web-page", args: { host: "a.test", type: "image/png" } }, "a.test is not a web page (image/png). Download the file and add it instead."],
  [{ code: "not-a-web-page", args: { host: "a.test", type: "" } }, "a.test is not a web page (unknown type). Download the file and add it instead."],
  [{ code: "page-has-no-text", args: { host: "a.test" } }, "No readable text was found on a.test."],
  [{ code: "unsupported-type", args: { ext: ".mp4", supported: "TXT, MD" } }, ".mp4 is not a supported type. Supported: TXT, MD."],
  [{ code: "unsupported-type", args: { ext: "", supported: "TXT, MD" } }, "This file is not a supported type. Supported: TXT, MD."],
  [{ code: "unreadable", args: { name: "a.pdf", detail: "bad xref" } }, "a.pdf could not be read: bad xref"],
  [{ code: "file-has-no-text", args: { name: "a.txt" } }, "a.txt has no text to read."],
  [{ code: "nothing-to-add" }, "There is no text to add."],
  [{ code: "bad-archive", args: { name: "a.docx" } }, "a.docx is not a valid archive."],
  [{ code: "archive-too-many-parts", args: { name: "a.docx", count: 9000 } }, "a.docx has too many parts (9000)."],
  [{ code: "archive-part-outside", args: { name: "a.docx" } }, "a.docx contains a part outside its own folder."],
  [{ code: "archive-too-big", args: { name: "a.docx" } }, "a.docx unpacks to far more than its size, so it was not opened."],
  [{ code: "parse-timeout" }, "Reading this took too long, so it was stopped."],
  [{ code: "parser-exited", args: { exitCode: 1 } }, "The reader stopped unexpectedly (1)."],
  [{ code: "could-not-read" }, "This could not be read."],
  [{ code: "too-many-requests" }, "Too many requests at once."],
  [{ code: "nothing-to-export" }, "There is no text to export."],
  [{ code: "file-exists" }, "A file with that name already exists."],
  [{ code: "mp3-failed" }, "MP3 encoding failed."],
  [{ code: "render-failed", args: { detail: "voice missing" } }, "voice missing"],
  [{ code: "render-failed", args: { detail: null } }, "The server could not render the audio."],
  [{ code: "not-exported" }, "That file was not exported by this session."],
  [{ code: "no-selection" }, "No text is selected. Select some text, then try again."],
  [{ code: "empty-clipboard" }, "The clipboard has no text."],
  [{ code: "nothing-to-read" }, "There is no text to read."],
  [{ code: "selection-unsupported" }, "Reading the selection is only available on Windows and macOS."],
  [{ code: "shortcut-invalid" }, "That is not a valid key combination."],
  [{ code: "shortcut-needs-modifier" }, "Use Ctrl or Alt together with another key."],
  [{ code: "shortcut-needs-two" }, "Use at least two modifier keys, such as Ctrl+Alt, so normal typing is not blocked."],
  [{ code: "shortcut-reserved" }, "Windows uses that combination."],
  [{ code: "shortcut-bad-key" }, "That key cannot be used."],
  [{ code: "shortcut-meta-key", args: { platform: "darwin" } }, "The Command key is reserved for macOS."],
  [{ code: "shortcut-meta-key", args: { platform: "win32" } }, "The Windows key is reserved for Windows."],
  [{ code: "shortcut-duplicate" }, "Another Speak Kit action already uses it."],
  [{ code: "shortcut-taken" }, "Another app is using it."],
  [{ code: "update-offline" }, "Speak Kit cannot reach the update server. Check your internet connection and try again."],
  [{ code: "update-not-found" }, "No update information is published at the update address yet. Try again later."],
  [{ code: "update-checksum" }, "The downloaded file did not match its checksum, so it was discarded. Try again; nothing was installed."],
  [{ code: "update-interrupted" }, "The connection dropped during the download. Try again to fetch the update again; nothing was installed."],
  [{ code: "update-failed", args: { detail: "weird" } }, "weird"],
];

describe("errorText", () => {
  it.each(CASES)("%j", (error, text) => expect(errorText(error)).toBe(text));

  it("has a case for every code in the table", () => {
    expect(new Set(CASES.map(([e]) => e.code))).toEqual(new Set(Object.keys(ERROR_TEXT)));
  });

  it("names a code it does not know instead of throwing", () => {
    expect(errorText({ code: "from-the-future" } as never)).toBe("from-the-future");
  });
});

describe("updateErrorText", () => {
  it("takes the title from the phase and the body from the error", () => {
    expect(updateErrorText({ code: "update-offline" }, "check")).toEqual({ title: "Could not check for updates", body: expect.stringContaining("cannot reach the update server") });
    expect(updateErrorText({ code: "update-checksum" }, "download").title).toBe("Could not download the update");
    expect(updateErrorText({ code: "update-failed", args: { detail: "weird" } }, "check").body).toBe("weird");
  });
});
