import { isActive, learnFromField, learnFromSelection, remember, removeCorrection, confirmCorrections, type Candidate, type Correction } from "@speakkit/dictation";
import { at } from "../../shared/i18n";
import "../../shared/i18n/packs/main";
import type { FieldValue } from "./caret-reader";
import type { HudPresenter } from "./hud-presenter";
import { isTerminal } from "./terminals";

/** The last dictation is the one the person just fixed only when it is this recent. */
export const RECENT_MS = 10 * 60_000;

/** What reading the window in front needs from the system. Nothing it returns is kept. */
export interface WindowPorts {
  /** The id, inserted text and time of the newest dictation. */
  last(): Promise<{ id: string; text: string; at: number } | undefined>;
  /** The program in front, or null when it cannot be told. */
  foreground(): { elevated: boolean; exe: string | null } | null;
  passwordFocused(): boolean;
  /** The whole text of the focused field; a password field says so; undefined when it cannot be read. */
  readValue(): Promise<FieldValue | undefined>;
  /** The text selected in the program in front, through a copy; "" when nothing is selected. */
  selection(): Promise<string>;
}

/** `source` names the dictation the fixes were found in, so one dictation is counted once. */
export type Learned = { fixes: Candidate[]; source: string } | { none: "no-dictation" | "refused" | "terminal" | "nothing" };

/**
 * The fixes the person made to the last dictation, read once from the window in front: the focused field's text when the dictation is found in it,
 * else the selection. A password field or a program with higher rights is never read, and no copy key is sent into a terminal, where it would stop the command.
 */
export async function learnFromWindow(p: WindowPorts, now: number): Promise<Learned> {
  const last = await p.last();
  if (!last || now - last.at > RECENT_MS) return { none: "no-dictation" };
  const front = p.foreground();
  if (!front || front.elevated || p.passwordFocused()) return { none: "refused" };
  const field = await p.readValue();
  if (field && "password" in field) return { none: "refused" };
  const fromField = field ? learnFromField(last.text, field.text) : undefined;
  if (fromField === undefined && isTerminal(front.exe)) return { none: "terminal" };
  const fixes = fromField ?? learnFromSelection(last.text, await p.selection());
  return fixes.length ? { fixes, source: last.id } : { none: "nothing" };
}

interface Deps {
  ports: WindowPorts;
  presenter: Pick<HudPresenter, "toast" | "offer">;
  corrections(): Correction[];
  save(list: Correction[]): void;
  now(): number;
}

const sameWords = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * The Learn correction key: reads the fixes, keeps them as suggestions, and offers a button in the pill. A fix seen a second time starts to apply
 * on its own, with a button to take it back; a first sighting applies only after the button is pressed.
 */
export class CorrectionLearner {
  readonly #d: Deps;
  #offer: { ids: string[]; kind: "save" | "undo" } | undefined;
  #busy = false;

  constructor(d: Deps) {
    this.#d = d;
  }

  async press(): Promise<void> {
    if (this.#busy) return;
    this.#busy = true;
    try {
      const learned = await learnFromWindow(this.#d.ports, this.#d.now()).catch(() => ({ none: "refused" }) as const);
      if ("none" in learned) this.#d.presenter.toast(at(`hud.learn.${learned.none}`), "error");
      else this.#keep(learned);
    } finally {
      this.#busy = false;
    }
  }

  #keep({ fixes, source }: { fixes: Candidate[]; source: string }): void {
    const before = this.#d.corrections();
    let list = before;
    for (const fix of fixes) list = remember(list, fix, { now: this.#d.now(), source });
    const mine = list.filter((c) => fixes.some((f) => sameWords(f.heard, c.heard) && f.correct === c.correct));
    const started = mine.filter((c) => isActive(c) && !before.some((b) => b.id === c.id && isActive(b)));
    this.#d.save(list);
    this.#offer = { ids: (started.length ? started : mine).map((c) => c.id), kind: started.length ? "undo" : "save" };
    const [first] = mine;
    if (!first) return;
    const text = this.#offer.kind === "undo" ? this.#learned(first, mine.length) : this.#ask(first, mine.length);
    this.#d.presenter.offer(text, this.#offer.kind === "undo" ? { label: at("hud.undo"), id: "learn-undo" } : { label: at("hud.learn.remember"), id: "learn-save" });
  }

  #ask(c: Correction, n: number): string {
    return n === 1 ? at("hud.learn.ask", { heard: c.heard, correct: c.correct }) : at("hud.learn.askMany", { count: n });
  }

  #learned(c: Correction, n: number): string {
    return n === 1 ? at("hud.learn.done", { heard: c.heard, correct: c.correct }) : at("hud.learn.doneMany", { count: n });
  }

  /** The button on a first sighting: the fixes are kept for good. */
  save(): void {
    if (this.#offer?.kind !== "save") return;
    this.#d.save(confirmCorrections(this.#d.corrections(), this.#offer.ids));
    this.#offer = undefined;
  }

  /** The button on a fix that began to apply by itself: it goes. */
  undo(): void {
    if (this.#offer?.kind !== "undo") return;
    this.#d.save(this.#offer.ids.reduce(removeCorrection, this.#d.corrections()));
    this.#offer = undefined;
  }
}
