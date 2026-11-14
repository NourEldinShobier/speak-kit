import { exeMatches, windowMatches } from "./providers";
import type { CallSession, Probe, Provider } from "./types";

export type CallEvent = { type: "started"; session: CallSession } | { type: "ended"; sessionId: string; providerId: string };

export interface TrackerOptions {
  providers(): readonly Provider[];
  /** How long the microphone may be quiet before the call counts as over: a mute or a driver restart is not the end. */
  endGraceMs?: number;
}

interface Live {
  session: CallSession;
  lastSeen: number;
}

interface Found {
  provider: Provider;
  pid: number;
  title: string;
}

/**
 * Finds calls from what the OS reports: a process using the microphone, and either that process being a call app or a window of a call app being open.
 * A call is a session of one process in one app: the same app starting another call after the first ended is a new session. The meeting code in a title
 * is never read as a word, and a microphone user that is not a call app is ignored.
 */
export class CallTracker {
  readonly #o: TrackerOptions;
  readonly #live = new Map<string, Live>();
  #seq = 0;

  constructor(o: TrackerOptions) {
    this.#o = o;
  }

  get sessions(): CallSession[] {
    return [...this.#live.values()].map((l) => l.session);
  }

  update(probe: Probe, now: number): CallEvent[] {
    const grace = this.#o.endGraceMs ?? 6_000;
    const events: CallEvent[] = [];
    const seen = new Set<string>();
    for (const found of this.#active(probe)) {
      const key = `${found.provider.id}:${found.pid}`;
      seen.add(key);
      const cur = this.#live.get(key);
      if (cur) {
        cur.lastSeen = now;
        continue;
      }
      const session: CallSession = { id: `${key}:${++this.#seq}`, providerId: found.provider.id, providerName: found.provider.name, pid: found.pid, startedAt: now, title: found.title };
      this.#live.set(key, { session, lastSeen: now });
      events.push({ type: "started", session });
    }
    for (const [key, l] of this.#live) {
      if (seen.has(key) || now - l.lastSeen < grace) continue;
      this.#live.delete(key);
      events.push({ type: "ended", sessionId: l.session.id, providerId: l.session.providerId });
    }
    return events;
  }

  #active(probe: Probe): Found[] {
    const out: Found[] = [];
    const providers = this.#o.providers();
    for (const m of probe.micUsers) {
      const own = probe.windows.filter((w) => w.pid === m.pid);
      for (const p of providers) {
        const w = own.find((x) => windowMatches(p, x));
        if (w) out.push({ provider: p, pid: m.pid, title: w.title });
        else if (exeMatches(p, m.exe)) out.push({ provider: p, pid: m.pid, title: "" });
      }
    }
    // A call in a browser tab or an installed web app: the microphone belongs to the browser, the title to one of its windows (maybe another process).
    for (const p of providers) {
      if (!p.inBrowser || out.some((o) => o.provider.id === p.id)) continue;
      const w = probe.windows.find((x) => windowMatches(p, x) && probe.micUsers.some((m) => m.exe === x.exe));
      if (w) out.push({ provider: p, pid: w.pid, title: w.title });
    }
    return out.filter((o, i) => out.findIndex((x) => x.provider.id === o.provider.id && x.pid === o.pid) === i);
  }
}
