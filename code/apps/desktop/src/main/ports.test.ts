import { describe, expect, it } from "vite-plus/test";
import { listenWithFallback } from "./ports";

const inUse = () => Object.assign(new Error("busy"), { code: "EADDRINUSE" });

describe("listenWithFallback", () => {
  it("skips busy ports and returns the first free one", async () => {
    const tried: number[] = [];
    const make = (port: number) => ({
      port,
      listen: async () => (tried.push(port), port < 5002 && Promise.reject(inUse())),
    });
    const { port, server } = await listenWithFallback(5000, make);
    expect(port).toBe(5002);
    expect(server.port).toBe(5002);
    expect(tried).toEqual([5000, 5001, 5002]);
  });

  it("rethrows errors that are not EADDRINUSE", async () => {
    const boom = {
      listen: () => Promise.reject(Object.assign(new Error("denied"), { code: "EACCES" })),
    };
    await expect(listenWithFallback(50000, () => boom)).rejects.toThrow("denied");
  });

  it("gives up after the tries are used", async () => {
    const busy = { listen: () => Promise.reject(inUse()) };
    await expect(listenWithFallback(50000, () => busy, 3)).rejects.toThrow("No free port from 50000 to 50002");
  });
});
