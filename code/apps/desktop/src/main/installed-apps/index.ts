import { mergeApps, type InstalledApp } from "@speakkit/dictation";
import { macosScan, type MacHost } from "./macos";
import { windowsScan, type WindowsHost } from "./windows";

export interface InstalledAppsResult {
  apps: InstalledApp[];
  /** False when this system cannot list programs or the scan failed: the picker then only offers typing the name. */
  available: boolean;
}

export interface InstalledAppsDeps {
  platform: NodeJS.Platform;
  windows: WindowsHost;
  mac: MacHost;
  now(): number;
  /** How long a scan stays good. The list changes rarely; the picker asks every time it opens. */
  ttlMs?: number;
  /** A scan that has not finished by then counts as failed, so one hung folder cannot block every later ask. */
  scanTimeoutMs?: number;
}

export interface InstalledApps {
  list(refresh?: boolean): Promise<InstalledAppsResult>;
}

function scanFor(d: InstalledAppsDeps): (() => Promise<InstalledApp[]>) | undefined {
  if (d.platform === "win32") return () => windowsScan(d.windows);
  if (d.platform === "darwin") return () => macosScan(d.mac);
  return undefined;
}

/** Rejects when the work has not settled after `ms`; the work itself is left to finish or hang on its own. */
function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("scan timed out")), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

const NONE: InstalledAppsResult = { apps: [], available: false };

/** Finds the installed programs the first time the picker asks, then reuses the answer. Two asks at once share one scan. */
export function createInstalledApps(d: InstalledAppsDeps): InstalledApps {
  const ttl = d.ttlMs ?? 5 * 60_000;
  const scan = scanFor(d);
  const deadline = d.scanTimeoutMs ?? 10_000;
  let cached: { at: number; result: InstalledAppsResult } | undefined;
  let running: Promise<InstalledAppsResult> | undefined;
  return {
    list(refresh = false) {
      if (!scan) return Promise.resolve(NONE);
      if (!refresh && cached && d.now() - cached.at < ttl) return Promise.resolve(cached.result);
      running ??= withDeadline(scan(), deadline)
        .then((found) => {
          const result = { apps: mergeApps(found), available: true };
          cached = { at: d.now(), result };
          return result;
        })
        .catch(() => NONE) // a failed scan is not cached: the next open tries again
        .finally(() => {
          running = undefined;
        });
      return running;
    },
  };
}

/** A fixed list from JSON (a test run); a value that is not a list of {key, name} gives an empty, available list. */
export function fixedInstalledApps(json: string): InstalledApps {
  let found: InstalledApp[] = [];
  try {
    const raw: unknown = JSON.parse(json);
    if (Array.isArray(raw)) found = raw.filter((a): a is InstalledApp => typeof a?.key === "string" && typeof a?.name === "string");
  } catch {
    // not JSON: the list stays empty
  }
  const result = { apps: mergeApps(found), available: true };
  return { list: () => Promise.resolve(result) };
}
