import { useCallback, useEffect, useRef, useState } from "react";
import { SETTINGS_KEY, TOKEN_KEY } from "@speakkit/protocol";
import { parseSettings } from "./schema";
import { readSettings, readToken, watchKey, writeSettings, writeToken } from "./storage";
import { defaultSettings, type Settings } from "./types";

export interface SettingsApi {
  settings: Settings;
  ready: boolean;
  saved: boolean;
  update: (fn: (s: Settings) => Settings) => void;
  reset: (fn: (d: Settings, s: Settings) => Settings) => void;
}

/** Settings from chrome.storage.sync with live updates. Writes are applied locally at once and saved after 200 ms of quiet. */
export function useSettings(): SettingsApi {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const cur = useRef(settings);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    let live = true;
    readSettings().then((s) => {
      if (live) {
        cur.current = s;
        setSettings(s);
        setReady(true);
      }
    });
    const off = watchKey("sync", SETTINGS_KEY, (v) => {
      const s = parseSettings(v);
      cur.current = s;
      setSettings(s);
    });
    return () => {
      live = false;
      off();
      clearTimeout(timer.current);
    };
  }, []);
  const update = useCallback((fn: (s: Settings) => Settings) => {
    const next = fn(cur.current);
    cur.current = next;
    setSettings(next);
    setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => writeSettings(cur.current).then(() => setSaved(true), () => {}), 200);
  }, []);
  const reset = useCallback((fn: (d: Settings, s: Settings) => Settings) => update((s) => fn(defaultSettings(), s)), [update]);
  return { settings, ready, saved, update, reset };
}

/** Pairing token from chrome.storage.local. */
export function useToken(): { token: string; ready: boolean; set: (t: string) => void } {
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    readToken().then((t) => {
      if (live) {
        setToken(t);
        setReady(true);
      }
    });
    const off = watchKey("local", TOKEN_KEY, (v) => setToken(typeof v === "string" ? v : ""));
    return () => {
      live = false;
      off();
    };
  }, []);
  const set = useCallback((t: string) => {
    setToken(t);
    void writeToken(t);
  }, []);
  return { token, ready, set };
}
