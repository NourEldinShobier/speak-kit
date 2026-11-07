/// <reference types="chrome" />
import { SETTINGS_KEY, type ContentToBg } from "@speakkit/protocol";
import { defaultSettings, withDefaults, type Settings } from "../../features/settings";
import type { HealthResult } from "../../shared/client";
import type { ExtraToBg } from "../../shared/internal";

// The content script talks to the extension here: the stored settings and the service worker view of the voice engine.
const CHECK_EVERY_MS = 5000;
const WARM_EVERY_MS = 3000;

type Post = (msg: ContentToBg | ExtraToBg, cb?: (r: unknown) => void) => void;

/** Whether the model is unloaded, and the throttled request to load it ahead of the click. */
export class EngineWake {
  asleep = false;
  private lastCheck = -Infinity;
  private lastWarm = -Infinity;
  private readonly post: Post;
  private readonly onChange: () => void;

  constructor(post: Post, onChange: () => void) {
    this.post = post;
    this.onChange = onChange;
  }

  /** Ask the worker (it caches health for 3 s) whether the model is unloaded, at most every 5 s, so idle surfaces can say "wakes on play". */
  check() {
    const now = performance.now();
    if (now - this.lastCheck < CHECK_EVERY_MS) return;
    this.lastCheck = now;
    this.post({ t: "get-health" }, (r) => {
      const h = r as HealthResult | undefined;
      const asleep = !!h?.ok && h.health.engine.state === "unloaded";
      if (asleep === this.asleep) return;
      this.asleep = asleep;
      this.onChange();
    });
  }

  /** Load the model ahead of the click; hover and selection events are noisy, so at most one request per 3 s leaves the page. */
  warm(reason: "hover" | "selection" | "dock") {
    this.check();
    const now = performance.now();
    if (now - this.lastWarm < WARM_EVERY_MS) return;
    this.lastWarm = now;
    this.post({ t: "warm", reason });
  }
}

/** Stored settings over the defaults. Validation (valibot) happens in the service worker and the extension pages, not in the page. */
const read = async (): Promise<Settings> => withDefaults((await chrome.storage.sync.get(SETTINGS_KEY))[SETTINGS_KEY] as Partial<Settings> | undefined);

export async function loadSettings(): Promise<Settings> {
  try {
    return await read();
  } catch {
    return defaultSettings();
  }
}

/** Applies `mut` to the stored settings and writes them back. Resolves to the saved settings, or undefined when the extension was reloaded. */
export async function saveSettings(mut: (s: Settings) => void): Promise<Settings | undefined> {
  try {
    const s = await read();
    mut(s);
    await chrome.storage.sync.set({ [SETTINGS_KEY]: s });
    return s;
  } catch {
    return undefined;
  }
}
