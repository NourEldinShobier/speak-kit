import { describe, expect, it } from "vite-plus/test";
import { DownloadError, hostOf } from "../src";
import { checksumFailure, httpFailure, incompleteFailure, toDownloadError, worthAnotherHost } from "../src/stt/download-error";

const URL1 = "https://huggingface.co/ggml-org/x/resolve/main/m.bin";
const withCause = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error(code), { code }) });

describe("toDownloadError", () => {
  it("names the host when the server cannot be reached", () => {
    const e = toDownloadError(withCause("ENOTFOUND"), URL1, 214);
    expect(e).toBeInstanceOf(DownloadError);
    expect(e.kind).toBe("unreachable");
    expect(e.host).toBe("huggingface.co");
    expect(e.keptBytes).toBe(214);
    expect(e.message).toBe("Could not reach the model server huggingface.co. Check your connection, and that your network or firewall allows huggingface.co.");
    expect(e.advice).toBe("try-again");
  });

  it.each(["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"])("treats %s as unreachable", (code) => {
    expect(toDownloadError(withCause(code), URL1, 0).kind).toBe("unreachable");
  });

  it("understands the browser engine's network error names", () => {
    expect(toDownloadError(new TypeError("net::ERR_NAME_NOT_RESOLVED"), URL1, 0).kind).toBe("unreachable");
    expect(toDownloadError(new TypeError("net::ERR_PROXY_CONNECTION_FAILED"), URL1, 0).kind).toBe("unreachable");
  });

  it("explains a certificate failure as secure-traffic inspection and points to the proxy settings", () => {
    for (const code of ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "SELF_SIGNED_CERT_IN_CHAIN", "ERR_CERT_AUTHORITY_INVALID"]) {
      const e = toDownloadError(withCause(code), URL1, 5);
      expect(e.kind).toBe("tls");
      expect(e.message).toContain("huggingface.co");
      expect(e.message).toContain("inspects secure traffic");
      expect(e.advice).toBe("open-proxy-settings");
    }
  });

  it("reports a full disk without a host", () => {
    const e = toDownloadError(Object.assign(new Error("no space"), { code: "ENOSPC" }), URL1, 9);
    expect(e.kind).toBe("disk");
    expect(e.host).toBe("");
    expect(e.advice).toBe("free-space");
  });

  it("keeps the original message for anything else, with the host", () => {
    const e = toDownloadError(new Error("boom"), URL1, 0);
    expect(e.kind).toBe("other");
    expect(e.message).toBe("The download from huggingface.co failed: boom");
  });

  it("copes with non-error throwables and an unparsable address", () => {
    expect(toDownloadError("weird", "not a url", 0).message).toBe("The download from  failed: weird");
    expect(hostOf("not a url")).toBe("");
  });

  it("returns a DownloadError unchanged", () => {
    const e = checksumFailure("m.bin", URL1);
    expect(toDownloadError(e, "https://other.example/x", 1)).toBe(e);
  });
});

describe("httpFailure", () => {
  it.each([
    [407, "proxy-auth", "open-proxy-settings"],
    [403, "blocked", "open-proxy-settings"],
    [401, "blocked", "open-proxy-settings"],
    [404, "not-found", "try-again"],
    [503, "server", "try-again"],
  ] as const)("HTTP %i is %s", (status, kind, advice) => {
    const e = httpFailure(status, URL1, 100);
    expect(e.kind).toBe(kind);
    expect(e.advice).toBe(advice);
    expect(e.message).toContain("huggingface.co");
    expect(e.message).toContain(`${status}`);
    expect(e.keptBytes).toBe(100);
  });
});

describe("local failures", () => {
  it("a checksum failure says the file was removed and offers a new download", () => {
    const e = checksumFailure("m.bin", URL1);
    expect(e.message).toBe("The downloaded file did not match its check value, so it was removed. Download it again. (m.bin)");
    expect(e.advice).toBe("download-again");
    expect(e.keptBytes).toBe(0);
  });

  it("an incomplete download keeps what it has, never a negative count", () => {
    expect(incompleteFailure("m.bin", URL1, 5, 10).keptBytes).toBe(5);
    expect(incompleteFailure("m.bin", URL1, -1, 10).keptBytes).toBe(0);
  });

  it("another host is worth trying for network failures only", () => {
    expect(worthAnotherHost(httpFailure(503, URL1, 0))).toBe(true);
    expect(worthAnotherHost(toDownloadError(withCause("ENOTFOUND"), URL1, 0))).toBe(true);
    expect(worthAnotherHost(checksumFailure("m", URL1))).toBe(false);
    expect(worthAnotherHost(incompleteFailure("m", URL1, 1, 2))).toBe(false);
  });
});
