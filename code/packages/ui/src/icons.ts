import { ICON_DATA, type IconName } from "./icon-data";

export { ICON_DATA, type IconName };

/** Inner SVG markup of an outline icon (24x24 viewBox). */
export function iconMarkup(name: IconName): string {
  return ICON_DATA[name];
}

export function isIconName(name: string): name is IconName {
  return name in ICON_DATA;
}

/** Shared by React and vanilla so both produce the same root attributes. */
export function iconAttrs(name: string, size: number) {
  return {
    class: `lm-icon lm-icon--${name}`,
    style: `--s:${size}`,
    viewBox: "0 0 24 24",
    "aria-hidden": "true",
    focusable: "false",
  } as const;
}
