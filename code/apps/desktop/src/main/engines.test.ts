import { describe, expect, it, vi } from "vite-plus/test";
import type { Ctx } from "./context";
import { engineHandlers } from "./engines";
import { ServerError, type ServerApi } from "./server-api";

const setup = (server: Partial<Record<keyof ServerApi, (...a: never[]) => unknown>>) => {
  const publish = vi.fn();
  const handlers = engineHandlers({ server, publish } as unknown as Ctx);
  return { handlers, publish };
};
const list = { active: "kokoro", engines: [] };

describe("engineHandlers", () => {
  it("returns the server's engine list without publishing", async () => {
    const t = setup({ engines: async () => list });
    expect(await t.handlers.engines()).toBe(list);
    expect(t.publish).not.toHaveBeenCalled();
  });

  it.each([
    ["selectEngine", "chatterbox"],
    ["installEngine", "chatterbox"],
    ["cancelInstall", "chatterbox"],
    ["removeEngine", "chatterbox"],
  ] as const)("%s calls the server with the id and then refreshes the health pill", async (method, id) => {
    const calls: string[] = [];
    const t = setup({ [method]: async (x: string) => (calls.push(x), list) });
    expect(await t.handlers[method](id)).toBe(list);
    expect(calls).toEqual([id]);
    expect(t.publish).toHaveBeenCalledTimes(1);
  });

  it("does not publish when the server call fails", async () => {
    const t = setup({ selectEngine: async () => Promise.reject(new Error("busy")) });
    await expect(t.handlers.selectEngine("kokoro")).rejects.toThrow("busy");
    expect(t.publish).not.toHaveBeenCalled();
  });

  it("explains a 404 from an older server in plain words", async () => {
    const t = setup({ engines: async () => Promise.reject(new ServerError(404, "not-found", "no route")) });
    await expect(t.handlers.engines()).rejects.toThrow("This version of the voice server has no engine list.");
  });

  it("passes other server errors through unchanged", async () => {
    const err = new ServerError(409, "engine-unavailable", "No GPU");
    const t = setup({ installEngine: async () => Promise.reject(err) });
    await expect(t.handlers.installEngine("chatterbox")).rejects.toBe(err);
  });

  it("warms the engine", async () => {
    const warm = vi.fn(async () => undefined);
    await setup({ warm }).handlers.warmEngine();
    expect(warm).toHaveBeenCalledTimes(1);
  });
});
