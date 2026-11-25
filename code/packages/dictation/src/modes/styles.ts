import type { Mode } from "./modes";
import { MAX_STYLE_LINE, MAX_STYLE_NAME, MAX_STYLE_PROMPT, MAX_STYLES, type CustomStyle, type Template } from "./templates";

/** What the person types in the style form. */
export interface StyleDraft {
  name: string;
  line: string;
  prompt: string;
  keepsLists: boolean;
}

export type StyleError = "no-name" | "name-too-long" | "line-too-long" | "no-prompt" | "prompt-too-long";

const size = (text: string): number => [...text.trim()].length;

/** Why the form cannot be saved yet, or nothing when it can. */
export function styleDraftError(d: StyleDraft): StyleError | undefined {
  if (!size(d.name)) return "no-name";
  if (size(d.name) > MAX_STYLE_NAME) return "name-too-long";
  if (size(d.line) > MAX_STYLE_LINE) return "line-too-long";
  if (!size(d.prompt)) return "no-prompt";
  if (size(d.prompt) > MAX_STYLE_PROMPT) return "prompt-too-long";
  return undefined;
}

/** A new id, "u-" and random letters and digits, that no style in the list has. */
function freshId(styles: readonly CustomStyle[]): string {
  const id = `u-${Math.random().toString(36).slice(2, 10).padEnd(6, "0")}`;
  return styles.some((s) => s.id === id) ? freshId(styles) : id;
}

/** The list with the draft saved: as a new style, or in place of the one `id` names. Undefined when the draft is not valid or a new style does not fit. */
export function saveStyle(styles: readonly CustomStyle[], draft: StyleDraft, id?: string): CustomStyle[] | undefined {
  if (styleDraftError(draft)) return undefined;
  const fields = { name: draft.name.trim(), line: draft.line.trim(), prompt: draft.prompt.trim(), keepsLists: draft.keepsLists };
  if (id && styles.some((s) => s.id === id)) return styles.map((s) => (s.id === id ? { id, ...fields } : s));
  return styles.length >= MAX_STYLES ? undefined : [...styles, { id: freshId(styles), ...fields }];
}

export const removeStyle = (styles: readonly CustomStyle[], id: string): CustomStyle[] => styles.filter((s) => s.id !== id);

/** The form filled with a style to copy from: a built-in template or one of the person's own. */
export const copyOf = (from: Pick<Template, "name" | "line" | "prompt" | "keepsLists">): StyleDraft => ({
  name: [...`${from.name} copy`].slice(0, MAX_STYLE_NAME).join(""),
  line: from.line,
  prompt: from.prompt,
  keepsLists: from.keepsLists,
});

/** Where a style is in use: the names of the modes that pick it, and "Apps in no mode" when it is the default style. */
export function styleUsers(id: string, modes: readonly Mode[], rewriteDefault: string): string[] {
  return [...(rewriteDefault === id ? ["Apps in no mode"] : []), ...modes.filter((m) => m.template === id).map((m) => m.name)];
}
