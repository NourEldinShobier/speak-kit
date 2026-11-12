import { describe, expect, it } from "vite-plus/test";
import { dataDirFor, discover, type DiscoverIo } from "./discover";

const io = (files: Record<string, string>, env: Record<string, string> = {}, platform: NodeJS.Platform = "win32"): DiscoverIo => ({
  env: { APPDATA: "C:\\Users\\me\\AppData\\Roaming", ...env },
  platform,
  home: platform === "win32" ? "C:\\Users\\me" : "/Users/me",
  readText: async (f) => files[f.replace(/\\/g, "/")] ?? null,
});
const DIR = "C:/Users/me/AppData/Roaming/@speakkit/desktop";

describe("dataDirFor", () => {
  it("is the userData folder of the app on each OS", () => {
    expect(dataDirFor({ platform: "win32", env: { APPDATA: "C:\\Users\\me\\AppData\\Roaming" }, home: "C:\\Users\\me" })).toBe("C:\\Users\\me\\AppData\\Roaming\\@speakkit\\desktop");
    expect(dataDirFor({ platform: "darwin", env: {}, home: "/Users/me" })).toBe("/Users/me/Library/Application Support/@speakkit/desktop");
  });
  it("falls back to the home folder when APPDATA is missing", () => {
    expect(dataDirFor({ platform: "win32", env: {}, home: "C:\\Users\\me" })).toBe("C:\\Users\\me\\AppData\\Roaming\\@speakkit\\desktop");
  });
  it("SPEAKKIT_USER_DATA wins, as it does in the app", () => {
    expect(dataDirFor({ platform: "darwin", env: { SPEAKKIT_USER_DATA: "/tmp/x" }, home: "/Users/me" })).toBe("/tmp/x");
  });
});

describe("discover", () => {
  it("reads the token file and the port the app wrote", async () => {
    const c = await discover(io({ [`${DIR}/token`]: "abc\n", [`${DIR}/server.json`]: '{"port":47616}' }), {});
    expect(c).toEqual({ base: "http://127.0.0.1:47616", token: "abc" });
  });
  it("prefers flags over environment over files", async () => {
    const files = { [`${DIR}/token`]: "file", [`${DIR}/server.json`]: '{"port":1111}' };
    expect(await discover(io(files, { SPEAKKIT_TOKEN: "env", SPEAKKIT_PORT: "2222" }), {})).toEqual({ base: "http://127.0.0.1:2222", token: "env" });
    expect(await discover(io(files, { SPEAKKIT_TOKEN: "env", SPEAKKIT_PORT: "2222" }), { token: "flag", port: "3333" })).toEqual({ base: "http://127.0.0.1:3333", token: "flag" });
  });
  it("uses the saved port, then the default, when server.json is missing or broken", async () => {
    expect((await discover(io({ [`${DIR}/token`]: "t", [`${DIR}/config.json`]: '{"preferredPort":50000}' }), {})).base).toBe("http://127.0.0.1:50000");
    expect((await discover(io({ [`${DIR}/token`]: "t", [`${DIR}/server.json`]: "{broken", [`${DIR}/config.json`]: "[]" }), {})).base).toBe("http://127.0.0.1:47615");
    expect((await discover(io({ [`${DIR}/token`]: "t" }), {})).base).toBe("http://127.0.0.1:47615");
  });
  it.each(["0", "65536", "abc", "1.5", "-1"])("refuses the port %s as invalid_input", async (port) => {
    await expect(discover(io({ [`${DIR}/token`]: "t" }), { port })).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("ignores an out-of-range port in server.json", async () => {
    expect((await discover(io({ [`${DIR}/token`]: "t", [`${DIR}/server.json`]: '{"port":99999}' }), {})).base).toBe("http://127.0.0.1:47615");
  });
  it("says the app has not been started when there is no token anywhere", async () => {
    await expect(discover(io({}), {})).rejects.toMatchObject({ code: "not_running", message: expect.stringContaining("no token") });
    await expect(discover(io({ [`${DIR}/token`]: "  \n" }), {})).rejects.toMatchObject({ code: "not_running" });
  });
  it("works the same on macOS", async () => {
    const files = { "/Users/me/Library/Application Support/@speakkit/desktop/token": "mac" };
    expect(await discover(io(files, {}, "darwin"), {})).toEqual({ base: "http://127.0.0.1:47615", token: "mac" });
  });
});
