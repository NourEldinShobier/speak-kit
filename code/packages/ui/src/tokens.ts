// Generated from src/lumen.css by scripts/gen-tokens.ts (pnpm --filter @speakkit/ui gen:tokens). Do not edit.
/** Lumen colour tokens per theme, keyed by custom property name without the leading dashes. For code that cannot read CSS variables (badges, native window colours, pages without lumen.css). */
export const tokens = {
  "dark": {
    "surface-window": "#191a1b",
    "surface-editor": "#121314",
    "surface-card": "#1e1f20",
    "surface-raised": "#252627",
    "surface-input": "#191a1b",
    "stroke-divider": "#2a2b2c",
    "stroke-control": "rgba(255, 255, 255, 0.078)",
    "fill-hover": "rgba(255, 255, 255, 0.078)",
    "fill-selected": "rgba(255, 255, 255, 0.129)",
    "text-primary": "#e6e6e6",
    "text-secondary": "#bfbfbf",
    "text-tertiary": "#8c8c8c",
    "accent-default": "#0078d4",
    "accent-button": "#0078d4",
    "accent-subtle": "rgba(0, 120, 212, 0.4)",
    "text-on-accent": "#ffffff",
    "text-on-highlight": "#1e1f20",
    "tag-blue": "#4a9eff",
    "tag-green": "#4cc38a",
    "tag-orange": "#f5a524",
    "tag-red": "#f2555a",
    "tag-purple": "#a77bf3",
    "tag-yellow": "#f2c04e",
    "lm-ink-sm": "rgba(0, 0, 0, 0.3)",
    "lm-ink-md": "rgba(0, 0, 0, 0.35)"
  },
  "light": {
    "surface-window": "#f3f3f6",
    "surface-editor": "#ffffff",
    "surface-card": "#fafafd",
    "surface-raised": "#ffffff",
    "surface-input": "#ffffff",
    "stroke-divider": "#e2e2e5",
    "stroke-control": "rgba(0, 0, 0, 0.102)",
    "fill-hover": "rgba(0, 0, 0, 0.059)",
    "fill-selected": "rgba(0, 0, 0, 0.11)",
    "text-primary": "#202020",
    "text-secondary": "#3b3b3b",
    "text-tertiary": "#606060",
    "accent-default": "#0069cc",
    "accent-button": "#0069cc",
    "accent-subtle": "rgba(0, 105, 204, 0.122)",
    "text-on-accent": "#ffffff",
    "text-on-highlight": "#1e1f20",
    "tag-blue": "#0a6ed1",
    "tag-green": "#1a7f4b",
    "tag-orange": "#b35c00",
    "tag-red": "#c62828",
    "tag-purple": "#7a4cd9",
    "tag-yellow": "#b8860b",
    "lm-ink-sm": "rgba(0, 0, 0, 0.06)",
    "lm-ink-md": "rgba(0, 0, 0, 0.07)"
  }
} as const;

/** The few tokens native code (Electron window backgrounds, title bar overlay) needs. */
export const nativeTokens = {
  dark: { surfaceWindow: "#191a1b", surfaceCard: "#1e1f20", textPrimary: "#e6e6e6" },
  light: { surfaceWindow: "#f3f3f6", surfaceCard: "#fafafd", textPrimary: "#202020" },
} as const;
