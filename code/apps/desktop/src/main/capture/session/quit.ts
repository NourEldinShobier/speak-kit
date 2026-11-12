import type { Session } from ".";

/** At quit: a recording is stopped and saved, and the returned promise resolves when it is (or after `waitMs`). Undefined when nothing is running. */
export function finishForQuit(session: Pick<Session, "state" | "stop" | "idle">, waitMs: number): Promise<void> | undefined {
  const { phase } = session.state;
  if (phase === "recording") session.stop();
  else if (phase !== "finishing") return undefined;
  return Promise.race([session.idle(), new Promise<void>((r) => setTimeout(r, waitMs))]);
}
