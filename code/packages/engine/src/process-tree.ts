import { execFile, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { isWindows } from "./platform";

/**
 * Kills a child and everything it started (pip and uv spawn their own children, which a plain kill leaves running).
 * Windows: `taskkill /T /F` through execFile, no shell. Elsewhere the child alone is killed.
 * Resolves once the kill was issued; wait for the child's own `exit` event to know it is gone.
 */
export function killTree(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  if (!isWindows || pid === undefined) {
    child.kill();
    return Promise.resolve();
  }
  const taskkill = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe");
  return new Promise((resolve) => {
    execFile(taskkill, ["/pid", String(pid), "/T", "/F"], { windowsHide: true }, (err) => {
      if (err) child.kill(); // already gone, or taskkill refused: fall back to the single process
      resolve();
    });
  });
}
