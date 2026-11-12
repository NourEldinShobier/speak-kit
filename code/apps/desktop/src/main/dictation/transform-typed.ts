import { applyRules, soundsLikeRules } from "@speakkit/dictation";
import type { DictationConfig } from "../../shared/dictation/settings";
import { profileFor } from "./app-profile";
import type { ForegroundInfo, InsertOptions, InsertResult } from "./types";

export type TransformResult =
  /** The field now holds the cleaned text. */
  | { status: "changed" }
  | { status: "unchanged" }
  /** The field is empty, so there was nothing to read. */
  | { status: "nothing-selected" }
  /** The field was not touched: a password field, a terminal, a window with higher rights, secure input, or no window. */
  | { status: "blocked"; reason: "password-field" | "terminal" | "elevated" | "secure-input" | "no-window" }
  /** The field was not touched: the two copies differed (the app answered late or the text moved), the window changed, or the paste was refused. */
  | { status: "failed"; reason: "copy-unstable" | "window-changed" | "not-inserted" };

export interface TransformDeps {
  foreground(): ForegroundInfo | null;
  passwordFocused(): boolean;
  secureInput?(): boolean;
  /** Presses select-all in the focused field. */
  selectAll(): Promise<void>;
  /** Copies what is selected and gives it back, putting the clipboard back afterwards; "" when nothing came. */
  copy(): Promise<string>;
  insert(text: string, options: InsertOptions): Promise<InsertResult>;
  /** The dictation rules for text that was typed, not spoken. */
  clean(text: string): string;
  /** Pause between select-all and copy, so the app has selected before it copies. */
  sleep?(ms: number): Promise<void>;
}

const MAC_TERMINALS = ["com.apple.terminal", "com.googlecode.iterm2", "dev.warp.warp-stable", "net.kovidgoyal.kitty", "com.mitchellh.ghostty", "io.alacritty"];
const SELECT_SETTLE_MS = 40;

const isTerminal = (fg: ForegroundInfo): boolean => profileFor(fg).shortcut === "ctrl-shift-v" || MAC_TERMINALS.includes((fg.exe ?? "").toLowerCase());

/**
 * Cleans the text of the focused field with the dictation rules and puts it back. With a selection it cleans the selection; with none it selects the
 * whole field first. The text is read twice and must match before anything is written, so a slow app never gets half a field pasted over it. Never runs
 * in a password field, a terminal, a window with higher rights or a program that blocks keys.
 */
export async function transformTyped(d: TransformDeps): Promise<TransformResult> {
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const fg = d.foreground();
  if (!fg) return { status: "blocked", reason: "no-window" };
  if (d.passwordFocused()) return { status: "blocked", reason: "password-field" };
  if (d.secureInput?.()) return { status: "blocked", reason: "secure-input" };
  if (fg.elevated) return { status: "blocked", reason: "elevated" };
  if (isTerminal(fg)) return { status: "blocked", reason: "terminal" };

  let text = await d.copy();
  if (!text) {
    await d.selectAll();
    await sleep(SELECT_SETTLE_MS);
    text = await d.copy();
  }
  if (!text) return { status: "nothing-selected" };
  if ((await d.copy()) !== text) return { status: "failed", reason: "copy-unstable" };

  const cleaned = d.clean(text);
  if (cleaned === text) return { status: "unchanged" };
  if (d.foreground()?.hwnd !== fg.hwnd) return { status: "failed", reason: "window-changed" };
  const done = await d.insert(cleaned, { target: fg.hwnd, mode: "paste" });
  return done.status === "pasted" ? { status: "changed" } : { status: "failed", reason: "not-inserted" };
}

/** The dictation rules applied to typed text: fillers, replacements, vocabulary spellings and capitals; spoken symbols and the trailing space belong to speech only. */
export const typedTextRules =
  (c: Pick<DictationConfig, "replacements" | "terms" | "cleanup" | "language">) =>
  (text: string): string =>
    applyRules(text, {
      fillers: c.cleanup.fillers,
      spokenSymbols: false,
      spokenFormatting: false,
      autoCapitalize: c.cleanup.autoCapitalize,
      trailingSpace: false,
      lowercase: c.cleanup.lowercase,
      stripFinalStop: c.cleanup.stripFinalStop,
      replacements: [...c.replacements, ...soundsLikeRules(c.terms)],
      language: c.language,
    });
