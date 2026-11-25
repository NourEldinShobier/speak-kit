import { sendsToModel, type Term } from "./terms";

export const PROMPT_BUDGET = 500;

export interface PromptPlan {
  /** What goes to the speech model. */
  text: string;
  /** Characters used, and the budget they are counted against. */
  used: number;
  budget: number;
  included: number;
  /** Words that did not fit; they still work through the swap pass. */
  dropped: number;
}

/** The words of entries that are sent to the model, in list order, joined by ", ", until the character budget is full. A word is never cut in half. */
export function buildPrompt(terms: readonly Term[], budget = PROMPT_BUDGET): PromptPlan {
  const words = terms.filter(sendsToModel).map((t) => t.word);
  let text = "";
  let included = 0;
  for (const word of words) {
    const next = text ? `${text}, ${word}` : word;
    if ([...next].length > budget) break;
    text = next;
    included++;
  }
  return { text, used: [...text].length, budget, included, dropped: words.length - included };
}

/** The models that read a prompt. Others drop it and say so; dictation and settings go on. */
const PROMPT_MODELS: readonly string[] = ["large-v3-turbo-q5_0"];
export const supportsPrompt = (model: string): boolean => PROMPT_MODELS.includes(model);

/** The prompt to send for `model`: empty, with `unsupported` set, when the model cannot take one. Empty and quiet when the switch is off. */
export function promptFor(model: string, terms: readonly Term[], on: boolean): { prompt: string; unsupported: boolean } {
  if (!on || !terms.length) return { prompt: "", unsupported: false };
  if (!supportsPrompt(model)) return { prompt: "", unsupported: true };
  return { prompt: buildPrompt(terms).text, unsupported: false };
}
