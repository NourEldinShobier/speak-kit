import type { CSSProperties, ReactNode } from "react";
import { ICON_DATA, iconAttrs, type IconName } from "../icons";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export interface IconProps {
  name: IconName;
  /** px; the stroke stays 1.5px on screen at any size. */
  size?: number;
  className?: string | undefined;
}

/** Outline icon. Same markup as vanilla icon(): display:block, centred by the flex parent. */
export function Icon({ name, size = 16, className }: IconProps): ReactNode {
  const a = iconAttrs(name, size);
  return (
    <svg className={cx(a.class, className)} style={{ "--s": size } as CSSProperties} viewBox={a.viewBox} aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: ICON_DATA[name] }} />
  );
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return <Icon name="loader-2" size={size} className={cx("lm-spin", className)} />;
}
