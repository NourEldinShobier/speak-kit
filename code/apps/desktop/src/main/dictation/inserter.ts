import { profileFor } from "./app-profile";
import { createRestoreGuard, type ClipboardPort, type RestoreGuard } from "./restore-guard";
import type { AppOverride, CopyReason, ForegroundInfo, InputPort, InsertOptions, InsertResult, PasteKey, PasteProfile } from "./types";

interface Deps {
  input: InputPort;
  clip: ClipboardPort;
  /** Read at every insert, so a change in the settings applies to the next paste. */
  overrides?: readonly AppOverride[] | (() => readonly AppOverride[]) | undefined;
  sleep?: ((ms: number) => Promise<void>) | undefined;
  /** False on a platform without key injection: every insert then only copies. */
  supported?: boolean | undefined;
}

/** How long to wait for the user to let go of Shift, Alt and Win before giving up and copying instead: Ctrl+V with Shift held is a different shortcut. */
const MODIFIER_WAIT_MS = 1500;
const MODIFIER_POLL_MS = 10;

const pasteKey = (shortcut: PasteProfile["shortcut"]): PasteKey => (shortcut === "ctrl-shift-v" || shortcut === "shift-insert" ? shortcut : "ctrl-v");
const copied = (reason: CopyReason): InsertResult => ({ status: "copied", reason });
const clipboardFailed: InsertResult = { status: "failed", reason: "clipboard-unavailable" };

/**
 * Gets text into the focused field of another program: copy, Ctrl+V as scan codes, put the old clipboard back. Every way the paste cannot be trusted
 * (other window, higher-rights window, keys refused, keys still held) ends with the text on the clipboard and a result that says so, never a
 * claim of success. Calls run one after another, so two dictations that finish together paste in order.
 */
export class Inserter {
  readonly #input: InputPort;
  readonly #clip: ClipboardPort;
  readonly #overrides: () => readonly AppOverride[];
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #supported: boolean;
  readonly #guard: RestoreGuard;
  #chain: Promise<unknown> = Promise.resolve();
  #stopTyping = false;

  constructor({ input, clip, overrides, supported = true, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }: Deps) {
    this.#input = input;
    this.#clip = clip;
    this.#overrides = typeof overrides === "function" ? overrides : () => overrides ?? [];
    this.#sleep = sleep;
    this.#supported = supported;
    this.#guard = createRestoreGuard(clip);
  }

  insert(text: string, opts: InsertOptions = {}): Promise<InsertResult> {
    const result = this.#chain.then(() => this.#run(text, opts));
    // The caller gets any error from `result`; the queue only has to move on.
    this.#chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /** Ends typing that is in progress after the piece being sent; the whole text then stays on the clipboard. Does nothing when nothing is being typed. */
  cancelTyping(): void {
    this.#stopTyping = true;
  }

  /** Resolves once the old clipboard is back (or will never be restored). */
  settled(): Promise<void> {
    return this.#guard.settled();
  }

  flush(): Promise<void> {
    return this.#guard.flush();
  }

  async #run(text: string, opts: InsertOptions): Promise<InsertResult> {
    if (!this.#supported) return this.#copyOnly(text, "unsupported-platform");
    const fg = this.#input.foreground();
    if (opts.mode === "copy" || profileFor(fg, this.#overrides()).shortcut === "copy") return this.#copyOnly(text, "copy-only");
    const blocked = this.#veto(fg, opts.target);
    if (blocked === "password-field") return { status: "refused", reason: blocked };
    if (blocked || !fg) return this.#copyOnly(text, blocked ?? "no-foreground");
    return this.#send(text, fg, opts);
  }

  /** Reasons not to send keys to this window at all, before the clipboard is touched. */
  #veto(fg: ForegroundInfo | null, target: string | undefined): CopyReason | "password-field" | null {
    if (!fg) return "no-foreground";
    if (target !== undefined && fg.hwnd !== target) return "foreground-changed";
    if (fg.elevated) return "elevated-target";
    if (this.#input.passwordFocused()) return "password-field";
    return this.#input.secureInput?.() ? "secure-input" : null;
  }

  async #send(text: string, fg: ForegroundInfo, opts: InsertOptions): Promise<InsertResult> {
    const profile = profileFor(fg, this.#overrides());
    // A clipboard that cannot be put back (copied files) is left alone: the text is typed instead of pasted.
    const typing = opts.mode === "type" || profile.shortcut === "type" || (opts.mode !== "keep" && (await this.#clip.restorable?.()) === false);
    if (!(await this.#releaseModifiers())) return this.#copyOnly(text, "modifiers-held");
    if (!typing && !(await this.#stage(text))) return clipboardFailed;
    if (profile.preDelayMs) await this.#sleep(profile.preDelayMs);
    if (this.#input.foreground()?.hwnd !== fg.hwnd) return this.#keepCopy(text, typing, "foreground-changed");
    if (typing) {
      this.#stopTyping = false;
      const how = await this.#input.type(text, () => this.#stopTyping);
      this.#stopTyping = false;
      if (how === "stopped") return this.#keepCopy(text, true, "typing-stopped");
      return how === "done" ? { status: "typed" } : this.#keepCopy(text, true, "keys-rejected");
    }
    if (!this.#input.pressPaste(pasteKey(profile.shortcut))) return this.#keepCopy(text, false, "keys-rejected");
    if (opts.mode === "keep") this.#guard.keep();
    else this.#guard.restoreAfter(profile.restoreDelayMs);
    return { status: "pasted" };
  }

  async #stage(text: string): Promise<boolean> {
    try {
      await this.#guard.stage(text);
      return true;
    } catch {
      await this.#guard.flush();
      return false;
    }
  }

  async #releaseModifiers(): Promise<boolean> {
    for (let waited = 0; waited <= MODIFIER_WAIT_MS; waited += MODIFIER_POLL_MS) {
      if (this.#input.heldModifiers().length === 0) return true;
      await this.#sleep(MODIFIER_POLL_MS);
    }
    return false;
  }

  async #copyOnly(text: string, reason: CopyReason): Promise<InsertResult> {
    try {
      await this.#clip.writeText(text);
    } catch {
      return clipboardFailed;
    }
    return copied(reason);
  }

  /** The paste did not happen: the text stays on the clipboard (put there now when typing never staged it). */
  async #keepCopy(text: string, typing: boolean, reason: CopyReason): Promise<InsertResult> {
    if (typing) return this.#copyOnly(text, reason);
    this.#guard.keep();
    return copied(reason);
  }
}

export const createInserter = (deps: Deps): Inserter => new Inserter(deps);
