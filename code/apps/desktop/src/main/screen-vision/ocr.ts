import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { OCR_SCRIPT } from "./ocr-script";
import { parseOcrReply, type OcrLine } from "./ocr-text";

export type OcrResult = { ok: true; lang: string; lines: OcrLine[] } | { ok: false; reason: "no-language" | "failed" | "unsupported" };

/** Reads the text of a picture (PNG bytes). One helper process is started on the first call and kept for a while. */
export interface Ocr {
  recognize(png: Uint8Array): Promise<OcrResult>;
  dispose(): void;
}

/** The helper as the manager sees it: lines in, lines out. Replaced by a fake in tests. */
export interface HostProcess {
  write(line: string): void;
  onLine(cb: (line: string) => void): void;
  onExit(cb: () => void): void;
  kill(): void;
}

/** Windows PowerShell with the OCR program as an encoded command, so nothing is written to disk and stdin stays free for the requests. */
export function spawnPowerShell(): HostProcess {
  const p = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(OCR_SCRIPT, "utf16le").toString("base64")], {
    windowsHide: true,
    stdio: ["pipe", "pipe", "ignore"],
  });
  const lines = createInterface({ input: p.stdout });
  p.stdin.on("error", () => {}); // the process went away: its exit is reported through onExit
  return {
    write: (line) => void p.stdin.write(`${line}\n`),
    onLine: (cb) => void lines.on("line", cb),
    onExit: (cb) => void p.once("exit", cb).once("error", cb),
    kill: () => void p.kill(),
  };
}

export interface OcrOptions {
  start?: () => HostProcess;
  /** The helper stops after this long without a request (it holds about 120 MB). */
  idleMs?: number;
  /** One request, and the helper's start, may take this long. */
  timeoutMs?: number;
}

interface Pending {
  resolve(r: OcrResult): void;
  timer: ReturnType<typeof setTimeout>;
}
interface Live {
  proc: HostProcess;
  /** null until the ready line came; resolves to the language or null when none is installed */
  ready: Promise<string | null | "dead">;
  pending: Map<number, Pending>;
}

const FAILED: OcrResult = { ok: false, reason: "failed" };

/** Starts the helper and routes its lines: the ready line settles `ready`, a result or error line settles the request with that id. */
function launchHost(start: () => HostProcess, timeoutMs: number, onExit: () => void): Live {
  const proc = start();
  const pending = new Map<number, Pending>();
  let settle!: (v: string | null | "dead") => void;
  const ready = new Promise<string | null | "dead">((r) => (settle = r));
  const timer = setTimeout(() => settle("dead"), timeoutMs);
  proc.onLine((line) => {
    const r = parseOcrReply(line);
    if (!r) return;
    if ("ready" in r) {
      clearTimeout(timer);
      settle(r.lang);
      return;
    }
    const p = pending.get(r.id);
    if (!p) return;
    pending.delete(r.id);
    clearTimeout(p.timer);
    p.resolve("error" in r ? FAILED : { ok: true, lang: r.lang ?? "", lines: r.lines });
  });
  proc.onExit(() => {
    clearTimeout(timer);
    settle("dead");
    onExit();
  });
  return { proc, ready, pending };
}

export function createOcr({ start = spawnPowerShell, idleMs = 5 * 60_000, timeoutMs = 20_000 }: OcrOptions = {}): Ocr {
  let live: Live | undefined;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;

  const stop = () => {
    clearTimeout(idle);
    const l = live;
    live = undefined;
    if (!l) return;
    for (const p of l.pending.values()) {
      clearTimeout(p.timer);
      p.resolve(FAILED);
    }
    l.pending.clear();
    l.proc.kill();
  };

  const launch = (): Live => {
    const l: Live = launchHost(start, timeoutMs, () => live === l && stop());
    return l;
  };

  return {
    async recognize(png) {
      if (!live) live = launch();
      const l = live;
      const lang = await l.ready;
      if (lang === "dead") {
        stop();
        return FAILED;
      }
      if (lang === null) return { ok: false, reason: "no-language" };
      clearTimeout(idle);
      idle = setTimeout(stop, idleMs);
      idle.unref?.();
      const id = ++seq;
      return new Promise<OcrResult>((resolve) => {
        const timer = setTimeout(() => {
          l.pending.delete(id);
          stop();
          resolve(FAILED);
        }, timeoutMs);
        l.pending.set(id, { resolve, timer });
        l.proc.write(JSON.stringify({ id, png: Buffer.from(png).toString("base64") }));
      });
    },
    dispose: stop,
  };
}

/** Where there is no recognizer yet (macOS and Linux): the picture goes without text. */
export const noOcr: Ocr = { recognize: async () => ({ ok: false, reason: "unsupported" }), dispose() {} };
