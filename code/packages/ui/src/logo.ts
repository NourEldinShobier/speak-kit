import { LOGO_COLORS, LOGO_FULL, LOGO_SMALL, type LogoVariant } from "./logo-data";

export { LOGO_COLORS };
/** Id of the squircle clipPath inside every logo svg; all copies define the same shape, so sharing the id is safe. */
export const LOGO_CLIP_ID = "lm-logo-clip";
/** The Voice hub paths on a 1024 canvas: the bolder small variant at 32 px and below, the full one above. */
export const logoVariant = (size: number): LogoVariant => (size <= 32 ? LOGO_SMALL : LOGO_FULL);
