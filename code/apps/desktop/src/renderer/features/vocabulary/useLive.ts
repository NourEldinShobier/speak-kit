import { useEffect, useRef, useState } from "react";

/**
 * A list kept in the app's settings, edited without waiting for the answer. Every edit starts from the latest edit, not from what the page last
 * received, so two quick deletes cannot bring the first row back; the settings' own answer takes over once no save is outstanding.
 */
export function useLive<T>(server: readonly T[], save: (next: T[]) => Promise<unknown>): [T[], (change: (current: T[]) => T[]) => void] {
  const latest = useRef<T[]>([...server]);
  const fromServer = useRef(server);
  const pending = useRef(0);
  const [, render] = useState(0);
  fromServer.current = server;
  if (pending.current === 0) latest.current = [...server];
  useEffect(() => {
    // A save that ended after the page unmounted must not touch state.
    return () => void (pending.current = 0);
  }, []);
  const update = (change: (current: T[]) => T[]) => {
    latest.current = change(latest.current);
    pending.current++;
    render((n) => n + 1);
    const done = () => {
      pending.current = Math.max(0, pending.current - 1);
      if (pending.current === 0) latest.current = [...fromServer.current];
      render((n) => n + 1);
    };
    void save(latest.current).then(done, done);
  };
  return [latest.current, update];
}
