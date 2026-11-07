import { spawn } from "node:child_process";
import { describe, expect, it } from "vite-plus/test";
import { isWindows } from "../src/platform";
import { killTree } from "../src/process-tree";

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

// The parent starts a grandchild that sleeps and prints its pid, then sleeps too.
const parentScript = `const c = require("child_process").spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
console.log(c.pid); setTimeout(() => {}, 60000);`;

describe("killTree", () => {
  it.skipIf(!isWindows)("kills the child and the processes it started", async () => {
    const parent = spawn(process.execPath, ["-e", parentScript], { stdio: ["ignore", "pipe", "ignore"] });
    const grandchild = await new Promise<number>((resolve) => parent.stdout.once("data", (d) => resolve(Number(String(d).trim()))));
    expect(alive(grandchild)).toBe(true);
    const exited = new Promise((resolve) => parent.once("exit", resolve));
    await killTree(parent);
    await exited;
    await new Promise((r) => setTimeout(r, 200));
    expect(alive(grandchild)).toBe(false);
  });

  it("kills a plain child and ignores one that already exited", async () => {
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });
    const exited = new Promise((resolve) => child.once("exit", resolve));
    await killTree(child);
    await exited;
    await expect(killTree(child)).resolves.toBeUndefined();
  });
});
