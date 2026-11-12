/** One control of the window in front, in document order, as the system's accessibility tree reports it. `value` is deliberately not part of this. */
export interface UiNode {
  /** The platform's role name: "ControlType.Button" on Windows, "AXButton" on macOS. */
  role: string;
  /** The label the system gives the control. */
  name?: string | undefined;
  /** A password field: it and everything inside it is skipped. */
  secure?: boolean | undefined;
  depth: number;
}

/** Roles whose name is a label (what the control is called), not content. Text, documents, list and tree items hold what the person is working on and are left out. */
const LABEL_ROLES = new Set(["window", "button", "menuitem", "tabitem", "checkbox", "radiobutton", "combobox", "popupbutton", "hyperlink", "link", "edit", "textfield", "slider", "toolbar", "menu"]);
const SECURE_ROLES = new Set(["securetextfield"]);

export const MAX_LABELS = 120;
export const MAX_LABEL_CHARS = 80;
export const MAX_TEXT_CHARS = 2000;

const roleOf = (role: string): string =>
  role
    .replace(/^ControlType\./i, "")
    .replace(/^AX/, "")
    .toLowerCase();

/**
 * The labels of the controls in front, one per line in reading order: names only, never values, never a password field or anything inside one,
 * no duplicates, each cut to 80 characters and the whole to 2000. Anything that is not a label role (text, documents, list items) is not read.
 */
export function labelsOf(nodes: readonly UiNode[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  let skipBelow: number | undefined;
  for (const n of nodes) {
    if (skipBelow !== undefined && n.depth > skipBelow) continue;
    skipBelow = undefined;
    const role = roleOf(n.role);
    if (n.secure || SECURE_ROLES.has(role)) {
      skipBelow = n.depth;
      continue;
    }
    const name = n.name?.replace(/\s+/g, " ").trim();
    if (!name || !LABEL_ROLES.has(role)) continue;
    const label = name.length > MAX_LABEL_CHARS ? `${name.slice(0, MAX_LABEL_CHARS - 1)}…` : name;
    const line = `${role}: ${label}`;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= MAX_LABELS) break;
  }
  return out.join("\n").slice(0, MAX_TEXT_CHARS);
}
